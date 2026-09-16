import { DriverPayoutStatus } from '@prisma/client';

/** Mirrors DriverWalletService.assertPayoutTransition rules. */
function canTransition(from: DriverPayoutStatus, to: DriverPayoutStatus): boolean {
  const allowed: Record<DriverPayoutStatus, DriverPayoutStatus[]> = {
    [DriverPayoutStatus.REQUESTED]: [
      DriverPayoutStatus.PROCESSING,
      DriverPayoutStatus.FAILED,
    ],
    [DriverPayoutStatus.PROCESSING]: [
      DriverPayoutStatus.SUCCEEDED,
      DriverPayoutStatus.FAILED,
    ],
    [DriverPayoutStatus.SUCCEEDED]: [DriverPayoutStatus.REVERSED],
    [DriverPayoutStatus.FAILED]: [],
    [DriverPayoutStatus.REVERSED]: [],
  };
  return allowed[from]?.includes(to) === true;
}

describe('payout state machine', () => {
  it('allows REQUESTED → PROCESSING → SUCCEEDED', () => {
    expect(canTransition(DriverPayoutStatus.REQUESTED, DriverPayoutStatus.PROCESSING)).toBe(true);
    expect(canTransition(DriverPayoutStatus.PROCESSING, DriverPayoutStatus.SUCCEEDED)).toBe(true);
  });

  it('allows PROCESSING → FAILED (confirmed only)', () => {
    expect(canTransition(DriverPayoutStatus.PROCESSING, DriverPayoutStatus.FAILED)).toBe(true);
  });

  it('allows SUCCEEDED → REVERSED', () => {
    expect(canTransition(DriverPayoutStatus.SUCCEEDED, DriverPayoutStatus.REVERSED)).toBe(true);
  });

  it('rejects illegal transitions', () => {
    expect(canTransition(DriverPayoutStatus.FAILED, DriverPayoutStatus.SUCCEEDED)).toBe(false);
    expect(canTransition(DriverPayoutStatus.SUCCEEDED, DriverPayoutStatus.FAILED)).toBe(false);
    expect(canTransition(DriverPayoutStatus.REVERSED, DriverPayoutStatus.PROCESSING)).toBe(false);
  });
});
