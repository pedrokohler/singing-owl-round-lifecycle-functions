import { firestore } from 'firebase-admin';
import IGenericRegularObject from './generic-regular-object.interface';

export default interface ICheckArguments {
  notifications?: IGenericRegularObject<boolean>;
  submissionsEndAt?: firestore.Timestamp;
  evaluationsEndAt?: firestore.Timestamp;
}
