import { firestore } from 'firebase-admin';
import { Stage } from 'src/enums/stage.enum';
import IGenericRegularObject from './generic-regular-object.interface';

export default interface ICheckArguments {
  currentRoundStage: Stage;
  notifications?: IGenericRegularObject<boolean>;
  submissionsEndAt?: firestore.Timestamp;
  evaluationsEndAt?: firestore.Timestamp;
}
