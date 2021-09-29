import { Injectable, Logger } from '@nestjs/common';
import { DateTimeService, FirebaseService } from '../common';

@Injectable()
export class AppService {
  constructor(
    private readonly logger: Logger,
    private readonly date: DateTimeService,
    private readonly firebase: FirebaseService,
  ) {
    this.logger.setContext(AppService.name);
  }
  async execute(): Promise<void> {
    const currentDate = this.date.current;
    this.logger.debug(`Test log debug and timezone ${currentDate}`);
    this.logger.warn(`Test log warn and timezone ${currentDate}`);
    this.logger.error(`Test log error and timezone ${currentDate}`);
    const docToAdd = { title: 'example' };
    const docAdded = await this.firebase.collection.add(docToAdd);
    this.logger.log({
      message: 'Test pass object in logger',
      meta: {
        currentDate,
        utc: this.date.utc,
        doc: {
          id: docAdded.id,
          body: docToAdd,
          path: docAdded.path,
          firestore: docAdded.firestore,
        },
      },
    });
  }
}
