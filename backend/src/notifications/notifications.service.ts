import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppRole, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FirebaseService } from '../firebase/firebase.service';

export type AppRoleValue = 'PASSENGER' | 'DRIVER' | 'PASSENGER_WEB';

export type PushPayload = {
  userId: string;
  title: string;
  body: string;
  templateKey: string;
  /** Deep-link friendly data (all string values for FCM). */
  data: Record<string, string>;
  /** Optional rich media (vehicle thumbnail). */
  imageUrl?: string;
  /** Deduplicate deliveries for the same logical event. */
  eventId?: string;
  /** Target app role (e.g. 'DRIVER', 'PASSENGER', or array). If omitted, inferred from payload or sent to all tokens. */
  targetRole?: AppRoleValue | AppRoleValue[];
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly firebase: FirebaseService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  resolveTargetRoles(payload: {
    templateKey?: string;
    targetRole?: AppRoleValue | AppRoleValue[];
    data?: Record<string, string>;
  }): AppRoleValue[] | undefined {
    if (payload.targetRole) {
      const roles = Array.isArray(payload.targetRole)
        ? payload.targetRole
        : [payload.targetRole];
      if (roles.includes('PASSENGER') && !roles.includes('PASSENGER_WEB')) {
        return [...roles, 'PASSENGER_WEB'];
      }
      return roles;
    }

    const templateKey = (payload.templateKey || '').toLowerCase();
    const type = (payload.data?.type || '').toUpperCase();
    const status = (payload.data?.status || '').toUpperCase();
    const deepLink = payload.data?.deepLink || '';

    // Driver-specific cues
    if (
      templateKey.startsWith('driver.') ||
      templateKey.startsWith('wallet.') ||
      templateKey.startsWith('kyc') ||
      templateKey === 'ride.new_request' ||
      templateKey === 'ride.offer_not_selected' ||
      templateKey === 'ride.offer_reserved' ||
      templateKey === 'ride.lost_item' ||
      templateKey === 'ride.change_request' ||
      type === 'OFFER_NOT_SELECTED' ||
      type === 'OFFER_RESERVED' ||
      type === 'RIDE_REQUEST' ||
      type === 'KYC' ||
      type.startsWith('WALLET.') ||
      type === 'DOCUMENT_EXPIRED' ||
      type === 'DOCUMENT_EXPIRING' ||
      status === 'OFFER_NOT_SELECTED' ||
      status === 'OFFER_RESERVED' ||
      status === 'LOST_ITEM' ||
      status === 'CHANGE_REQUEST' ||
      deepLink.startsWith('/driver') ||
      deepLink.startsWith('/request/') ||
      deepLink.startsWith('/chat/')
    ) {
      return ['DRIVER'];
    }

    // Passenger-specific cues
    if (
      templateKey.startsWith('ride.offer_received') ||
      templateKey.startsWith('ride.offer_updated') ||
      templateKey.startsWith('ride.offer_withdrawn') ||
      templateKey === 'ride.passenger_cancelled' ||
      type === 'RIDE_OFFER_RECEIVED' ||
      type === 'OFFER_UPDATED' ||
      type === 'OFFER_WITHDRAWN' ||
      status === 'OFFER_RECEIVED' ||
      status === 'OFFER_UPDATED' ||
      status === 'OFFER_WITHDRAWN' ||
      status === 'PASSENGER_CANCELLED' ||
      deepLink.startsWith('/offers/') ||
      deepLink.startsWith('/offer/') ||
      deepLink.startsWith('/booking-confirmed/') ||
      deepLink.startsWith('/ride/')
    ) {
      return ['PASSENGER', 'PASSENGER_WEB'];
    }

    return undefined;
  }

  private resolvePublicImageUrl(raw?: string | null): string | undefined {
    if (!raw) return undefined;
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    if (trimmed.startsWith('/')) {
      const base =
        this.config?.get<string>('apiBaseUrl') ||
        process.env.API_BASE_URL ||
        process.env.PUBLIC_API_BASE ||
        '';
      if (base) {
        return `${base.replace(/\/+$/, '')}${trimmed}`;
      }
    }
    return trimmed;
  }

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

  /** Send FCM to device tokens for a user matching target appRole; cleans invalid tokens. */
  async sendToUser(payload: PushPayload) {
    if (payload.eventId && (await this.prisma.isReady())) {
      const prior = await this.prisma.notificationDelivery.findFirst({
        where: {
          userId: payload.userId,
          templateKey: payload.templateKey,
          status: 'sent',
          dataJson: {
            path: ['eventId'],
            equals: payload.eventId,
          },
        },
      });
      if (prior) {
        return { sent: 0, skipped: true, reason: 'duplicate_event' };
      }
    }

    const messaging = this.firebase.messaging();
    const targetRoles = this.resolveTargetRoles(payload);
    const tokens = await this.prisma.deviceToken.findMany({
      where: {
        userId: payload.userId,
        ...(targetRoles && targetRoles.length > 0
          ? {
              appRole:
                targetRoles.length === 1
                  ? (targetRoles[0] as AppRole)
                  : { in: targetRoles as AppRole[] },
            }
          : {}),
      },
    });

    const resolvedImageUrl = this.resolvePublicImageUrl(payload.imageUrl);

    const dataWithEvent = {
      ...payload.data,
      ...(payload.eventId ? { eventId: payload.eventId } : {}),
      ...(resolvedImageUrl ? { imageUrl: resolvedImageUrl } : {}),
      ...(targetRoles && targetRoles.length > 0
        ? { targetRoles: targetRoles.join(',') }
        : {}),
      click_action: 'FLUTTER_NOTIFICATION_CLICK',
    };

    if (!tokens.length) {
      await this.logDelivery({
        userId: payload.userId,
        channel: 'fcm',
        templateKey: payload.templateKey,
        title: payload.title,
        body: payload.body,
        dataJson: {
          ...dataWithEvent,
          eventId: payload.eventId,
          ...(targetRoles ? { targetRoles } : {}),
        },
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
          dataJson: {
            ...dataWithEvent,
            eventId: payload.eventId,
            appRole: t.appRole,
          },
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
          notification: {
            title: payload.title,
            body: payload.body,
            ...(resolvedImageUrl ? { imageUrl: resolvedImageUrl } : {}),
          },
          data: dataWithEvent,
          android: {
            priority: 'high',
            notification: {
              channelId: 'can_ride_high',
              ...(resolvedImageUrl ? { imageUrl: resolvedImageUrl } : {}),
            },
          },
          apns: {
            payload: {
              aps: {
                sound: 'default',
                contentAvailable: true,
                mutableContent: !!resolvedImageUrl,
              },
            },
            ...(resolvedImageUrl
              ? { fcmOptions: { imageUrl: resolvedImageUrl } }
              : {}),
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
          dataJson: {
            ...dataWithEvent,
            eventId: payload.eventId,
            appRole: t.appRole,
          },
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
          dataJson: {
            ...dataWithEvent,
            eventId: payload.eventId,
            appRole: t.appRole,
          },
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
    data?: Record<string, string>;
    imageUrl?: string;
    eventId?: string;
    targetRole?: AppRoleValue | AppRoleValue[];
  }) {
    const results = [];
    for (const userId of input.userIds) {
      results.push(
        await this.sendToUser({
          userId,
          title: input.title,
          body: input.body,
          templateKey: `ride.${input.status.toLowerCase()}`,
          imageUrl: input.imageUrl,
          eventId: input.eventId,
          targetRole: input.targetRole,
          data: {
            type: input.data?.type ?? 'ride.status',
            rideId: input.rideId,
            status: input.status,
            deepLink: input.data?.deepLink ?? `/rides/${input.rideId}`,
            ...(input.data ?? {}),
          },
        }),
      );
    }
    return results;
  }

  /** Passenger-facing new offer push with structured navigation payload. */
  async notifyNewOffer(input: {
    userId: string;
    rideId: string;
    offerId: string;
    driverId: string;
    vehicleId?: string | null;
    title: string;
    body: string;
    imageUrl?: string | null;
  }) {
    return this.sendToUser({
      userId: input.userId,
      title: input.title,
      body: input.body,
      templateKey: 'ride.offer_received',
      imageUrl: input.imageUrl ?? undefined,
      eventId: `offer.created.${input.offerId}`,
      targetRole: ['PASSENGER', 'PASSENGER_WEB'],
      data: {
        type: 'RIDE_OFFER_RECEIVED',
        rideRequestId: input.rideId,
        rideId: input.rideId,
        offerId: input.offerId,
        driverId: input.driverId,
        vehicleId: input.vehicleId ?? '',
        deepLink: `/offers/${input.rideId}?offerId=${input.offerId}`,
        ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
      },
    });
  }

  /** Passenger-facing offer update / enhance push. */
  async notifyOfferUpdated(input: {
    userId: string;
    rideId: string;
    offerId: string;
    supersededOfferId?: string | null;
    title?: string;
    body?: string;
    imageUrl?: string | null;
  }) {
    return this.sendToUser({
      userId: input.userId,
      title: input.title ?? 'Offer updated',
      body:
        input.body ??
        'A driver enhanced or updated their offer. Review the new details.',
      templateKey: 'ride.offer_updated',
      imageUrl: input.imageUrl ?? undefined,
      eventId: `offer.updated.${input.offerId}`,
      targetRole: ['PASSENGER', 'PASSENGER_WEB'],
      data: {
        type: 'OFFER_UPDATED',
        rideRequestId: input.rideId,
        rideId: input.rideId,
        offerId: input.offerId,
        supersededOfferId: input.supersededOfferId ?? '',
        deepLink: `/offer/${input.rideId}/${input.offerId}`,
        ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
      },
    });
  }

  /** Driver-facing new open ride request in their operating zone. */
  async notifyNewRideRequest(input: {
    userIds: string[];
    rideId: string;
    fromLabel: string;
    toLabel: string;
    pickupAt?: string;
  }) {
    const title = 'New ride request';
    const body = `${input.fromLabel} → ${input.toLabel}`;
    const results = [];
    for (const userId of input.userIds) {
      results.push(
        await this.sendToUser({
          userId,
          title,
          body,
          templateKey: 'ride.new_request',
          eventId: `ride.new_request.${input.rideId}.${userId}`,
          targetRole: 'DRIVER',
          data: {
            type: 'ride_request',
            rideId: input.rideId,
            rideRequestId: input.rideId,
            fromLabel: input.fromLabel,
            toLabel: input.toLabel,
            pickupAt: input.pickupAt ?? '',
            deepLink: `/request/${input.rideId}`,
          },
        }),
      );
    }
    return results;
  }
}
