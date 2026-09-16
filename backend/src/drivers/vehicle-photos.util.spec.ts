import { sanitizeContentDispositionFilename } from './vehicle-photos.util';

describe('vehicle-photos.util', () => {
  it('sanitizes content-disposition filenames', () => {
    expect(sanitizeContentDispositionFilename('a"b\nc.jpg')).toBe('abc.jpg');
    expect(sanitizeContentDispositionFilename('../../etc/passwd')).toBe(
      '.._.._etc_passwd',
    );
    expect(sanitizeContentDispositionFilename(null)).toBe('document');
  });
});
