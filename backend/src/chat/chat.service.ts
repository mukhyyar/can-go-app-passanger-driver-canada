import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RideStatus, UserRole } from '@prisma/client';
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

  private async assertParticipant(userId: string, rideId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        passenger: true,
        selectedOffer: { include: { driver: true } },
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
    if (!isAdmin && !ALLOWED_STATUSES.includes(ride.status)) {
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
    const ride = await this.assertParticipant(userId, rideId);
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

    const digits = phoneE164?.replace(/\D/g, '') ?? '';
    return {
      otherParty,
      phoneE164,
      canCall: !!phoneE164,
      canWhatsApp: digits.length >= 8,
    };
  }

  async send(userId: string, rideId: string, rawBody: string) {
    const ride = await this.assertParticipant(userId, rideId);
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
    const recipientId =
      userId === passengerUserId
        ? driverUserId
        : userId === driverUserId
          ? passengerUserId
          : null;
    if (recipientId) {
      const preview = body.length > 120 ? `${body.slice(0, 117)}…` : body;
      void this.notifications
        .sendToUser({
          userId: recipientId,
          title: 'New message',
          body: preview,
          templateKey: 'chat_message',
          eventId: `chat.message.${msg.id}`,
          data: {
            type: 'chat',
            rideId,
            messageId: msg.id,
            deepLink:
              recipientId === passengerUserId
                ? `/ride/${rideId}/chat`
                : `/chat/${rideId}`,
          },
        })
        .catch(() => undefined);
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
