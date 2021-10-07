import { firestore } from 'firebase-admin';

export default interface IEvaluation {
  createdAt: firestore.Timestamp;
  evaluatee: string;
  evaluator: string;
  id: string;
  ratedFamous: boolean;
  round: string;
  score: number;
  song: string;
}
