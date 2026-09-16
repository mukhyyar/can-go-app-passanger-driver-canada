import { normalizeAccountMask } from './payment-mask.util';

describe('normalizeAccountMask', () => {
  it('accepts last 4 digits', () => {
    expect(normalizeAccountMask('1234')).toBe('****1234');
  });

  it('accepts already-masked values', () => {
    expect(normalizeAccountMask('****5678')).toBe('****5678');
    expect(normalizeAccountMask('••••9012')).toBe('****9012');
  });

  it('rejects full account / card-like numbers', () => {
    expect(normalizeAccountMask('123456789012')).toBeNull();
    expect(normalizeAccountMask('4111111111111111')).toBeNull();
    expect(normalizeAccountMask('12 34 56 78 90')).toBeNull();
  });

  it('rejects empty and oversized', () => {
    expect(normalizeAccountMask('')).toBeNull();
    expect(normalizeAccountMask('   ')).toBeNull();
    expect(normalizeAccountMask('1'.repeat(30))).toBeNull();
  });

  it('trims whitespace around last-4', () => {
    expect(normalizeAccountMask('  4321  ')).toBe('****4321');
  });
});
