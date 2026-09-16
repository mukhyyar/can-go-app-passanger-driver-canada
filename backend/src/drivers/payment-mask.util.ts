/** Last-4 / masked account representation only — never full account numbers. */

const MASK_MAX_LEN = 24;

export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * Canonicalize to `****1234`, or return null if the value looks unsafe / invalid.
 */
export function normalizeAccountMask(raw: string | undefined | null): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed || trimmed.length > MASK_MAX_LEN) return null;

  const digits = digitsOnly(trimmed);
  if (digits.length !== 4) return null;

  const stripped = trimmed.replace(/[\s\-*•]/g, '');
  if (/\d{5,}/.test(stripped)) return null;

  const compact = trimmed.replace(/\s/g, '');
  const looksMasked =
    /^[\*•xX·\-]*\d{4}$/.test(compact) || /^\d{4}$/.test(compact);
  if (!looksMasked) return null;

  return `****${digits}`;
}

export function assertSafeAccountMask(raw: string | undefined | null): string {
  const normalized = normalizeAccountMask(raw);
  if (!normalized) {
    throw new Error('ACCOUNT_MASK_INVALID');
  }
  return normalized;
}
