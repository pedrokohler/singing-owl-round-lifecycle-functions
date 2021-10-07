import { firestore } from 'firebase-admin';
import IGenericRegularObject from './generic-regular-object.interface';

export default interface IRound {
  id?: string;
  evaluations: string[];
  submissions: string[];
  songs: string[];
  users: string[];
  notifications: IGenericRegularObject<boolean>;
  lastWinner?: string;
  voteCount: number;
  evaluationsEndAt: firestore.Timestamp;
  evaluationsStartAt: firestore.Timestamp;
  submissionsEndAt: firestore.Timestamp;
  submissionsStartAt: firestore.Timestamp;
}
