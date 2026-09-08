'use client';

/** Same passenger-app brand assets (`public/brand` from web-passenger). */
export function BrandLogo({
  size = 36,
  variant = 'mark',
  className,
}: {
  size?: number;
  variant?: 'mark' | 'lockup';
  className?: string;
}) {
  const src = variant === 'lockup' ? '/brand/can-go-logo.png' : '/brand/can-go-mark.png';
  const width = variant === 'lockup' ? Math.round(size * 0.81) : size;
  const height = size;
  return (
    <img
      src={src}
      alt="CAN-GO"
      width={width}
      height={height}
      className={className}
      style={{ display: 'block', objectFit: 'contain', height: size, width: variant === 'lockup' ? 'auto' : size }}
    />
  );
}
