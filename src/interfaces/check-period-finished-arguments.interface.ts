import { firestore } from 'firebase-admin';
import { Stage } from 'src/enums/stage.enum';

export default interface IHasPeriodFinishedArguments {
  stage: Stage;
  submissionsEndAt?: firestore.Timestamp;
  evaluationsEndAt?: firestore.Timestamp;
}
