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

  get collection() {
    const collectionName = this.configService.get('gcp.collection');
    return admin.firestore().collection(`/${collectionName}`);
  }

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
