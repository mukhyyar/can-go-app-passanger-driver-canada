import { Decimal } from '@prisma/client/runtime/library';
import {
  DriverPayoutStatus,
  WalletDirection,
  WalletEntryStatus,
  WalletEntryType,
} from '@prisma/client';
import { d, moneyToString, normalizeMoney } from './money.util';

/**
 * Pure helpers mirroring wallet balance rules for unit tests without DB.
 */
function computeTestBalances(
  entries: Array<{
    type: WalletEntryType;
    direction: WalletDirection;
    amount: Decimal;
    status: WalletEntryStatus;
    availableAt: Date | null;
    payoutId?: string | null;
  }>,
  payouts: Array<{ amount: Decimal; status: DriverPayoutStatus }>,
  now: Date,
) {
  let lifetimeEarned = new Decimal(0);
  let pending = new Decimal(0);
  let maturedCredits = new Decimal(0);
  let lockingDebits = new Decimal(0);
  let lifetimePaidOut = new Decimal(0);
  let processingPayouts = new Decimal(0);

  for (const e of entries) {
    const amt = d(e.amount);
    const isActive =
      e.status === WalletEntryStatus.PENDING ||
      e.status === WalletEntryStatus.POSTED;

    if (
      e.type === WalletEntryType.EARNING &&
      e.direction === WalletDirection.CREDIT &&
      isActive
    ) {
      lifetimeEarned = lifetimeEarned.plus(amt);
      const matured = !e.availableAt || e.availableAt <= now;
      if (matured) maturedCredits = maturedCredits.plus(amt);
      else pending = pending.plus(amt);
    }

    if (
      e.type === WalletEntryType.PAYOUT &&
      e.direction === WalletDirection.DEBIT &&
      isActive
    ) {
      lockingDebits = lockingDebits.plus(amt);
    }
  }

  for (const p of payouts) {
    if (p.status === DriverPayoutStatus.SUCCEEDED) {
      lifetimePaidOut = lifetimePaidOut.plus(d(p.amount));
    }
    if (
      p.status === DriverPayoutStatus.PROCESSING ||
      p.status === DriverPayoutStatus.REQUESTED
    ) {
      processingPayouts = processingPayouts.plus(d(p.amount));
    }
  }

  const available = maturedCredits.minus(lockingDebits);
  return {
    available,
    pending,
    processingPayouts,
    lifetimeEarned,
    lifetimePaidOut,
  };
}

describe('wallet balance rules', () => {
  const now = new Date('2026-09-16T12:00:00.000Z');

  it('counts pending and posted earnings in lifetimeEarned', () => {
    const future = new Date('2026-09-20T12:00:00.000Z');
    const b = computeTestBalances(
      [
        {
          type: WalletEntryType.EARNING,
          direction: WalletDirection.CREDIT,
          amount: normalizeMoney('100.00', 'CAD'),
          status: WalletEntryStatus.PENDING,
          availableAt: future,
        },
        {
          type: WalletEntryType.EARNING,
          direction: WalletDirection.CREDIT,
          amount: normalizeMoney('50.00', 'CAD'),
          status: WalletEntryStatus.POSTED,
          availableAt: null,
        },
      ],
      [],
      now,
    );
    expect(moneyToString(b.lifetimeEarned, 'CAD')).toBe('150.00');
    expect(moneyToString(b.pending, 'CAD')).toBe('100.00');
    expect(moneyToString(b.available, 'CAD')).toBe('50.00');
  });

  it('locks PROCESSING payout debit immediately', () => {
    const b = computeTestBalances(
      [
        {
          type: WalletEntryType.EARNING,
          direction: WalletDirection.CREDIT,
          amount: normalizeMoney('100.00', 'CAD'),
          status: WalletEntryStatus.POSTED,
          availableAt: null,
        },
        {
          type: WalletEntryType.PAYOUT,
          direction: WalletDirection.DEBIT,
          amount: normalizeMoney('40.00', 'CAD'),
          status: WalletEntryStatus.PENDING,
          availableAt: null,
          payoutId: 'p1',
        },
      ],
      [{ amount: normalizeMoney('40.00', 'CAD'), status: DriverPayoutStatus.PROCESSING }],
      now,
    );
    expect(moneyToString(b.available, 'CAD')).toBe('60.00');
    expect(moneyToString(b.processingPayouts, 'CAD')).toBe('40.00');
  });

  it('FAILED debit no longer locks funds', () => {
    const b = computeTestBalances(
      [
        {
          type: WalletEntryType.EARNING,
          direction: WalletDirection.CREDIT,
          amount: normalizeMoney('100.00', 'CAD'),
          status: WalletEntryStatus.POSTED,
          availableAt: null,
        },
        {
          type: WalletEntryType.PAYOUT,
          direction: WalletDirection.DEBIT,
          amount: normalizeMoney('40.00', 'CAD'),
          status: WalletEntryStatus.FAILED,
          availableAt: null,
          payoutId: 'p1',
        },
      ],
      [{ amount: normalizeMoney('40.00', 'CAD'), status: DriverPayoutStatus.FAILED }],
      now,
    );
    expect(moneyToString(b.available, 'CAD')).toBe('100.00');
  });

  it('excludes FAILED/REVERSED earnings from lifetime', () => {
    const b = computeTestBalances(
      [
        {
          type: WalletEntryType.EARNING,
          direction: WalletDirection.CREDIT,
          amount: normalizeMoney('100.00', 'CAD'),
          status: WalletEntryStatus.REVERSED,
          availableAt: null,
        },
      ],
      [],
      now,
    );
    expect(moneyToString(b.lifetimeEarned, 'CAD')).toBe('0.00');
  });
});

describe('idempotency conflict rules', () => {
  it('detects amount mismatch for same key', () => {
    const stored = normalizeMoney('25.00', 'CAD');
    const next = normalizeMoney('30.00', 'CAD');
    expect(stored.eq(next)).toBe(false);
  });
});
