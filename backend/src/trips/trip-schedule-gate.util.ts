import { type MapsProvider } from '../maps/maps-provider.interface';

export interface EnRouteEligibility {
  canGoEnRoute: boolean;
  isActivated: boolean;
  isScheduled: boolean;
  scheduledPickupAt: Date;
  activationOpensAt: Date;
  allowedEnRouteAt: Date;
  driveEtaMinutes: number;
  bufferMinutes: number;
  leadTimeMinutes: number;
  remainingMinutesUntilUnlock: number;
  remainingMinutesUntilActivation: number;
  reason?: string;
}

export interface ScheduleGateRideInput {
  pickupAt: Date | string;
  createdAt?: Date | string;
  fromLat: number;
  fromLng: number;
}

export interface ScheduleGateOptions {
  driverCoords?: { lat: number; lng: number } | null;
  maps?: MapsProvider | null;
  now?: Date;
  bufferMinutes?: number;
  maxLeadTimeMinutes?: number;
  immediateThresholdMinutes?: number;
}

export const SCHEDULE_GATE_DEFAULTS = {
  BUFFER_MINUTES: 15,
  MAX_LEAD_TIME_MINUTES: 120, // 2 hours
  IMMEDIATE_THRESHOLD_MINUTES: 15,
  FALLBACK_SPEED_KMH: 40,
  DEFAULT_ETA_MINUTES: 30,
};

export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function formatTimeFriendly(date: Date): string {
  try {
    return (
      date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'UTC',
      }) + ' UTC'
    );
  } catch {
    return date.toISOString();
  }
}

/**
 * Computes whether a scheduled ride is activated and whether a driver is eligible
 * to transition the ride to DRIVER_EN_ROUTE.
 *
 * Rules:
 * 1. Immediate rides (scheduled within 15 min of creation/now) are active and can go en route immediately.
 * 2. Past rides are active and can go en route immediately.
 * 3. Scheduled rides:
 *    - Activation window begins at max(2 hours before pickup, ETA + buffer).
 *    - Drive ETA is calculated from driver GPS to pickup location (Google Maps or Haversine at 40 km/h).
 *    - Buffer of 15 minutes is added for traffic, parking, and preparation.
 *    - Total lead time is capped at 120 minutes (2 hours).
 *    - Allowed en-route time = pickupAt - leadTime.
 *    - canGoEnRoute is true iff now >= allowedEnRouteAt.
 */
export async function computeEnRouteEligibility(
  ride: ScheduleGateRideInput,
  opts?: ScheduleGateOptions,
): Promise<EnRouteEligibility> {
  const now = opts?.now ?? new Date();
  const pickupAt =
    ride.pickupAt instanceof Date ? ride.pickupAt : new Date(ride.pickupAt);

  // If invalid pickupAt, fail-safe to allowing en-route
  if (Number.isNaN(pickupAt.getTime())) {
    return {
      canGoEnRoute: true,
      isActivated: true,
      isScheduled: false,
      scheduledPickupAt: now,
      activationOpensAt: now,
      allowedEnRouteAt: now,
      driveEtaMinutes: 0,
      bufferMinutes: 0,
      leadTimeMinutes: 0,
      remainingMinutesUntilUnlock: 0,
      remainingMinutesUntilActivation: 0,
    };
  }

  const createdAt = ride.createdAt
    ? ride.createdAt instanceof Date
      ? ride.createdAt
      : new Date(ride.createdAt)
    : pickupAt;

  const bufferMinutes =
    opts?.bufferMinutes ?? SCHEDULE_GATE_DEFAULTS.BUFFER_MINUTES;
  const maxLeadTimeMinutes =
    opts?.maxLeadTimeMinutes ?? SCHEDULE_GATE_DEFAULTS.MAX_LEAD_TIME_MINUTES;
  const immediateThresholdMinutes =
    opts?.immediateThresholdMinutes ??
    SCHEDULE_GATE_DEFAULTS.IMMEDIATE_THRESHOLD_MINUTES;

  // Immediate ride check: created for immediate pickup (<= immediateThresholdMinutes)
  const isCreatedImmediate =
    !Number.isNaN(createdAt.getTime()) &&
    pickupAt.getTime() - createdAt.getTime() <=
      immediateThresholdMinutes * 60_000;

  // Pickup is already in the past or right now
  const isPastOrDue = now.getTime() >= pickupAt.getTime();

  if (isCreatedImmediate && now.getTime() >= createdAt.getTime()) {
    return {
      canGoEnRoute: true,
      isActivated: true,
      isScheduled: false,
      scheduledPickupAt: pickupAt,
      activationOpensAt: createdAt,
      allowedEnRouteAt: createdAt,
      driveEtaMinutes: 0,
      bufferMinutes,
      leadTimeMinutes: 0,
      remainingMinutesUntilUnlock: 0,
      remainingMinutesUntilActivation: 0,
    };
  }

  if (isPastOrDue) {
    return {
      canGoEnRoute: true,
      isActivated: true,
      isScheduled: true,
      scheduledPickupAt: pickupAt,
      activationOpensAt: pickupAt,
      allowedEnRouteAt: pickupAt,
      driveEtaMinutes: 0,
      bufferMinutes,
      leadTimeMinutes: 0,
      remainingMinutesUntilUnlock: 0,
      remainingMinutesUntilActivation: 0,
    };
  }

  // Calculate driver ETA to pickup
  let driveEtaMinutes = SCHEDULE_GATE_DEFAULTS.DEFAULT_ETA_MINUTES;
  const driverCoords = opts?.driverCoords;

  if (
    driverCoords &&
    typeof driverCoords.lat === 'number' &&
    typeof driverCoords.lng === 'number' &&
    !Number.isNaN(driverCoords.lat) &&
    !Number.isNaN(driverCoords.lng)
  ) {
    let calculated = false;

    if (opts?.maps?.route) {
      try {
        const routeResult = await opts.maps.route(driverCoords, {
          lat: ride.fromLat,
          lng: ride.fromLng,
        });
        if (routeResult && typeof routeResult.durationMin === 'number') {
          driveEtaMinutes = Math.max(1, Math.ceil(routeResult.durationMin));
          calculated = true;
        }
      } catch {
        // Fallback to haversine if maps routing fails
      }
    }

    if (!calculated) {
      const distKm = haversineDistanceKm(
        driverCoords.lat,
        driverCoords.lng,
        ride.fromLat,
        ride.fromLng,
      );
      driveEtaMinutes = Math.max(
        5,
        Math.ceil((distKm / SCHEDULE_GATE_DEFAULTS.FALLBACK_SPEED_KMH) * 60),
      );
    }
  }

  const rawLeadTime = driveEtaMinutes + bufferMinutes;
  const leadTimeMinutes = Math.min(maxLeadTimeMinutes, rawLeadTime);
  const allowedEnRouteAt = new Date(
    pickupAt.getTime() - leadTimeMinutes * 60_000,
  );

  const activationOpensAt = new Date(
    pickupAt.getTime() - maxLeadTimeMinutes * 60_000,
  );
  const isActivated =
    now.getTime() >= activationOpensAt.getTime() ||
    now.getTime() >= allowedEnRouteAt.getTime();

  const canGoEnRoute = now.getTime() >= allowedEnRouteAt.getTime();
  const diffMs = allowedEnRouteAt.getTime() - now.getTime();
  const remainingMinutesUntilUnlock = canGoEnRoute
    ? 0
    : Math.max(0, Math.ceil(diffMs / 60_000));

  const diffActMs = activationOpensAt.getTime() - now.getTime();
  const remainingMinutesUntilActivation = isActivated
    ? 0
    : Math.max(0, Math.ceil(diffActMs / 60_000));

  let reason: string | undefined;
  if (!canGoEnRoute) {
    if (!isActivated) {
      reason =
        `Ride activates 2 hours before scheduled pickup. ` +
        `Scheduled for ${formatTimeFriendly(pickupAt)}. ` +
        `Activation opens at ${formatTimeFriendly(activationOpensAt)} (in ${remainingMinutesUntilActivation} mins).`;
    } else {
      reason =
        `Cannot start en route yet. This ride is scheduled for ${formatTimeFriendly(pickupAt)}. ` +
        `Based on your travel ETA (${driveEtaMinutes} mins + ${bufferMinutes}m buffer), ` +
        `you can start en route at ${formatTimeFriendly(allowedEnRouteAt)} (in ${remainingMinutesUntilUnlock} mins).`;
    }
  }

  return {
    canGoEnRoute,
    isActivated,
    isScheduled: true,
    scheduledPickupAt: pickupAt,
    activationOpensAt,
    allowedEnRouteAt,
    driveEtaMinutes,
    bufferMinutes,
    leadTimeMinutes,
    remainingMinutesUntilUnlock,
    remainingMinutesUntilActivation,
    reason,
  };
}
