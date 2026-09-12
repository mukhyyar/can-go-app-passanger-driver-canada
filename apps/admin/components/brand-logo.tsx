'use client';

/** CAN-RIDE brand assets from `public/brand`. */
export function BrandLogo({
  size = 36,
  variant = 'mark',
  className,
}: {
  size?: number;
  variant?: 'mark' | 'lockup';
  className?: string;
}) {
  const src = variant === 'lockup' ? '/brand/can-ride-logo.png' : '/brand/can-ride-mark.png';
  const width = variant === 'lockup' ? Math.round(size * 3.1) : size;
  const height = size;
  return (
    <img
      src={src}
      alt="CAN-RIDE"
      width={width}
      height={height}
      className={className}
      style={{ display: 'block', objectFit: 'contain', height: size, width: variant === 'lockup' ? 'auto' : size }}
    />
  );
}
