import { RideStatus } from '@prisma/client';
import { OPEN_MARKETPLACE_STATUSES } from './ride-lifecycle';

export function isPassengerEditableStatus(status: RideStatus): boolean {
  return OPEN_MARKETPLACE_STATUSES.includes(status);
}

export type RideEditComparable = {
  fromLabel: string;
  toLabel: string | null;
  fromLat: number;
  fromLng: number;
  toLat: number | null;
  toLng: number | null;
  pickupAt: Date | string;
  returnAt?: Date | string | null;
  isRoundTrip?: boolean;
  vehicleClassIds: string[];
  hours?: number | null;
  days?: number | null;
};

function sameNum(a: number | null | undefined, b: number | null | undefined) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(Number(a) - Number(b)) < 1e-9;
}

function sameInstant(a: Date | string | null | undefined, b: Date | string | null | undefined) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return new Date(a).getTime() === new Date(b).getTime();
}

function sameClassIds(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

/** Route / time / vehicle changes invalidate open offers. */
export function isMaterialRideEdit(
  before: RideEditComparable,
  after: RideEditComparable,
): boolean {
  if (before.fromLabel !== after.fromLabel) return true;
  if ((before.toLabel ?? '') !== (after.toLabel ?? '')) return true;
  if (!sameNum(before.fromLat, after.fromLat)) return true;
  if (!sameNum(before.fromLng, after.fromLng)) return true;
  if (!sameNum(before.toLat, after.toLat)) return true;
  if (!sameNum(before.toLng, after.toLng)) return true;
  if (!sameInstant(before.pickupAt, after.pickupAt)) return true;
  if (!sameInstant(before.returnAt, after.returnAt)) return true;
  if (Boolean(before.isRoundTrip) !== Boolean(after.isRoundTrip)) return true;
  if (!sameClassIds(before.vehicleClassIds, after.vehicleClassIds)) return true;
  if (!sameNum(before.hours ?? null, after.hours ?? null)) return true;
  if (!sameNum(before.days ?? null, after.days ?? null)) return true;
  return false;
}
