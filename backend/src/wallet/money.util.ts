import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export type MoneyDecimal = Decimal;

const ZERO = new Decimal(0);

/** Currency precision map — CAD MVP uses 2 dp; extend carefully for multi-currency. */
export function currencyScale(currency: string): number {
  switch (currency.toUpperCase()) {
    case 'CAD':
    case 'USD':
    case 'EUR':
    case 'GBP':
      return 2;
    default:
      return 2;
  }
}

export function d(value: Prisma.Decimal | Decimal | string | number): Decimal {
  if (value instanceof Decimal) return value;
  return new Decimal(value as string | number);
}

export function moneyZero(): Decimal {
  return ZERO;
}

/**
 * Normalize and validate a monetary amount for persistence.
 * Rejects zero, negative, NaN, and unsupported precision.
 * Never use JS number arithmetic for wallet balances.
 */
export function normalizeMoney(
  raw: unknown,
  currency: string,
): Decimal {
  if (raw === null || raw === undefined) {
    throw new BadRequestException({
      code: 'INVALID_AMOUNT',
      message: 'Amount is required',
    });
  }
  let parsed: Decimal;
  try {
    if (typeof raw === 'number') {
      if (!Number.isFinite(raw)) {
        throw new Error('nan');
      }
      // Accept only for display→API boundary; convert via string to avoid binary float noise.
      parsed = new Decimal(String(raw));
    } else if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed || /[eE]/.test(trimmed)) {
        throw new Error('malformed');
      }
      parsed = new Decimal(trimmed);
    } else if (raw instanceof Decimal || Decimal.isDecimal(raw)) {
      parsed = d(raw as Decimal);
    } else {
      throw new Error('malformed');
    }
  } catch {
    throw new BadRequestException({
      code: 'INVALID_AMOUNT',
      message: 'Amount is malformed',
    });
  }

  if (parsed.isNaN() || !parsed.isFinite()) {
    throw new BadRequestException({
      code: 'INVALID_AMOUNT',
      message: 'Amount is not a finite number',
    });
  }
  if (parsed.lte(0)) {
    throw new BadRequestException({
      code: 'INVALID_AMOUNT',
      message: 'Amount must be positive',
    });
  }

  const scale = currencyScale(currency);
  if (parsed.decimalPlaces() > scale) {
    throw new BadRequestException({
      code: 'INVALID_AMOUNT',
      message: `Amount precision exceeds ${scale} decimal places for ${currency}`,
    });
  }

  return parsed.toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);
}

export function moneyToString(value: Decimal | Prisma.Decimal, currency: string): string {
  const scale = currencyScale(currency);
  return d(value).toFixed(scale);
}

/** Convert Decimal to integer minor units without float multiply. */
export function moneyToMinorUnits(value: Decimal, currency: string): number {
  const scale = currencyScale(currency);
  const normalized = value.toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);
  const minor = normalized.mul(new Decimal(10).pow(scale));
  if (!minor.isInteger()) {
    throw new BadRequestException({
      code: 'INVALID_AMOUNT',
      message: 'Amount cannot convert to integer minor units',
    });
  }
  return minor.toNumber();
}

/** Provider boundary: Decimal → number for legacy PayoutBatchItem (cents already validated). */
export function moneyToProviderNumber(value: Decimal, currency: string): number {
  const scale = currencyScale(currency);
  return Number(value.toFixed(scale));
}

export function sumMoney(values: Array<Decimal | Prisma.Decimal>): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(d(v)), ZERO);
}

export function moneyCmp(a: Decimal | Prisma.Decimal, b: Decimal | Prisma.Decimal): number {
  return d(a).cmp(d(b));
}

export function moneyGte(a: Decimal | Prisma.Decimal, b: Decimal | Prisma.Decimal): boolean {
  return d(a).gte(d(b));
}

export function moneyLt(a: Decimal | Prisma.Decimal, b: Decimal | Prisma.Decimal): boolean {
  return d(a).lt(d(b));
}

export function moneyIsNegative(a: Decimal | Prisma.Decimal): boolean {
  return d(a).isNegative();
}
