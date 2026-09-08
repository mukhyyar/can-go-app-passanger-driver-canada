import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { RideStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TrackingGateway } from '../tracking/tracking.gateway';

@Injectable()
export class TripService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @Inject(forwardRef(() => TrackingGateway))
    private readonly tracking: TrackingGateway,
  ) {}

  async transition(
    userId: string,
    rideId: string,
    toStatus: RideStatus,
    ip?: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { driverProfile: true, passengerProfile: true },
    });
    if (!user) throw new ForbiddenException();

    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        passenger: true,
        selectedOffer: { include: { driver: true } },
      },
    });
    if (!ride) throw new NotFoundException('Ride not found');

    const isAssignedDriver =
      !!user.driverProfile &&
      ride.assignedDriverId === user.driverProfile.id;
    const isPassenger = ride.passenger.userId === userId;
    const isAdmin =
      user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;

    this.assertTransitionAllowed(
      ride.status,
      toStatus,
      { isAssignedDriver, isPassenger, isAdmin },
    );

    const actorType = isAdmin
      ? 'admin'
      : isAssignedDriver
        ? 'driver'
        : 'passenger';

    await this.prisma.$transaction(async (tx) => {
      await tx.ride.update({
        where: { id: rideId },
        data: { status: toStatus },
      });
      await tx.rideEvent.create({
        data: {
          rideId,
          fromStatus: ride.status,
          toStatus,
          actorType,
          actorId: userId,
          payload: { action: 'trip.transition' },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: `ride.transition.${toStatus}`,
          resource: 'Ride',
          resourceId: rideId,
          ip,
        },
      });
    });

    // Auto-advance TRIP_STARTED → IN_PROGRESS for simpler clients
    if (toStatus === RideStatus.TRIP_STARTED) {
      await this.prisma.$transaction(async (tx) => {
        await tx.ride.update({
          where: { id: rideId },
          data: { status: RideStatus.IN_PROGRESS },
        });
        await tx.rideEvent.create({
          data: {
            rideId,
            fromStatus: RideStatus.TRIP_STARTED,
            toStatus: RideStatus.IN_PROGRESS,
            actorType: 'system',
            payload: { action: 'auto_in_progress' },
          },
        });
      });
    }

    const final = await this.prisma.ride.findUnique({ where: { id: rideId } });
    const notifyStatus = final!.status;

    this.tracking.emitRideEvent(rideId, {
      type: 'ride.status',
      rideId,
      status: notifyStatus,
      fromStatus: ride.status,
    });

    const driverUserId = ride.selectedOffer?.driver?.userId;
    const targets = [ride.passenger.userId, driverUserId].filter(
      Boolean,
    ) as string[];

    await this.notifications.notifyRideStatus({
      userIds: targets,
      rideId,
      status: notifyStatus,
      title: this.titleFor(notifyStatus),
      body: this.bodyFor(notifyStatus, ride.fromLabel),
    });

    return {
      id: rideId,
      status: notifyStatus,
      fromStatus: ride.status,
    };
  }

  private assertTransitionAllowed(
    from: RideStatus,
    to: RideStatus,
    actors: {
      isAssignedDriver: boolean;
      isPassenger: boolean;
      isAdmin: boolean;
    },
  ) {
    const { isAssignedDriver, isPassenger, isAdmin } = actors;

    const driverNext: Partial<Record<RideStatus, RideStatus[]>> = {
      [RideStatus.BOOKED]: [RideStatus.DRIVER_EN_ROUTE, RideStatus.DRIVER_CANCELLED],
      [RideStatus.DRIVER_EN_ROUTE]: [
        RideStatus.DRIVER_ARRIVED,
        RideStatus.DRIVER_CANCELLED,
      ],
      [RideStatus.DRIVER_ARRIVED]: [
        RideStatus.TRIP_STARTED,
        RideStatus.NO_SHOW,
        RideStatus.DRIVER_CANCELLED,
      ],
      [RideStatus.TRIP_STARTED]: [RideStatus.COMPLETED],
      [RideStatus.IN_PROGRESS]: [RideStatus.COMPLETED],
    };

    const passengerNext: Partial<Record<RideStatus, RideStatus[]>> = {
      [RideStatus.BOOKED]: [RideStatus.PASSENGER_CANCELLED],
      [RideStatus.DRIVER_EN_ROUTE]: [RideStatus.PASSENGER_CANCELLED],
      [RideStatus.DRIVER_ARRIVED]: [RideStatus.PASSENGER_CANCELLED],
    };

    if (isAdmin && to === RideStatus.ADMIN_CANCELLED) return;

    if (isAssignedDriver && driverNext[from]?.includes(to)) return;
    if (isPassenger && passengerNext[from]?.includes(to)) return;

    throw new BadRequestException(
      `Illegal transition ${from} → ${to} for this actor`,
    );
  }

  private titleFor(status: RideStatus) {
    switch (status) {
      case RideStatus.DRIVER_EN_ROUTE:
        return 'Driver en route';
      case RideStatus.DRIVER_ARRIVED:
        return 'Driver arrived';
      case RideStatus.TRIP_STARTED:
      case RideStatus.IN_PROGRESS:
        return 'Trip started';
      case RideStatus.COMPLETED:
        return 'Trip completed';
      case RideStatus.NO_SHOW:
        return 'No-show recorded';
      case RideStatus.PASSENGER_CANCELLED:
      case RideStatus.DRIVER_CANCELLED:
      case RideStatus.ADMIN_CANCELLED:
        return 'Ride cancelled';
      default:
        return 'Ride update';
    }
  }

  private bodyFor(status: RideStatus, fromLabel: string) {
    return `${status.replace(/_/g, ' ')} · ${fromLabel}`;
  }
}
