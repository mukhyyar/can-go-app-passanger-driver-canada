import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FirebaseService } from '../firebase/firebase.service';

type AppRoleValue = 'PASSENGER' | 'DRIVER' | 'PASSENGER_WEB';

export type PushPayload = {
  userId: string;
  title: string;
  body: string;
  templateKey: string;
  /** Deep-link friendly data (all string values for FCM). */
  data: Record<string, string>;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly firebase: FirebaseService,
  ) {}

  async registerDeviceToken(input: {
    token: string;
    platform: string;
    appRole: AppRoleValue;
    deviceId?: string;
    userId?: string;
  }) {
    const dbReady = await this.prisma.isReady();
    if (!dbReady) {
      this.logger.warn('DB not ready — device token accepted in-memory only');
      return {
        ok: true,
        persisted: false,
        firebaseConfigured: this.firebase.isConfigured(),
        tokenPreview: input.token.slice(0, 12) + '…',
      };
    }

    if (!input.userId) {
      return {
        ok: true,
        persisted: false,
        reason: 'userId required',
        firebaseConfigured: this.firebase.isConfigured(),
      };
    }

    const row = await this.prisma.deviceToken.upsert({
      where: { token: input.token },
      create: {
        userId: input.userId,
        token: input.token,
        platform: input.platform,
        appRole: input.appRole,
        deviceId: input.deviceId,
      },
      update: {
        userId: input.userId,
        platform: input.platform,
        appRole: input.appRole,
        deviceId: input.deviceId,
        lastSeenAt: new Date(),
      },
    });

    return { ok: true, persisted: true, id: row.id };
  }

  async logDelivery(input: {
    userId?: string;
    deviceToken?: string;
    channel: string;
    templateKey?: string;
    title?: string;
    body?: string;
    dataJson?: object;
    status: string;
    providerMsgId?: string;
    errorCode?: string;
  }) {
    if (!(await this.prisma.isReady())) return null;
    return this.prisma.notificationDelivery.create({
      data: {
        userId: input.userId,
        deviceToken: input.deviceToken,
        channel: input.channel,
        templateKey: input.templateKey,
        title: input.title,
        body: input.body,
        dataJson: (input.dataJson ?? {}) as Prisma.InputJsonValue,
        status: input.status,
        providerMsgId: input.providerMsgId,
        errorCode: input.errorCode,
      },
    });
  }

  /** Send FCM to all device tokens for a user; cleans invalid tokens. */
  async sendToUser(payload: PushPayload) {
    const messaging = this.firebase.messaging();
    const tokens = await this.prisma.deviceToken.findMany({
      where: { userId: payload.userId },
    });

    if (!tokens.length) {
      await this.logDelivery({
        userId: payload.userId,
        channel: 'fcm',
        templateKey: payload.templateKey,
        title: payload.title,
        body: payload.body,
        dataJson: payload.data,
        status: 'skipped_no_token',
      });
      return { sent: 0, skipped: true };
    }

    if (!messaging) {
      for (const t of tokens) {
        await this.logDelivery({
          userId: payload.userId,
          deviceToken: t.token,
          channel: 'fcm',
          templateKey: payload.templateKey,
          title: payload.title,
          body: payload.body,
          dataJson: payload.data,
          status: 'skipped_fcm_unconfigured',
        });
      }
      this.logger.warn(
        `FCM unconfigured — logged ${tokens.length} deliveries as skipped`,
      );
      return { sent: 0, skipped: true, reason: 'fcm_unconfigured' };
    }

    let sent = 0;
    for (const t of tokens) {
      try {
        const msgId = await messaging.send({
          token: t.token,
          notification: { title: payload.title, body: payload.body },
          data: {
            ...payload.data,
            click_action: 'FLUTTER_NOTIFICATION_CLICK',
          },
          android: { priority: 'high' },
          apns: {
            payload: { aps: { sound: 'default', contentAvailable: true } },
          },
        });
        sent += 1;
        await this.logDelivery({
          userId: payload.userId,
          deviceToken: t.token,
          channel: 'fcm',
          templateKey: payload.templateKey,
          title: payload.title,
          body: payload.body,
          dataJson: payload.data,
          status: 'sent',
          providerMsgId: msgId,
        });
      } catch (err) {
        const code =
          err && typeof err === 'object' && 'code' in err
            ? String((err as { code: string }).code)
            : 'unknown';
        await this.logDelivery({
          userId: payload.userId,
          deviceToken: t.token,
          channel: 'fcm',
          templateKey: payload.templateKey,
          title: payload.title,
          body: payload.body,
          dataJson: payload.data,
          status: 'failed',
          errorCode: code,
        });
        if (
          code.includes('registration-token-not-registered') ||
          code.includes('invalid-registration-token')
        ) {
          await this.prisma.deviceToken.delete({ where: { token: t.token } }).catch(() => undefined);
          this.logger.log(`Removed invalid FCM token for user=${payload.userId}`);
        }
      }
    }

    return { sent, total: tokens.length };
  }

  async notifyRideStatus(input: {
    userIds: string[];
    rideId: string;
    status: string;
    title: string;
    body: string;
  }) {
    const results = [];
    for (const userId of input.userIds) {
      results.push(
        await this.sendToUser({
          userId,
          title: input.title,
          body: input.body,
          templateKey: `ride.${input.status.toLowerCase()}`,
          data: {
            type: 'ride.status',
            rideId: input.rideId,
            status: input.status,
            deepLink: `/rides/${input.rideId}`,
          },
        }),
      );
    }
    return results;
  }
}
