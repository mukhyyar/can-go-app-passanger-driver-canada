import { randomBytes } from 'crypto';
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
import { LocationStoreService, type LiveLocation } from './location-store.service';
import { TrackingGateway } from './tracking.gateway';

const ACTIVE_TRIP: RideStatus[] = [
  RideStatus.BOOKED,
  RideStatus.DRIVER_EN_ROUTE,
  RideStatus.DRIVER_ARRIVED,
  RideStatus.TRIP_STARTED,
  RideStatus.IN_PROGRESS,
];

@Injectable()
export class TrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: LocationStoreService,
    @Inject(forwardRef(() => TrackingGateway))
    private readonly gateway: TrackingGateway,
  ) {}

  async ingest(
    userId: string,
    input: {
      lat: number;
      lng: number;
      heading?: number;
      speedMps?: number;
      accuracyM?: number;
      rideId?: string;
      recordedAt?: string;
    },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { driverProfile: true },
    });
    if (!user?.driverProfile) {
      throw new ForbiddenException('Driver required');
    }
    const driver = user.driverProfile;

    if (input.lat < -90 || input.lat > 90 || input.lng < -180 || input.lng > 180) {
      throw new BadRequestException('Invalid coordinates');
    }

    let rideId = input.rideId;
    if (rideId) {
      const ride = await this.prisma.ride.findUnique({ where: { id: rideId } });
      if (!ride || ride.assignedDriverId !== driver.id) {
        throw new ForbiddenException('Not assigned to this ride');
      }
      if (!ACTIVE_TRIP.includes(ride.status)) {
        throw new BadRequestException(`Ride not active (${ride.status})`);
      }
    } else {
      const active = await this.prisma.ride.findFirst({
        where: {
          assignedDriverId: driver.id,
          status: { in: ACTIVE_TRIP },
        },
        orderBy: { updatedAt: 'desc' },
      });
      rideId = active?.id;
    }

    const recordedAt = input.recordedAt
      ? new Date(input.recordedAt)
      : new Date();

    await this.prisma.driverLocationCurrent.upsert({
      where: { driverId: driver.id },
      create: {
        driverId: driver.id,
        lat: input.lat,
        lng: input.lng,
        heading: input.heading,
        speedMps: input.speedMps,
        accuracyM: input.accuracyM,
        recordedAt,
      },
      update: {
        lat: input.lat,
        lng: input.lng,
        heading: input.heading,
        speedMps: input.speedMps,
        accuracyM: input.accuracyM,
        recordedAt,
      },
    });

    // Sync PostGIS point (non-fatal)
    try {
      await this.prisma.$executeRawUnsafe(
        `UPDATE "DriverLocationCurrent"
         SET geom = ST_SetSRID(ST_MakePoint($1, $2), 4326)
         WHERE "driverId" = $3`,
        input.lng,
        input.lat,
        driver.id,
      );
    } catch {
      /* column may be missing until SQL applied */
    }

    const loc: LiveLocation = {
      driverId: driver.id,
      rideId,
      lat: input.lat,
      lng: input.lng,
      heading: input.heading,
      speedMps: input.speedMps,
      accuracyM: input.accuracyM,
      recordedAt: recordedAt.toISOString(),
    };
    await this.store.setCurrent(loc);

    // Downsample trail during trip (~>50m or 20s)
    if (rideId && ACTIVE_TRIP.includes(
      (await this.prisma.ride.findUnique({ where: { id: rideId } }))!.status,
    )) {
      await this.maybeSample(rideId, driver.id, loc);
    }

    if (rideId) {
      this.gateway.emitLocation(rideId, loc);
    }

    return loc;
  }

  async getRideLocation(userId: string, rideId: string) {
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
    const allowed =
      ride.passenger.userId === userId ||
      ride.selectedOffer?.driver.userId === userId ||
      (ride.assignedDriverId != null &&
        user?.driverProfile?.id === ride.assignedDriverId) ||
      user?.role === UserRole.ADMIN ||
      user?.role === UserRole.SUPER_ADMIN;
    if (!allowed) throw new ForbiddenException();

    const live =
      (await this.store.getRideDriver(rideId)) ??
      (ride.assignedDriverId
        ? await this.store.getDriver(ride.assignedDriverId)
        : null);

    const current = ride.assignedDriverId
      ? await this.prisma.driverLocationCurrent.findUnique({
          where: { driverId: ride.assignedDriverId },
        })
      : null;

    const samples = await this.prisma.tripLocationSample.findMany({
      where: { rideId },
      orderBy: { recordedAt: 'asc' },
      take: 500,
    });

    return {
      rideId,
      status: ride.status,
      live: live ??
        (current
          ? {
              driverId: current.driverId,
              rideId,
              lat: current.lat,
              lng: current.lng,
              heading: current.heading ?? undefined,
              speedMps: current.speedMps ?? undefined,
              accuracyM: current.accuracyM ?? undefined,
              recordedAt: current.recordedAt.toISOString(),
            }
          : null),
      samples,
      pickup: { lat: ride.fromLat, lng: ride.fromLng },
      dropoff:
        ride.toLat != null && ride.toLng != null
          ? { lat: ride.toLat, lng: ride.toLng }
          : null,
      eta: this.computeEta(ride, live ?? (current
        ? { lat: current.lat, lng: current.lng, speedMps: current.speedMps ?? undefined }
        : null)),
    };
  }

  /** GET /rides/:id/tracking — alias with ETA + endpoints for live map UI. */
  async getRideTracking(userId: string, rideId: string) {
    return this.getRideLocation(userId, rideId);
  }

  /** Generate or retrieve active trip share link for passenger */
  async createOrGetShareLink(userId: string, rideId: string) {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: { passenger: true },
    });
    if (!ride) throw new NotFoundException('Ride not found');
    if (ride.passenger.userId !== userId) {
      throw new ForbiddenException('Only the ride passenger can share this trip');
    }

    const now = new Date();
    let shareToken = ride.shareToken;
    let shareExpiresAt = ride.shareExpiresAt;

    if (!shareToken || !shareExpiresAt || shareExpiresAt < now) {
      shareToken = randomBytes(16).toString('hex');
      shareExpiresAt = new Date(Date.now() + 48 * 3600 * 1000);
      await this.prisma.ride.update({
        where: { id: rideId },
        data: {
          shareToken,
          shareExpiresAt,
        },
      });
    }

    const webBase = process.env.PASSENGER_WEB_BASE || 'https://www.can-rides.ca';
    const shareUrl = `${webBase.replace(/\/$/, '')}/track/${shareToken}`;

    return {
      rideId,
      shareToken,
      shareUrl,
      expiresAt: shareExpiresAt.toISOString(),
    };
  }

  /** Revoke an existing trip share link */
  async revokeShareLink(userId: string, rideId: string) {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: { passenger: true },
    });
    if (!ride) throw new NotFoundException('Ride not found');
    if (ride.passenger.userId !== userId) {
      throw new ForbiddenException('Only the ride passenger can revoke this trip share link');
    }

    await this.prisma.ride.update({
      where: { id: rideId },
      data: {
        shareToken: null,
        shareExpiresAt: null,
      },
    });

    return { success: true, revoked: true };
  }

  /** Public endpoint: Get live trip tracking details using share token */
  async getPublicSharedTrip(shareToken: string) {
    if (!shareToken || typeof shareToken !== 'string') {
      throw new BadRequestException('Valid share token is required');
    }

    const ride = await this.prisma.ride.findUnique({
      where: { shareToken },
      include: {
        passenger: { include: { user: true } },
        selectedOffer: {
          include: {
            driver: { include: { user: true } },
            vehicle: true,
          },
        },
      },
    });

    if (!ride) {
      throw new NotFoundException('Trip share link is invalid or has expired');
    }

    if (ride.shareExpiresAt && ride.shareExpiresAt < new Date()) {
      throw new NotFoundException('Trip share link has expired');
    }

    const driverProfile = ride.selectedOffer?.driver;
    const driverUser = driverProfile?.user;
    const vehicle = ride.selectedOffer?.vehicle;
    let driverInfo = null;
    if (driverUser) {
      const driverRatings = await this.prisma.rating.findMany({
        where: {
          toUserId: driverUser.id,
        },
        select: { stars: true },
      });
      const avgRating =
        driverRatings.length > 0
          ? Math.round(
              (driverRatings.reduce((sum, r) => sum + r.stars, 0) /
                driverRatings.length) *
                10,
            ) / 10
          : 5.0;

      const fullName =
        (driverUser as any)?.fullName ?? driverProfile?.fullName ?? 'Driver';
      const avatarUrl =
        (driverUser as any)?.avatarUrl ?? driverProfile?.avatarStorageKey ?? null;

      driverInfo = {
        firstName: fullName.split(' ')[0] ?? 'Driver',
        fullName,
        avatarUrl,
        rating: avgRating,
        totalTrips: driverRatings.length,
        vehicle: vehicle
          ? {
              makeModel: vehicle.name,
              color: vehicle.color || 'Standard',
              plate: vehicle.plate,
              year: vehicle.year ?? null,
              vehicleClass: vehicle.vehicleClass,
            }
          : null,
      };
    }

    const live =
      (await this.store.getRideDriver(ride.id)) ??
      (ride.assignedDriverId
        ? await this.store.getDriver(ride.assignedDriverId)
        : null);

    const current = ride.assignedDriverId
      ? await this.prisma.driverLocationCurrent.findUnique({
          where: { driverId: ride.assignedDriverId },
        })
      : null;

    const liveLoc =
      live ??
      (current
        ? {
            lat: current.lat,
            lng: current.lng,
            heading: current.heading ?? undefined,
            speedMps: current.speedMps ?? undefined,
            accuracyM: current.accuracyM ?? undefined,
            recordedAt: current.recordedAt.toISOString(),
          }
        : null);

    const eta = this.computeEta(
      ride,
      liveLoc
        ? {
            lat: liveLoc.lat,
            lng: liveLoc.lng,
            speedMps: liveLoc.speedMps,
          }
        : null,
    );

    const passengerFullName =
      (ride.passenger?.user as any)?.fullName ??
      ride.passenger?.fullName ??
      'Passenger';
    const passengerFirstName =
      passengerFullName.split(' ')[0] ?? 'Passenger';

    return {
      rideId: ride.id,
      shareToken,
      status: ride.status,
      passengerFirstName,
      pickup: {
        label: ride.fromLabel,
        lat: ride.fromLat,
        lng: ride.fromLng,
      },
      dropoff:
        ride.toLabel != null
          ? {
              label: ride.toLabel,
              lat: ride.toLat,
              lng: ride.toLng,
            }
          : null,
      driver: driverInfo,
      live: liveLoc,
      eta,
      isCompleted: ride.status === RideStatus.COMPLETED,
      isCancelled:
        ride.status === RideStatus.PASSENGER_CANCELLED ||
        ride.status === RideStatus.DRIVER_CANCELLED ||
        ride.status === RideStatus.ADMIN_CANCELLED ||
        ride.status === RideStatus.NO_SHOW,
      pickupAt: ride.pickupAt.toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  private computeEta(
    ride: {
      status: RideStatus;
      fromLat: number;
      fromLng: number;
      toLat: number | null;
      toLng: number | null;
    },
    live: { lat: number; lng: number; speedMps?: number } | null,
  ) {
    if (!live) return null;
    const toPickup =
      ride.status === RideStatus.BOOKED ||
      ride.status === RideStatus.DRIVER_EN_ROUTE ||
      ride.status === RideStatus.DRIVER_ARRIVED;
    const targetLat = toPickup ? ride.fromLat : ride.toLat;
    const targetLng = toPickup ? ride.fromLng : ride.toLng;
    if (targetLat == null || targetLng == null) return null;
    const distM = haversineM(live.lat, live.lng, targetLat, targetLng);
    const speed = live.speedMps && live.speedMps > 1 ? live.speedMps : 11; // ~40 km/h default
    const minutes = Math.max(1, Math.round(distM / speed / 60));
    return {
      minutes,
      target: toPickup ? 'PICKUP' : 'DROPOFF',
      distanceKm: Math.round((distM / 1000) * 10) / 10,
      updatedAt: new Date().toISOString(),
    };
  }

  private async maybeSample(
    rideId: string,
    driverId: string,
    loc: LiveLocation,
  ) {
    const last = await this.prisma.tripLocationSample.findFirst({
      where: { rideId },
      orderBy: { recordedAt: 'desc' },
    });
    const now = new Date(loc.recordedAt).getTime();
    if (last) {
      const dt = now - last.recordedAt.getTime();
      const dist = haversineM(last.lat, last.lng, loc.lat, loc.lng);
      if (dt < 20_000 && dist < 50) return;
    }

    const sample = await this.prisma.tripLocationSample.create({
      data: {
        rideId,
        driverId,
        lat: loc.lat,
        lng: loc.lng,
        heading: loc.heading,
        speedMps: loc.speedMps,
        recordedAt: new Date(loc.recordedAt),
      },
    });

    try {
      await this.prisma.$executeRawUnsafe(
        `UPDATE "TripLocationSample"
         SET geom = ST_SetSRID(ST_MakePoint($1, $2), 4326)
         WHERE id = $3`,
        loc.lng,
        loc.lat,
        sample.id,
      );
    } catch {
      /* ignore */
    }
  }
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
