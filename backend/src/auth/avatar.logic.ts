/** Shared avatar upload validation (unit-tested; used by AuthService). */

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export type AvatarValidationOk = {
  ok: true;
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
  ext: 'jpg' | 'png' | 'webp';
};

export type AvatarValidationErr = {
  ok: false;
  code: 'INVALID_IMAGE' | 'IMAGE_TOO_LARGE';
  message: string;
};

export type AvatarValidationResult = AvatarValidationOk | AvatarValidationErr;

export function normalizeImageMime(m?: string | null): string | undefined {
  if (!m) return undefined;
  const lower = m.toLowerCase().trim();
  if (lower === 'image/jpg') return 'image/jpeg';
  return lower;
}

/** Reject obvious non-raster payloads (SVG, HTML, XML). */
export function looksLikeUnsafeMarkup(buf: Buffer): boolean {
  if (!buf.length) return true;
  const head = buf
    .subarray(0, Math.min(buf.length, 256))
    .toString('utf8')
    .trimStart()
    .toLowerCase();
  return (
    head.startsWith('<svg') ||
    head.startsWith('<?xml') ||
    head.startsWith('<!doctype') ||
    head.startsWith('<html')
  );
}

/** Minimal structural checks so we reject truncated/corrupt files. */
export function hasValidImageStructure(
  buf: Buffer,
  mime: string,
): boolean {
  if (buf.length < 12) return false;
  if (mime === 'image/jpeg') {
    // SOI + somewhere an EOI (or at least APP0/SOF markers after SOI)
    if (buf[0] !== 0xff || buf[1] !== 0xd8) return false;
    // Require at least one additional JPEG marker
    for (let i = 2; i < Math.min(buf.length - 1, 64); i++) {
      if (buf[i] === 0xff && buf[i + 1] !== 0x00) return true;
    }
    return buf.includes(Buffer.from([0xff, 0xd9]));
  }
  if (mime === 'image/png') {
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (!buf.subarray(0, 8).equals(sig)) return false;
    // IHDR chunk type at offset 12
    return buf.subarray(12, 16).toString('ascii') === 'IHDR';
  }
  if (mime === 'image/webp') {
    return (
      buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buf.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  return false;
}

export function mimeToExt(
  mime: 'image/jpeg' | 'image/png' | 'image/webp',
): 'jpg' | 'png' | 'webp' {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

/**
 * Validate avatar bytes. Prefer sniffed MIME over client-declared MIME.
 * Client MIME alone is never enough to accept.
 */
export function validateAvatarBuffer(params: {
  buffer: Buffer;
  clientMime?: string | null;
  detectedMime?: string | null;
  maxBytes?: number;
}): AvatarValidationResult {
  const max = params.maxBytes ?? AVATAR_MAX_BYTES;
  if (!params.buffer?.length) {
    return {
      ok: false,
      code: 'INVALID_IMAGE',
      message: 'Avatar file is empty',
    };
  }
  if (params.buffer.length > max) {
    return {
      ok: false,
      code: 'IMAGE_TOO_LARGE',
      message: `Avatar max size is ${Math.floor(max / (1024 * 1024))}MB`,
    };
  }
  if (looksLikeUnsafeMarkup(params.buffer)) {
    return {
      ok: false,
      code: 'INVALID_IMAGE',
      message: 'Avatar must be jpeg, png, or webp',
    };
  }

  const sniffed = normalizeImageMime(params.detectedMime);
  const client = normalizeImageMime(params.clientMime);
  // Require sniff when possible; fall back to client only if sniff failed
  // but structure still validates for an allowed type.
  let mime = sniffed;
  if (!mime || !AVATAR_ALLOWED_MIMES.has(mime)) {
    if (client && AVATAR_ALLOWED_MIMES.has(client)) {
      mime = client;
    } else {
      return {
        ok: false,
        code: 'INVALID_IMAGE',
        message: 'Avatar must be jpeg, png, or webp',
      };
    }
  }

  if (!AVATAR_ALLOWED_MIMES.has(mime)) {
    return {
      ok: false,
      code: 'INVALID_IMAGE',
      message: 'Avatar must be jpeg, png, or webp',
    };
  }

  if (!hasValidImageStructure(params.buffer, mime)) {
    return {
      ok: false,
      code: 'INVALID_IMAGE',
      message: 'Avatar image is corrupt or unsupported',
    };
  }

  const typed = mime as 'image/jpeg' | 'image/png' | 'image/webp';
  return { ok: true, mime: typed, ext: mimeToExt(typed) };
}

/** Collect unique previous storage keys from passenger/driver profiles. */
export function collectAvatarKeys(profiles: {
  passengerKey?: string | null;
  driverKey?: string | null;
}): string[] {
  const keys = new Set<string>();
  if (profiles.passengerKey) keys.add(profiles.passengerKey);
  if (profiles.driverKey) keys.add(profiles.driverKey);
  return [...keys];
}
