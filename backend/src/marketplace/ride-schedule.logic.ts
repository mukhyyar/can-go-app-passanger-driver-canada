import { BadRequestException } from '@nestjs/common';

export interface RideScheduleValidationParams {
  pickupAt: Date;
  isPickupExplicitlyUpdated?: boolean;
  isRoundTrip?: boolean;
  returnAt?: Date | null;
  isReturnExplicitlyUpdated?: boolean;
  now?: number;
  graceMs?: number;
}

/**
 * Validates that:
 * 1. Pickup time is not in the past (with grace period for clock drift).
 * 2. Return time is provided when isRoundTrip is true.
 * 3. Return time is not in the past.
 * 4. Return time is strictly after pickup time.
 */
export function validateRideSchedule(opts: RideScheduleValidationParams): void {
  const now = opts.now ?? Date.now();
  const graceMs = opts.graceMs ?? 5 * 60 * 1000;
  const nowGrace = now - graceMs;

  if (Number.isNaN(opts.pickupAt.getTime())) {
    throw new BadRequestException('Invalid pickupAt');
  }

  // If new ride or explicitly updated pickupAt, cannot be in the past
  if (opts.isPickupExplicitlyUpdated !== false && opts.pickupAt.getTime() < nowGrace) {
    throw new BadRequestException('Pickup time cannot be in the past');
  }

  if (opts.isRoundTrip) {
    if (!opts.returnAt) {
      throw new BadRequestException('returnAt required for round-trip rides');
    }
    if (Number.isNaN(opts.returnAt.getTime())) {
      throw new BadRequestException('Invalid returnAt');
    }
    if (opts.isReturnExplicitlyUpdated !== false && opts.returnAt.getTime() < nowGrace) {
      throw new BadRequestException('Return time cannot be in the past');
    }
    if (opts.returnAt.getTime() <= opts.pickupAt.getTime()) {
      throw new BadRequestException('Return time must be after pickup time');
    }
  }
}
