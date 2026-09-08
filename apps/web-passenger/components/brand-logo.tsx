'use client';

type BrandLogoProps = {
  size?: number;
  /** `mark` is the maple-compass from the passenger app; `wordmark` is the same mark. */
  variant?: 'mark' | 'wordmark';
};

export function BrandLogo({ size = 48, variant = 'mark' }: BrandLogoProps) {
  return (
    <img
      src="/brand/can-go-mark.png"
      alt="CAN-GO"
      width={size}
      height={size}
      className={variant === 'wordmark' ? 'brand-mark brand-mark-lg' : 'brand-mark'}
    />
  );
}
