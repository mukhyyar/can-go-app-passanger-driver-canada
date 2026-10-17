export function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInputValue(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toPickupIso(pickupNow: boolean, value: string): string {
  const d = pickupNow ? new Date() : fromLocalInputValue(value) ?? new Date();
  return d.toISOString();
}

export function getMinPickupInputValue(now: Date = new Date()): string {
  return toLocalInputValue(now);
}

export function getMinReturnInputValue(pickupNow: boolean, pickupValue: string, now: Date = new Date()): string {
  const pickupDate = pickupNow ? now : fromLocalInputValue(pickupValue);
  if (!pickupDate || Number.isNaN(pickupDate.getTime())) {
    return toLocalInputValue(now);
  }
  const base = pickupDate.getTime() > now.getTime() ? pickupDate : now;
  return toLocalInputValue(base);
}

export function isPastDate(d: Date | null, graceMinutes = 2): boolean {
  if (!d || Number.isNaN(d.getTime())) return true;
  return d.getTime() < Date.now() - graceMinutes * 60 * 1000;
}
