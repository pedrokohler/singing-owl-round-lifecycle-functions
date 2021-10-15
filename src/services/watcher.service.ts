import { Injectable, Logger } from '@nestjs/common';

import ICheckArguments from 'src/interfaces/check-arguments.interface';
import { DateTimeService, FirebaseService } from 'src/common';
import { Stage } from 'src/enums/stage.enum';
import ICheckAction from 'src/interfaces/check-action.interface';
import IActionArguments from 'src/interfaces/action.interface';
import IRound from 'src/interfaces/round.interface';
import { NotificationTypes } from 'src/enums/notification-types.enum';

@Injectable()
export class WatcherService {
  private readonly possibleHours: number[];
  private readonly checkActionMap: Map<string, ICheckAction>;

  constructor(
    private readonly date: DateTimeService,
    private readonly logger: Logger,
    private readonly firebase: FirebaseService,
  ) {
    this.logger.setContext(WatcherService.name);
    const possibleHours = [0, 2, 8, 24];
    this.possibleHours = possibleHours;

    const evaluationCheckActionMap =
      this.createEvaluationCheckActionMap(possibleHours);
    const submissionCheckActionMap =
      this.createSubmissionCheckActionMap(possibleHours);

    this.checkActionMap = new Map([
      ...evaluationCheckActionMap,
      ...submissionCheckActionMap,
    ]);
  }

  async execute(): Promise<void> {
    this.logger.log({
      message: 'Starting execution of round lifecycle controller',
    });

    const groupsCollection = await this.firebase.groupsCollection.get();
    await Promise.all(
      groupsCollection.docs.map(async (groupDocument) => {
        const { id } = groupDocument;
        const ongoingRound = await this.getGroupOngoingRound(groupDocument);
        return this.doChecksAndMaybeRunAction(id, ongoingRound);
      }),
    );

    this.logger.log({
      message: 'Finished executing round lifecycle watcher',
    });
  }

  private doChecksAndMaybeRunAction(
    groupId: string,
    round: IRound,
  ): Promise<void> {
    const {
      notifications,
      submissionsEndAt,
      evaluationsEndAt,
      id: roundId,
    } = round;

    for (const [key, { check, action }] of this.checkActionMap.entries()) {
      const result = check({
        notifications,
        submissionsEndAt,
        evaluationsEndAt,
      });

      if (!result) {
        this.logger.debug({
          message: `Skipping action for ${key}`,
        });
        continue;
      }

      this.logger.debug({
        message: `Executing action for ${key}`,
      });
      return action({
        groupId,
        roundId,
      });
    }

    return Promise.resolve();
  }

  private async getGroupOngoingRound(groupDocument): Promise<IRound> {
    const { id: groupId } = groupDocument;
    const { ongoingRound: ongoingRoundId } = groupDocument.data();
    const roundReference = await this.firebase
      .getRoundReference(groupId, ongoingRoundId)
      .get();

    const round = {
      ...roundReference.data(),
      id: roundReference.id,
    } as IRound;

    const { evaluationsEndAt, submissionsEndAt, notifications } = round;

    this.logger.log({
      message: 'Got ongoingRound data',
      metadata: {
        groupId,
        ongoingRoundId,
        evaluationsEndAt: evaluationsEndAt.toDate(),
        submissionsEndAt: submissionsEndAt.toDate(),
        notifications,
      },
    });

    return round;
  }

  private async evaluationPeriodFinishedAction({
    groupId,
    roundId,
  }: IActionArguments): Promise<void> {
    this.logger.log({
      message: 'Publishing pubsub message to the round lifecycle controller',
    });
    await this.firebase.publishMessageInTopic(
      'gcp.pubsub.roundLifecycleControllerTopic',
      {
        groupId,
        roundId,
      },
    );
    this.logger.log({
      message:
        'Finished publishing pubsub message to the round lifecycle controller',
    });

    await this.updateNotifications({
      groupId,
      roundId,
      stage: Stage.evaluation,
      hours: 0,
    });
  }

  private checkPeriodAboutToFinish(hours, stage: Stage) {
    return ({
      notifications,
      evaluationsEndAt,
      submissionsEndAt,
    }: ICheckArguments) => {
      if (
        this.hasSameOrSubsequentNotificationBeenSent(
          hours,
          stage,
          notifications,
        )
      ) {
        return false;
      }

      const timeLimit =
        stage === Stage.evaluation ? evaluationsEndAt : submissionsEndAt;
      const now = this.date.current.toMillis();
      const hoursInMilliseconds = hours * 60 * 60 * 1000;
      return now > timeLimit.toMillis() - hoursInMilliseconds;
    };
  }

  private hasSameOrSubsequentNotificationBeenSent(hours, stage, notifications) {
    if (!notifications) {
      return false;
    }

    const wasSubsequentNotificationSent = this.getAllSubsequentNotificationTags(
      hours,
      stage,
    ).some((tag) => notifications[tag]);

    return wasSubsequentNotificationSent;
  }

  private getAllSubsequentNotificationTags(hours, stage) {
    if (stage === Stage.evaluation) {
      return this.getSubsequentNotificationTagsOfSameType(hours, stage);
    }

    const allEvaluationNotificationTags = this.possibleHours.map((hour) =>
      this.getNotificationTag(Stage.evaluation, hour),
    );

    const subsequentSubmissionNotificationTags =
      this.getSubsequentNotificationTagsOfSameType(hours, stage);

    return [
      ...allEvaluationNotificationTags,
      ...subsequentSubmissionNotificationTags,
    ];
  }

  private getSubsequentNotificationTagsOfSameType(hours, stage) {
    return this.possibleHours
      .filter((hour) => hour <= hours)
      .map((hour) => this.getNotificationTag(stage, hour));
  }

  private periodAboutToFinishAction(hours, stage: Stage) {
    return async ({ groupId, roundId }: IActionArguments): Promise<void> => {
      this.logger.log({
        message: 'Publishing pubsub message to the notification queue',
      });
      await this.firebase.publishMessageInTopic(
        'gcp.pubsub.notificationQueueTopic',
        {
          type: NotificationTypes.periodAboutToFinish,
          params: {
            hours,
            stage,
            groupId,
          },
        },
      );
      this.logger.log({
        message: 'Finished publishing pubsub message to the notification queue',
      });

      await this.updateNotifications({
        groupId,
        roundId,
        stage,
        hours,
      });
    };
  }

  private createEvaluationCheckActionMap(possibleHours: number[]) {
    const nonZeroHours = possibleHours.filter((hour) => hour !== 0);
    const checkActions = nonZeroHours.map<[string, ICheckAction]>((hour) =>
      this.createCheckActionPayload(Stage.evaluation, hour),
    );

    return new Map([
      [
        'evaluationPeriodAboutToFinish(0)',
        {
          check: this.checkPeriodAboutToFinish(0, Stage.evaluation).bind(this),
          action: this.evaluationPeriodFinishedAction.bind(this),
        },
      ],
      ...checkActions,
    ]);
  }

  private createSubmissionCheckActionMap(possibleHours: number[]) {
    const checkActions = possibleHours.map<[string, ICheckAction]>((hour) =>
      this.createCheckActionPayload(Stage.submission, hour),
    );

    return new Map([...checkActions]);
  }

  private createCheckActionPayload(stage: Stage, hour): [string, ICheckAction] {
    return [
      `${stage}PeriodAboutToFinish(${hour})`,
      {
        check: this.checkPeriodAboutToFinish(hour, stage).bind(this),
        action: this.periodAboutToFinishAction(hour, stage).bind(this),
      },
    ];
  }

  private async updateNotifications({ groupId, roundId, stage, hours }) {
    await this.firebase.getRoundReference(groupId, roundId).update({
      [`notifications.${this.getNotificationTag(stage, hours)}`]: true,
    });
  }

  private getNotificationTag = (stage, hours) =>
    `${stage.toLowerCase()}PeriodAboutToFinish:${hours}`;
}
