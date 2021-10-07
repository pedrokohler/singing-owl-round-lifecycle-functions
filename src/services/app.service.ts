import { Injectable, Logger } from '@nestjs/common';
import ICheckArguments from 'src/interfaces/check-arguments.interface';
import { DateTimeService, FirebaseService } from 'src/common';
import { Stage } from 'src/enums/stage.enum';
import ICheckAction from 'src/interfaces/check-action.interface';
import IActionArguments from 'src/interfaces/action.interface';

@Injectable()
export class AppService {
  private readonly checkActionMap: Map<string, ICheckAction>;

  constructor(
    private readonly date: DateTimeService,
    private readonly logger: Logger,
    private readonly firebase: FirebaseService,
  ) {
    this.logger.setContext(AppService.name);
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
    const groupsCollection = await this.firebase.groupsCollection.get();
    await Promise.all(
      groupsCollection.docs.map(async (groupDocument) => {
        const { id: groupId } = groupDocument;
        const { ongoingRound: ongoingRoundId } = groupDocument.data();
        const roundReference = await this.firebase
          .getRoundReference(groupId, ongoingRoundId)
          .get();
        const { evaluationsEndAt, submissionsEndAt, notifications } =
          roundReference.data();

        for (const { check, action } of this.checkActionMap.values()) {
          const result = check({
            notifications,
            submissionsEndAt,
            evaluationsEndAt,
          });
          if (!result) {
            continue;
          }
          return action({
            groupId,
            ongoingRoundId,
          });
        }
      }),
    );
  }

  private async evaluationPeriodFinishedAction({
    groupId,
    ongoingRoundId,
  }): Promise<void> {
    await this.updateNotifications({
      groupId,
      ongoingRoundId,
      stage: Stage.evaluation,
      hours: 0,
    });
    await this.firebase.publishMessageInTopic(
      'gcp.pubsub.roundLifecycleControllerTopic',
      {
        groupId,
        roundId: ongoingRoundId,
      },
    );
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
      await this.updateNotifications({
        groupId,
        ongoingRoundId,
        stage,
        hours,
      });
      await this.firebase.publishMessageInTopic(
        'gcp.pubsub.notificationQueueTopic',
        {
          type: 'periodAboutToFinish',
          params: {
            hours,
            stage,
          },
        },
      );
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
