import { WalletDirection, WalletEntryStatus, WalletEntryType } from '@prisma/client';

/** Pure rule mirroring adminReleaseEntry eligibility. */
function canReleaseEarning(entry: {
  type: WalletEntryType;
  direction: WalletDirection;
  status: WalletEntryStatus;
  availableAt: Date | null;
  now: Date;
}): { releasable: boolean; alreadyAvailable: boolean } {
  if (
    entry.type !== WalletEntryType.EARNING ||
    entry.direction !== WalletDirection.CREDIT
  ) {
    return { releasable: false, alreadyAvailable: false };
  }
  if (
    entry.status === WalletEntryStatus.FAILED ||
    entry.status === WalletEntryStatus.REVERSED
  ) {
    return { releasable: false, alreadyAvailable: false };
  }
  const alreadyAvailable =
    !entry.availableAt || entry.availableAt <= entry.now;
  if (alreadyAvailable && entry.status === WalletEntryStatus.POSTED) {
    return { releasable: false, alreadyAvailable: true };
  }
  return { releasable: true, alreadyAvailable: false };
}

describe('admin hold release rules', () => {
  const now = new Date('2026-09-17T12:00:00.000Z');

  it('allows releasing pending earning still on hold', () => {
    const r = canReleaseEarning({
      type: WalletEntryType.EARNING,
      direction: WalletDirection.CREDIT,
      status: WalletEntryStatus.PENDING,
      availableAt: new Date('2026-09-20T12:00:00.000Z'),
      now,
    });
    expect(r).toEqual({ releasable: true, alreadyAvailable: false });
  });

  it('is idempotent when already available', () => {
    const r = canReleaseEarning({
      type: WalletEntryType.EARNING,
      direction: WalletDirection.CREDIT,
      status: WalletEntryStatus.POSTED,
      availableAt: new Date('2026-09-10T12:00:00.000Z'),
      now,
    });
    expect(r).toEqual({ releasable: false, alreadyAvailable: true });
  });

  it('rejects payout debits', () => {
    const r = canReleaseEarning({
      type: WalletEntryType.PAYOUT,
      direction: WalletDirection.DEBIT,
      status: WalletEntryStatus.PENDING,
      availableAt: null,
      now,
    });
    expect(r.releasable).toBe(false);
  });
});
