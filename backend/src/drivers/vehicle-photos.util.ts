/**
 * Canonical ordering for vehicle cover / primary photo.
 * Do not rely on implicit DB insertion order elsewhere.
 */
export const VEHICLE_PHOTO_PRIMARY_ORDER = [
  { createdAt: 'asc' as const },
  { id: 'asc' as const },
];

export function sanitizeContentDispositionFilename(raw: string | null | undefined): string {
  const base = (raw ?? 'document').replace(/[\r\n"]/g, '').trim() || 'document';
  // Strip path separators and control chars for header safety.
  return base.replace(/[\\/<>:|?*\u0000-\u001f]/g, '_').slice(0, 180);
}
