import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RideStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const MAX_BODY = 2000;
const ALLOWED_STATUSES: RideStatus[] = [
  RideStatus.BOOKED,
  RideStatus.DRIVER_EN_ROUTE,
  RideStatus.DRIVER_ARRIVED,
  RideStatus.TRIP_STARTED,
  RideStatus.IN_PROGRESS,
  RideStatus.COMPLETED,
];

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

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
    const isDriver = ride.selectedOffer?.driver.userId === userId;
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

  async send(userId: string, rideId: string, rawBody: string) {
    await this.assertParticipant(userId, rideId);
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
