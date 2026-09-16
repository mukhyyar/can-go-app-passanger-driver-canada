import {
  AVATAR_MAX_BYTES,
  collectAvatarKeys,
  hasValidImageStructure,
  looksLikeUnsafeMarkup,
  validateAvatarBuffer,
} from './avatar.logic';

/** Minimal valid 1x1 PNG */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('avatar.logic', () => {
  it('accepts a real PNG sniffed as image/png', () => {
    const res = validateAvatarBuffer({
      buffer: PNG_1X1,
      clientMime: 'application/octet-stream',
      detectedMime: 'image/png',
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.mime).toBe('image/png');
      expect(res.ext).toBe('png');
    }
  });

  it('rejects SVG / markup even if client claims jpeg', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(looksLikeUnsafeMarkup(svg)).toBe(true);
    const res = validateAvatarBuffer({
      buffer: svg,
      clientMime: 'image/jpeg',
      detectedMime: null,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('INVALID_IMAGE');
  });

  it('rejects oversized buffers', () => {
    const res = validateAvatarBuffer({
      buffer: Buffer.alloc(AVATAR_MAX_BYTES + 1, 0xff),
      clientMime: 'image/jpeg',
      detectedMime: 'image/jpeg',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('IMAGE_TOO_LARGE');
  });

  it('rejects corrupt jpeg (bad structure)', () => {
    const buf = Buffer.from([0xff, 0xd8, 0x00, 0x01, 0x02]);
    expect(hasValidImageStructure(buf, 'image/jpeg')).toBe(false);
    const res = validateAvatarBuffer({
      buffer: buf,
      clientMime: 'image/jpeg',
      detectedMime: 'image/jpeg',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('INVALID_IMAGE');
  });

  it('does not trust client mime alone for empty sniff mismatch', () => {
    const res = validateAvatarBuffer({
      buffer: Buffer.from('not-an-image-at-all!!'),
      clientMime: 'image/jpeg',
      detectedMime: null,
    });
    expect(res.ok).toBe(false);
  });

  it('collectAvatarKeys dedupes passenger/driver keys', () => {
    expect(
      collectAvatarKeys({
        passengerKey: 'a/1.jpg',
        driverKey: 'a/1.jpg',
      }),
    ).toEqual(['a/1.jpg']);
    expect(
      collectAvatarKeys({
        passengerKey: 'a/1.jpg',
        driverKey: 'b/2.jpg',
      }).sort(),
    ).toEqual(['a/1.jpg', 'b/2.jpg']);
  });
});
