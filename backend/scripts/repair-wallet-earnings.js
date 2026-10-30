/**
 * Reconcile and repair driver wallet earnings that were overcredited with gross bidAmount
 * instead of net driverEarning.
 *
 * Usage:
 *   node scripts/repair-wallet-earnings.js            # dry-run (default)
 *   node scripts/repair-wallet-earnings.js --apply    # write changes
 *   node scripts/repair-wallet-earnings.js --limit=200
 */
/* eslint-disable no-console */
const path = require('path');
const {
  PrismaClient,
  WalletEntryType,
  WalletDirection,
  WalletEntryStatus,
} = require('@prisma/client');
const { Decimal } = require('@prisma/client/runtime/library');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const prisma = new PrismaClient();

function parseArgs(argv) {
  const apply = argv.includes('--apply');
  const limitArg = argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg
    ? Math.max(1, Number(limitArg.split('=')[1]) || 500)
    : 500;
  return { dryRun: !apply, limit };
}

function computeExpectedNetEarning(snap) {
  if (!snap || typeof snap !== 'object') return null;

  if (snap.driverEarning != null) {
    const tip = Number(snap.tipAmount ?? snap.tip ?? 0);
    const earn = Number(snap.driverEarning);
    if (Number.isFinite(earn)) {
      return Number(Math.max(0, earn - tip).toFixed(2));
    }
  }

  if (snap.subtotal != null || snap.bidAmount != null) {
    const fare = Number(snap.subtotal ?? snap.bidAmount);
    const fee = Number(snap.platformFee ?? snap.marketplaceFee ?? fare * 0.2);
    if (Number.isFinite(fare) && Number.isFinite(fee)) {
      return Number(Math.max(0, fare - fee).toFixed(2));
    }
  }

  return null;
}

async function main() {
  const { dryRun, limit } = parseArgs(process.argv.slice(2));
  console.log(
    `[repair-wallet-earnings] Starting in ${dryRun ? 'DRY-RUN' : 'APPLY'} mode (limit: ${limit})`,
  );

  const entries = await prisma.driverWalletEntry.findMany({
    where: {
      type: WalletEntryType.EARNING,
      direction: WalletDirection.CREDIT,
      rideId: { not: null },
      status: {
        in: [WalletEntryStatus.PENDING, WalletEntryStatus.POSTED],
      },
    },
    include: {
      ride: {
        select: {
          id: true,
          status: true,
          priceSnapshot: true,
          currency: true,
        },
      },
      driver: {
        select: {
          id: true,
          userId: true,
          fullName: true,
        },
      },
    },
    take: limit,
    orderBy: { createdAt: 'desc' },
  });

  const discrepancies = [];

  for (const entry of entries) {
    if (!entry.ride?.priceSnapshot) continue;
    const snap = entry.ride.priceSnapshot;
    const expected = computeExpectedNetEarning(snap);
    if (expected == null) continue;

    const actual = Number(entry.amount);
    const diff = Number((actual - expected).toFixed(2));

    // Overcredited if actual > expected (e.g. 200.00 vs 160.00)
    if (diff > 0.009) {
      discrepancies.push({
        entryId: entry.id,
        driverId: entry.driverId,
        driverName: entry.driver.fullName,
        rideId: entry.rideId,
        status: entry.status,
        currency: entry.currency,
        actual,
        expected,
        diff,
      });
    }
  }

  console.log(
    `[repair-wallet-earnings] Scanned ${entries.length} entries. Found ${discrepancies.length} overcredited entries.`,
  );

  if (discrepancies.length === 0) {
    console.log('[repair-wallet-earnings] No discrepancies found.');
    return;
  }

  for (const d of discrepancies) {
    console.log(
      `  - Entry ${d.entryId} (Driver: ${d.driverName}, Ride: ${d.rideId}) | Status: ${d.status} | Actual: ${d.currency} ${d.actual.toFixed(2)} -> Expected: ${d.currency} ${d.expected.toFixed(2)} (Diff: ${d.currency} ${d.diff.toFixed(2)})`,
    );

    if (!dryRun) {
      await prisma.$transaction(async (tx) => {
        if (d.status === WalletEntryStatus.PENDING) {
          // For PENDING (unreleased on-hold earnings), directly correct entry amount
          await tx.driverWalletEntry.update({
            where: { id: d.entryId },
            data: {
              amount: new Decimal(d.expected.toFixed(2)),
              description: `Trip earning (reconciled) · net earning`,
            },
          });
        } else {
          // For POSTED (already available/matured), add audit DEBIT adjustment to reconcile
          await tx.driverWalletEntry.create({
            data: {
              driverId: d.driverId,
              rideId: d.rideId,
              type: WalletEntryType.ADJUSTMENT,
              direction: WalletDirection.DEBIT,
              amount: new Decimal(d.diff.toFixed(2)),
              currency: d.currency,
              status: WalletEntryStatus.POSTED,
              description: `Platform commission reconciliation for trip`,
              availableAt: null,
              metaJson: {
                reason: 'EARNING_COMMISSION_RECONCILIATION',
                originalEntryId: d.entryId,
                overcreditedAmount: d.actual,
                correctedAmount: d.expected,
                adjustedAmount: d.diff,
                reconciledAt: new Date().toISOString(),
              },
            },
          });
        }

        await tx.auditLog.create({
          data: {
            action: 'WALLET_EARNING_RECONCILED',
            targetType: 'DriverWalletEntry',
            targetId: d.entryId,
            metaJson: {
              driverId: d.driverId,
              rideId: d.rideId,
              status: d.status,
              actualAmount: d.actual,
              expectedAmount: d.expected,
              adjustmentDiff: d.diff,
            },
          },
        });
      });
      console.log(`    ✓ Reconciled entry ${d.entryId}`);
    }
  }

  if (dryRun) {
    console.log(
      `\n[DRY RUN] To apply these ${discrepancies.length} changes, rerun with --apply:`,
    );
    console.log(`node scripts/repair-wallet-earnings.js --apply\n`);
  } else {
    console.log(
      `\nSuccessfully reconciled ${discrepancies.length} overcredited entries.\n`,
    );
  }
}

main()
  .catch((err) => {
    console.error('[repair-wallet-earnings] Error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
