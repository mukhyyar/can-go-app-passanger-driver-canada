import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RideStatus, SupportCaseStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const MAX_BODY = 2000;
const ALLOWED_STATUSES: RideStatus[] = [
  RideStatus.BOOKED,
  RideStatus.DRIVER_EN_ROUTE,
  RideStatus.DRIVER_ARRIVED,
  RideStatus.TRIP_STARTED,
  RideStatus.IN_PROGRESS,
];

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private sanitize(body: string) {
    return body
      .replace(/<[^>]*>/g, '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .trim();
  }

  private async assertParticipant(userId: string, rideId: string, enforceActive: boolean = false) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        passenger: true,
        selectedOffer: { include: { driver: true } },
        supportCases: {
          select: { id: true, status: true },
        },
      },
    });
    if (!ride) throw new NotFoundException('Ride not found');
    const isAdmin =
      user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN;
    const isPassenger = ride.passenger.userId === userId;
    const isDriver =
      ride.selectedOffer?.driver.userId === userId ||
      (ride.assignedDriverId != null &&
        (
          await this.prisma.driverProfile.findUnique({
            where: { id: ride.assignedDriverId },
            select: { userId: true },
          })
        )?.userId === userId);
    if (!isAdmin && !isPassenger && !isDriver) {
      throw new ForbiddenException('Not a chat participant');
    }
    const hasActiveSupport = ride.supportCases.some(
      (c) => c.status !== SupportCaseStatus.RESOLVED,
    );
    if (
      enforceActive &&
      !isAdmin &&
      !ALLOWED_STATUSES.includes(ride.status) &&
      !hasActiveSupport
    ) {
      throw new BadRequestException('Chat unavailable for this ride status');
    }
    return ride;
  }

  async getOrCreateThread(userId: string, rideId: string) {
    await this.assertParticipant(userId, rideId);
    return this.prisma.chatThread.upsert({
      where: { rideId },
      create: { rideId },
      update: {},
      include: {
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
          take: 200,
        },
      },
    });
  }

  /** Other party's verified phone — only for booked ride participants. */
  async getContact(userId: string, rideId: string) {
    const ride = await this.assertParticipant(userId, rideId, true);
    const passengerUserId = ride.passenger.userId;
    let driverUserId = ride.selectedOffer?.driver.userId ?? null;
    if (!driverUserId && ride.assignedDriverId) {
      const assigned = await this.prisma.driverProfile.findUnique({
        where: { id: ride.assignedDriverId },
        select: { userId: true },
      });
      driverUserId = assigned?.userId ?? null;
    }

    const isPassenger = passengerUserId === userId;
    const otherUserId = isPassenger ? driverUserId : passengerUserId;
    const otherParty = isPassenger ? 'DRIVER' : 'PASSENGER';

    let phoneE164: string | null = null;
    if (otherUserId) {
      const other = await this.prisma.user.findUnique({
        where: { id: otherUserId },
        select: { phoneE164: true, phoneVerifiedAt: true },
      });
      if (other?.phoneE164 && other.phoneVerifiedAt) {
        phoneE164 = other.phoneE164;
      }
    }

    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'contact.view',
        resource: 'Ride',
        resourceId: rideId,
        meta: { otherParty } as Prisma.InputJsonValue,
      },
    });

    return {
      otherParty,
      phoneE164: null,
      canCall: false,
      canWhatsApp: false,
    };
  }

  async send(userId: string, rideId: string, rawBody: string) {
    const ride = await this.assertParticipant(userId, rideId, true);
    const body = this.sanitize(rawBody ?? '');
    if (!body) throw new BadRequestException('Message body required');
    if (body.length > MAX_BODY) {
      throw new BadRequestException(`Message max ${MAX_BODY} characters`);
    }
    const thread = await this.prisma.chatThread.upsert({
      where: { rideId },
      create: { rideId },
      update: {},
    });
    const msg = await this.prisma.chatMessage.create({
      data: { threadId: thread.id, senderId: userId, body },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'chat.send',
        resource: 'ChatMessage',
        resourceId: msg.id,
        meta: { rideId } as Prisma.InputJsonValue,
      },
    });

    const passengerUserId = ride.passenger.userId;
    let driverUserId = ride.selectedOffer?.driver.userId ?? null;
    if (!driverUserId && ride.assignedDriverId) {
      const assigned = await this.prisma.driverProfile.findUnique({
        where: { id: ride.assignedDriverId },
        select: { userId: true },
      });
      driverUserId = assigned?.userId ?? null;
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const isAdmin =
      user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN;
    const preview = body.length > 120 ? `${body.slice(0, 117)}…` : body;

    if (isAdmin) {
      // Admin sent message: notify ride participants
      const targets = [passengerUserId, driverUserId].filter(Boolean) as string[];
      for (const tId of targets) {
        const isPass = tId === passengerUserId;
        void this.notifications
          .sendToUser({
            userId: tId,
            title: 'Support message from Can-Ride',
            body: preview,
            templateKey: 'chat_support_message',
            eventId: `chat.support.${msg.id}.${tId}`,
            targetRole: isPass ? ['PASSENGER', 'PASSENGER_WEB'] : 'DRIVER',
            data: {
              type: 'chat',
              rideId,
              messageId: msg.id,
              deepLink: isPass ? `/ride/${rideId}/chat` : `/chat/${rideId}`,
            },
          })
          .catch(() => undefined);
      }
    } else {
      // Customer sent message: notify the other ride participant
      const recipientId =
        userId === passengerUserId
          ? driverUserId
          : userId === driverUserId
            ? passengerUserId
            : null;
      if (recipientId) {
        const isPassengerRecipient = recipientId === passengerUserId;
        void this.notifications
          .sendToUser({
            userId: recipientId,
            title: 'New message',
            body: preview,
            templateKey: 'chat_message',
            eventId: `chat.message.${msg.id}`,
            targetRole: isPassengerRecipient
              ? ['PASSENGER', 'PASSENGER_WEB']
              : 'DRIVER',
            data: {
              type: 'chat',
              rideId,
              messageId: msg.id,
              deepLink:
                isPassengerRecipient
                  ? `/ride/${rideId}/chat`
                  : `/chat/${rideId}`,
            },
          })
          .catch(() => undefined);
      }

      // If active support case exists on ride, also notify admins of customer message
      const activeCases = await this.prisma.supportCase.findMany({
        where: { rideId, status: { not: SupportCaseStatus.RESOLVED } },
        select: { id: true },
      });
      if (activeCases.length > 0) {
        const rideCode =
          rideId.replace(/\D/g, '').slice(-8) || rideId.slice(-8);
        void this.notifications
          .notifyAdmins({
            title: `New chat on Ride #${rideCode}`,
            body: preview,
            templateKey: 'admin.chat_message',
            eventId: `admin.chat.${msg.id}`,
            data: {
              type: 'admin_chat',
              rideId,
              messageId: msg.id,
              senderId: userId,
              deepLink: `/admin/rides/${rideId}`,
            },
          })
          .catch(() => undefined);
      }
    }

    return msg;
  }

  async softDelete(userId: string, messageId: string) {
    const msg = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
      include: { thread: true },
    });
    if (!msg || msg.deletedAt) throw new NotFoundException('Message not found');
    await this.assertParticipant(userId, msg.thread.rideId);
    if (msg.senderId !== userId) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      const isAdmin =
        user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN;
      if (!isAdmin) throw new ForbiddenException();
    }
    return this.prisma.chatMessage.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
    });
  }

  async flag(userId: string, messageId: string) {
    const msg = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
      include: { thread: true },
    });
    if (!msg) throw new NotFoundException('Message not found');
    await this.assertParticipant(userId, msg.thread.rideId);
    return this.prisma.chatMessage.update({
      where: { id: messageId },
      data: { flagged: true },
    });
  }
}
