import * as admin from 'firebase-admin';
import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';

@Injectable()
export class FirebaseService {
  private readonly environment: string;
  constructor(private readonly configService: ConfigService) {
    this.environment = this.configService.get('environment');
    if (!admin.apps.length) {
      const credentials = this.getCredential();
      admin.initializeApp(credentials);
    }
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
}
