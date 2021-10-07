import { Injectable, Logger } from '@nestjs/common';
import IEvaluation from 'src/interfaces/evaluation.interface';
import IGenericRegularObject from 'src/interfaces/generic-regular-object.interface';
import ISubmissionResult from 'src/interfaces/submission-result.interface';

type IGroupedEvaluations = IGenericRegularObject<IEvaluation[]>;

const MAX_SCORE_ALLOWED = 100;
const FAMOUS_SUBMISSION_PENALTY = MAX_SCORE_ALLOWED * 0.1;

@Injectable()
export class ScoreService {
  constructor(private readonly logger: Logger) {
    this.logger.setContext(ScoreService.name);
  }

  public computeRoundWinner(evaluations: IEvaluation[]): string {
    const groupedEvaluations = evaluations.reduce<IGroupedEvaluations>(
      this.groupEvaluations.bind(this),
      {},
    );

    const results = Object.values(groupedEvaluations).reduce<
      ISubmissionResult[]
    >(this.computeSubmissionResult.bind(this), []);

    const sortedResults = results.sort(this.rankSubmissions.bind(this));
    return sortedResults?.[0].userId;
  }

  private groupEvaluations(
    groupedEvaluations: IGroupedEvaluations,
    evaluation: IEvaluation,
  ): IGroupedEvaluations {
    const songId = evaluation.song;
    const oldEvaluationArray = groupedEvaluations[songId] ?? [];
    return {
      ...groupedEvaluations,
      [songId]: [...oldEvaluationArray, evaluation],
    };
  }

  private computeSubmissionResult(
    results: ISubmissionResult[],
    evaluationArray: IEvaluation[],
  ): ISubmissionResult[] {
    const points = this.getSubmissionPoints(evaluationArray);
    const timesRatedFamous =
      this.getSubmissionRatedFamousCount(evaluationArray);
    const userId = evaluationArray?.[0]?.evaluatee;
    return [
      ...results,
      {
        userId,
        points,
        timesRatedFamous,
      },
    ];
  }

  private getSubmissionPoints(evaluations: IEvaluation[]): number {
    const numberOfEvaluations = evaluations.length;
    const totalPoints = this.getSubmissionTotalScore(evaluations);
    const basePoints = numberOfEvaluations
      ? totalPoints / numberOfEvaluations + Number.EPSILON
      : 0;

    const roundedPoints = Math.round(100 * basePoints) / 100;
    const penalty = this.getSubmissionPenalty(evaluations);
    const finalScore = (roundedPoints - penalty).toFixed(2);

    return Number(finalScore);
  }

  private getSubmissionTotalScore(evaluations: IEvaluation[]) {
    return evaluations.reduce(
      (total, evaluation) => total + evaluation.score,
      0,
    );
  }

  private getSubmissionPenalty(evaluations: IEvaluation[]) {
    return this.isSubmissionFamous(evaluations) ? FAMOUS_SUBMISSION_PENALTY : 0;
  }

  private isSubmissionFamous(evaluations: IEvaluation[]) {
    return (
      this.getSubmissionRatedFamousCount(evaluations) /
        (evaluations.length || 1) >
      0.5
    );
  }

  private getSubmissionRatedFamousCount(evaluations: IEvaluation[]): number {
    return evaluations.filter((evaluation) => evaluation.ratedFamous).length;
  }

  private rankSubmissions = (a: ISubmissionResult, b: ISubmissionResult) => {
    if (b.points === a.points) {
      const ratedFamousSortIndex =
        this.computeSortIndexForRatedFamousTieBreaker(a, b);
      return ratedFamousSortIndex;
    }
    return b.points - a.points;
  };

  private computeSortIndexForRatedFamousTieBreaker = (
    a: ISubmissionResult,
    b: ISubmissionResult,
  ) => {
    if (a.timesRatedFamous < b.timesRatedFamous) {
      return -1;
    }
    if (a.timesRatedFamous > b.timesRatedFamous) {
      return 1;
    }
    return 0;
  };
}
