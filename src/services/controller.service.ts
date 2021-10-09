import { Injectable, Logger } from '@nestjs/common';

import { Stage } from 'src/enums/stage.enum';
import IHasPeriodFinishedArguments from 'src/interfaces/check-period-finished-arguments.interface';
import IEvaluation from 'src/interfaces/evaluation.interface';
import IGroup from 'src/interfaces/group.interface';
import IControllerMessagePayload from 'src/interfaces/controller-message-payload.interface';
import IRound from 'src/interfaces/round.interface';
import { NotificationTypes } from 'src/enums/notification-types.enum';

import { DateTimeService, FirebaseService } from '../common';
import { ScoreService } from './score.service';

@Injectable()
export class ControllerService {
  constructor(
    private readonly date: DateTimeService,
    private readonly logger: Logger,
    private readonly firebase: FirebaseService,
    private readonly scoreService: ScoreService,
  ) {
    this.logger.setContext(ControllerService.name);
  }

  async execute({
    groupId,
    roundId,
  }: IControllerMessagePayload): Promise<void> {
    this.logger.log({
      message: 'Starting execution of round lifecycle controller',
      metadata: {
        groupId,
        roundId,
      },
    });

    const groupReference = await this.firebase.getGroupReference(groupId).get();
    const group = groupReference.data() as IGroup;

    this.logger.debug({
      message: 'Got group data',
      metadata: {
        group,
      },
    });

    if (group.ongoingRound === roundId) {
      this.logger.debug({
        message:
          "Round received corresponds to the received group's ongoing round. Starting to process round.",
      });
      await this.processRound({ groupId, roundId });
    }

    this.logger.log({
      message: 'Finished executing round lifecycle controller',
    });
  }

  private async processRound({ groupId, roundId }: IControllerMessagePayload) {
    const roundReference = await this.firebase
      .getRoundReference(groupId, roundId)
      .get();
    const round = roundReference.data() as IRound;

    this.logger.debug({
      message: 'Got round data',
      metadata: {
        round,
      },
    });

    const hasEvaluationPeriodFinished = this.hasPeriodFinished({
      stage: Stage.evaluation,
      evaluationsEndAt: round.evaluationsEndAt,
    });
    const hasSubmissionPeriodFinished = this.hasPeriodFinished({
      stage: Stage.submission,
      submissionsEndAt: round.submissionsEndAt,
    });

    if (hasEvaluationPeriodFinished || this.hasEveryoneVoted(round)) {
      this.logger.debug({
        message: 'End of round has been reached. Starting to finish round.',
        metadata: {
          hasEvaluationPeriodFinished,
          hasEveryoneVoted: this.hasEveryoneVoted(round),
        },
      });
      return await this.finishRound(groupId, roundId);
    }

    if (
      hasSubmissionPeriodFinished === false &&
      this.hasEveryoneSubmittedAllSongs(round)
    ) {
      this.logger.debug({
        message:
          'End of submission period has been reached. Starting to force the beginning of the evaluation period.',
        metadata: {
          hasSubmissionPeriodFinished,
          hasEveryoneSubmitted: this.hasEveryoneSubmittedAllSongs(round),
        },
      });
      return await this.forceStartEvaluationPeriod(groupId, roundId);
    }
  }

  private hasEveryoneVoted(round: IRound) {
    return round.voteCount === round.users.length;
  }

  private hasEveryoneSubmittedAllSongs(round: IRound) {
    const songIncrement = round.lastWinner ? 1 : 0;
    const maximumAmountOfSongs = round.users.length + songIncrement;
    return round.songs.length === maximumAmountOfSongs;
  }

  private async finishRound(groupId: string, roundId: string) {
    const winner = await this.defineRoundWinner(groupId, roundId);
    await this.updateRoundEvaluationsEndAt(groupId, roundId);
    await this.startNewRound(groupId, winner);
    await this.firebase.publishMessageInTopic(
      'gcp.pubsub.notificationQueueTopic',
      {
        type: NotificationTypes.evaluationPeriodFinished,
        params: {
          winner,
          groupId,
        },
      },
    );
    return;
  }

  private async defineRoundWinner(groupId: string, roundId: string) {
    const evaluationsSnapshot = await this.firebase
      .getEvaluationsReference(groupId)
      .where('round', '==', roundId)
      .get();
    const evaluations = evaluationsSnapshot.docs.map((evaluation) =>
      evaluation.data(),
    ) as IEvaluation[];
    return this.scoreService.computeRoundWinner(evaluations);
  }

  private updateRoundEvaluationsEndAt = async (
    groupId: string,
    roundId: string,
  ) => {
    const now = this.firebase.now;
    const roundReference = this.firebase.getRoundReference(groupId, roundId);
    await roundReference.update({ evaluationsEndAt: now });
  };

  private startNewRound = async (groupId, lastWinner) => {
    const groupReference = this.firebase.getGroupReference(groupId);

    const group = await groupReference.get();
    const { users } = group.data();

    const round = await groupReference.collection('rounds').add(
      this.generateNewRoundPayload({
        users,
        lastWinner,
      }),
    );

    await groupReference.update({
      ongoingRound: round.id,
    });
  };

  private generateNewRoundPayload = ({ users, lastWinner }) => {
    const newRound = {
      submissionsStartAt: this.firebase.now,
      submissionsEndAt: this.firebase.generateTimestamp(
        this.date.getDayOfNextWeekWithTime('tuesday', 15, 0, 0).toMillis(),
      ),
      evaluationsStartAt: this.firebase.generateTimestamp(
        this.date.getDayOfNextWeekWithTime('tuesday', 15, 0, 1).toMillis(),
      ),
      evaluationsEndAt: this.firebase.generateTimestamp(
        this.date.getDayOfNextWeekWithTime('sunday', 23, 0, 0).toMillis(),
      ),
      submissions: [],
      evaluations: [],
      songs: [],
      users: users || [],
      voteCount: 0,
    };
    return lastWinner ? { ...newRound, lastWinner } : newRound;
  };

  private async forceStartEvaluationPeriod(groupId: string, roundId: string) {
    const now = this.firebase.now;
    const roundReference = this.firebase.getRoundReference(groupId, roundId);
    await roundReference.update({
      submissionsEndAt: now,
      evaluationsStartAt: now,
    });
    await this.firebase.publishMessageInTopic(
      'gcp.pubsub.notificationQueueTopic',
      {
        type: NotificationTypes.periodAboutToFinish,
        params: {
          hours: 0,
          stage: Stage.submission,
          groupId,
        },
      },
    );
  }

  private hasPeriodFinished({
    stage,
    submissionsEndAt,
    evaluationsEndAt,
  }: IHasPeriodFinishedArguments) {
    const timeLimit =
      stage === Stage.evaluation ? evaluationsEndAt : submissionsEndAt;
    const now = this.date.current.toMillis();
    return now > timeLimit.toMillis();
  }
}
