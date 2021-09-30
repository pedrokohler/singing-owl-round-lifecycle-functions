import { Injectable, Logger } from '@nestjs/common';
import { /* DateTimeService ,*/ FirebaseService } from '../common';

@Injectable()
export class AppService {
  constructor(
    private readonly logger: Logger,
    // private readonly date: DateTimeService,
    private readonly firebase: FirebaseService,
  ) {
    this.logger.setContext(AppService.name);
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
        this.logger.log({
          meta: roundReference.data(),
        });
      }),
    );
  }
}
