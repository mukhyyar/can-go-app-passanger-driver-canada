import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  App,
  cert,
  getApp,
  getApps,
  initializeApp,
  ServiceAccount,
} from 'firebase-admin/app';
import { getMessaging, Messaging } from 'firebase-admin/messaging';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private app: App | null = null;
  projectId: string;

  constructor(private readonly config: ConfigService) {
    this.projectId =
      this.config.get<string>('firebase.projectId') ?? 'can-go-platform';
  }

  onModuleInit() {
    if (getApps().length) {
      this.app = getApp();
      return;
    }

    const path = this.config.get<string>('firebase.serviceAccountPath');
    const jsonEnv = this.config.get<string>('firebase.serviceAccountJson');

    try {
      if (jsonEnv) {
        const cred = JSON.parse(jsonEnv) as ServiceAccount;
        this.app = initializeApp({
          credential: cert(cred),
          projectId: this.projectId,
        });
        this.logger.log(`Firebase Admin initialized for ${this.projectId}`);
        return;
      }

      if (path) {
        const abs = resolve(process.cwd(), path);
        if (existsSync(abs)) {
          const cred = JSON.parse(readFileSync(abs, 'utf8')) as ServiceAccount;
          this.app = initializeApp({
            credential: cert(cred),
            projectId: this.projectId,
          });
          this.logger.log(`Firebase Admin initialized from ${abs}`);
          return;
        }
        this.logger.warn(
          `Firebase service account file not found at ${abs}. FCM disabled until configured.`,
        );
      } else {
        this.logger.warn(
          'Firebase Admin not configured (set FIREBASE_SERVICE_ACCOUNT_PATH). FCM disabled until configured.',
        );
      }
    } catch (err) {
      this.logger.error(
        'Failed to initialize Firebase Admin',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  isConfigured(): boolean {
    return this.app !== null;
  }

  messaging(): Messaging | null {
    return this.app ? getMessaging(this.app) : null;
  }
}
