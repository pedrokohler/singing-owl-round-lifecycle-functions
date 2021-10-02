import * as admin from 'firebase-admin';
import { ConfigService } from '@nestjs/config';
import { Injectable, Logger } from '@nestjs/common';
import { PubSub } from '@google-cloud/pubsub';

@Injectable()
export class FirebaseService {
  private readonly environment: string;
  private readonly pubSub: PubSub;
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: Logger,
  ) {
    this.environment = this.configService.get('environment');
    if (!admin.apps.length) {
      const credentials = this.getCredential();
      admin.initializeApp(credentials);
    }
    this.pubSub = new PubSub();
    this.logger.setContext(FirebaseService.name);
  }

  get groupsCollection() {
    return admin.firestore().collection(`groups`);
  }

  public getGroupReference = (id) => this.groupsCollection.doc(id);

  public getCollectionReference = (collection) => (groupId) =>
    this.getGroupReference(groupId).collection(collection);

  public getDocReference = (collection) => (groupId, docId) =>
    this.getCollectionReference(collection)(groupId).doc(docId);

  public getRoundReference = this.getDocReference('rounds');

  private getCredential(): admin.AppOptions {
    if (this.environment === 'Development') return null;
    return {
      credential: admin.credential.cert({
        projectId: this.configService.get('gcp.projectId'),
        privateKey: this.configService.get('gcp.privateKey'),
        clientEmail: this.configService.get('gcp.email'),
      }),
    };
  }

  public async publishMessageInTopic(topicKeyFromEnv: string, message: any) {
    const topicName = this.configService.get(topicKeyFromEnv);
    await this.maybeCreateTopic(topicName);
    await this.pubSub.topic(topicName).publishJSON(message);
  }

  private async maybeCreateTopic(topicName: string) {
    try {
      await this.pubSub.createTopic(topicName);
    } catch (error) {
      this.logger.debug('Topic already exists');
    }
  }
}
