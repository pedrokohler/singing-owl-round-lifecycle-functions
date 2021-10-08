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
  private readonly checkActionMap: Map<string, ICheckAction>;

  constructor(
    private readonly date: DateTimeService,
    private readonly logger: Logger,
    private readonly firebase: FirebaseService,
  ) {
    this.logger.setContext(WatcherService.name);
    this.checkActionMap = new Map([
      [
        'evaluationPeriodAboutToFinish(0)',
        {
          check: this.checkPeriodAboutToFinish(0, Stage.evaluation).bind(this),
          action: this.evaluationPeriodFinishedAction.bind(this),
        },
      ],
      [
        'evaluationPeriodAboutToFinish(2)',
        {
          check: this.checkPeriodAboutToFinish(2, Stage.evaluation).bind(this),
          action: this.periodAboutToFinishAction(2, Stage.evaluation).bind(
            this,
          ),
        },
      ],
      [
        'evaluationPeriodAboutToFinish(8)',
        {
          check: this.checkPeriodAboutToFinish(8, Stage.evaluation).bind(this),
          action: this.periodAboutToFinishAction(8, Stage.evaluation).bind(
            this,
          ),
        },
      ],
      [
        'evaluationPeriodAboutToFinish(24)',
        {
          check: this.checkPeriodAboutToFinish(24, Stage.evaluation).bind(this),
          action: this.periodAboutToFinishAction(24, Stage.evaluation).bind(
            this,
          ),
        },
      ],
      [
        'submissionPeriodAboutToFinish(0)',
        {
          check: this.checkPeriodAboutToFinish(0, Stage.submission).bind(this),
          action: this.periodAboutToFinishAction(0, Stage.submission).bind(
            this,
          ),
        },
      ],
      [
        'submissionPeriodAboutToFinish(2)',
        {
          check: this.checkPeriodAboutToFinish(2, Stage.submission).bind(this),
          action: this.periodAboutToFinishAction(2, Stage.submission).bind(
            this,
          ),
        },
      ],
      [
        'submissionPeriodAboutToFinish(8)',
        {
          check: this.checkPeriodAboutToFinish(8, Stage.submission).bind(this),
          action: this.periodAboutToFinishAction(8, Stage.submission).bind(
            this,
          ),
        },
      ],
      [
        'submissionPeriodAboutToFinish(24)',
        {
          check: this.checkPeriodAboutToFinish(24, Stage.submission).bind(this),
          action: this.periodAboutToFinishAction(24, Stage.submission).bind(
            this,
          ),
        },
      ],
    ]);
  }

  async execute(): Promise<void> {
    this.logger.log({
      message: 'Starting execution of round lifecycle controller',
    });

    const groupsCollection = await this.firebase.groupsCollection.get();
    await Promise.all(
      groupsCollection.docs.map(async (groupDocument) => {
        const { id: groupId } = groupDocument;
        const ongoingRound = await this.getGroupOngoingRound(groupDocument);
        const {
          id: ongoingRoundId,
          evaluationsEndAt,
          submissionsEndAt,
          notifications,
        } = ongoingRound;

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
            ongoingRoundId,
          });
        }

        this.logger.log({
          message: 'Finished executing round lifecycle watcher',
        });
      }),
    );
  }

  private async getGroupOngoingRound(groupDocument): Promise<IRound> {
    const { id: groupId } = groupDocument;
    const { ongoingRound: ongoingRoundId } = groupDocument.data();
    const roundReference = await this.firebase
      .getRoundReference(groupId, ongoingRoundId)
      .get();

    const group = {
      ...roundReference.data(),
      id: roundReference.id,
    } as IRound;

    return group;
  }

  private async evaluationPeriodFinishedAction({
    groupId,
    ongoingRoundId,
  }): Promise<void> {
    this.logger.log({
      message: 'Publishing pubsub message to the round lifecycle controller',
    });
    await this.firebase.publishMessageInTopic(
      'gcp.pubsub.roundLifecycleControllerTopic',
      {
        groupId,
        roundId: ongoingRoundId,
      },
    );
    this.logger.log({
      message:
        'Finished publishing pubsub message to the round lifecycle controller',
    });

    await this.updateNotifications({
      groupId,
      ongoingRoundId,
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

    const possibleHours = [24, 8, 2, 0];
    const laterNotificationSent = possibleHours
      .filter((hour) => hour <= hours)
      .some((hour) => notifications[this.getNotificationTag(stage, hour)]);
    return laterNotificationSent;
  }

  private periodAboutToFinishAction(hours, stage: Stage) {
    return async ({ groupId, ongoingRoundId }: IActionArguments) => {
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
          },
        },
      );
      this.logger.log({
        message: 'Finished publishing pubsub message to the notification queue',
      });

      await this.updateNotifications({
        groupId,
        ongoingRoundId,
        stage,
        hours,
      });
    };
  }

  private async updateNotifications({ groupId, ongoingRoundId, stage, hours }) {
    await this.firebase.getRoundReference(groupId, ongoingRoundId).update({
      [`notifications.${this.getNotificationTag(stage, hours)}`]: true,
    });
  }

  private getNotificationTag = (stage, hours) =>
    `${stage.toLowerCase()}PeriodAboutToFinish:${hours}`;
}
