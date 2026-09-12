'use client';

type BrandLogoProps = {
  size?: number;
  /** `mark` = maple+road symbol; `wordmark` / `lockup` = horizontal logo. */
  variant?: 'mark' | 'wordmark' | 'lockup';
  /** White lockup/mark for dark backgrounds. */
  invert?: boolean;
};

export function BrandLogo({ size = 48, variant = 'mark', invert = false }: BrandLogoProps) {
  const lockup = variant === 'wordmark' || variant === 'lockup';
  const src = lockup
    ? invert
      ? '/brand/can-ride-logo-white.png'
      : '/brand/can-ride-logo.png'
    : invert
      ? '/brand/can-ride-mark-white.png'
      : '/brand/can-ride-mark.png';
  return (
    <img
      src={src}
      alt="CAN-RIDE"
      width={lockup ? Math.round(size * 3.55) : size}
      height={size}
      className={lockup ? 'brand-mark brand-mark-lg' : 'brand-mark'}
      style={{ display: 'block', objectFit: 'contain', height: size, width: lockup ? 'auto' : size }}
    />
  );
}
