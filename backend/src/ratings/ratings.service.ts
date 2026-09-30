import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  RatingModerationStatus,
  RideStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRatingDto, ModerateRatingDto } from './dto/ratings.dto';

@Injectable()
export class RatingsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, rideId: string, dto: CreateRatingDto) {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        passenger: true,
        selectedOffer: { include: { driver: true } },
      },
    });
    if (!ride) throw new NotFoundException('Ride not found');
    if (ride.status !== RideStatus.COMPLETED) {
      throw new BadRequestException('Ride must be COMPLETED to rate');
    }

    const userDriverProfile = await this.prisma.driverProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    let driverUserId = ride.selectedOffer?.driver?.userId;
    if (!driverUserId && ride.assignedDriverId) {
      const dp = await this.prisma.driverProfile.findUnique({
        where: { id: ride.assignedDriverId },
        select: { userId: true },
      });
      driverUserId = dp?.userId;
    }

    const isPassenger = ride.passenger?.userId === userId;
    const isDriver =
      (driverUserId != null && driverUserId === userId) ||
      (ride.selectedOffer?.driver?.userId === userId) ||
      (!!userDriverProfile && ride.assignedDriverId === userDriverProfile.id);

    if (!isPassenger && !isDriver) {
      throw new ForbiddenException('Only ride participants can rate');
    }

    if (isPassenger) {
      if (
        dto.communicationStars == null ||
        dto.driverStars == null ||
        dto.vehicleStars == null
      ) {
        throw new BadRequestException(
          'Passenger ratings require communication, driver, and vehicle scores',
        );
      }
    }

    const toUserId = isPassenger
      ? (driverUserId ?? (isDriver ? userId : undefined))
      : ride.passenger?.userId;

    if (!toUserId) {
      throw new BadRequestException(
        isPassenger
          ? 'Driver not found for this ride'
          : 'Passenger not found for this ride',
      );
    }

    const trimmedComment = dto.comment?.trim() ? dto.comment.trim() : null;
    const hasComment = !!trimmedComment;
    const moderationStatus = hasComment
      ? RatingModerationStatus.PENDING_REVIEW
      : RatingModerationStatus.VISIBLE;

    try {
      const rating = await this.prisma.rating.create({
        data: {
          rideId,
          fromUserId: userId,
          toUserId,
          stars: dto.stars,
          communicationStars: isPassenger ? dto.communicationStars! : null,
          driverStars: isPassenger ? dto.driverStars! : null,
          vehicleStars: isPassenger ? dto.vehicleStars! : null,
          comment: trimmedComment,
          moderationStatus,
        },
      });
      await this.prisma.auditLog.create({
        data: {
          actorId: userId,
          action: 'rating.create',
          resource: 'Rating',
          resourceId: rating.id,
          meta: {
            rideId,
            stars: dto.stars,
            communicationStars: rating.communicationStars,
            driverStars: rating.driverStars,
            vehicleStars: rating.vehicleStars,
            moderationStatus,
          } as Prisma.InputJsonValue,
        },
      });
      return rating;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new BadRequestException('You already rated this ride');
      }
      throw err;
    }
  }

  async listForRide(userId: string, rideId: string) {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        passenger: true,
        selectedOffer: { include: { driver: true } },
      },
    });
    if (!ride) throw new NotFoundException('Ride not found');
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { driverProfile: true },
    });
    const isAdmin =
      user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN;
    const isPassenger = ride.passenger?.userId === userId;
    const isDriver =
      ride.selectedOffer?.driver?.userId === userId ||
      (!!user?.driverProfile && ride.assignedDriverId === user.driverProfile.id);
    const allowed = isPassenger || isDriver || isAdmin;
    if (!allowed) throw new ForbiddenException();

    return this.prisma.rating.findMany({
      where: { rideId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async adminQueue(status?: string) {
    const where =
      status &&
      Object.values(RatingModerationStatus).includes(
        status as RatingModerationStatus,
      )
        ? { moderationStatus: status as RatingModerationStatus }
        : { moderationStatus: RatingModerationStatus.PENDING_REVIEW };
    return this.prisma.rating.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: {
        fromUser: { select: { id: true, email: true, role: true } },
        toUser: { select: { id: true, email: true, role: true } },
        ride: { select: { id: true, fromLabel: true, toLabel: true, status: true } },
      },
    });
  }

  async moderate(adminUserId: string, ratingId: string, dto: ModerateRatingDto) {
    const rating = await this.prisma.rating.findUnique({ where: { id: ratingId } });
    if (!rating) throw new NotFoundException('Rating not found');
    const updated = await this.prisma.rating.update({
      where: { id: ratingId },
      data: {
        moderationStatus: dto.status,
        moderatedAt: new Date(),
        moderatedById: adminUserId,
        moderationNote: dto.note,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: adminUserId,
        action: 'rating.moderate',
        resource: 'Rating',
        resourceId: ratingId,
        meta: { status: dto.status } as Prisma.InputJsonValue,
      },
    });
    return updated;
  }
}
