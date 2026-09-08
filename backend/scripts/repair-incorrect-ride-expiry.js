/**
 * Repair rides incorrectly marked EXPIRED by the legacy createdAt+30m request TTL.
 *
 * Usage:
 *   node scripts/repair-incorrect-ride-expiry.js            # dry-run (default)
 *   node scripts/repair-incorrect-ride-expiry.js --apply    # write changes
 *   node scripts/repair-incorrect-ride-expiry.js --limit=200
 *
 * Safe rules (mirrored from ride-lifecycle.ts):
 * - Only EXPIRED rides
 * - Only when pickupAt + grace is still in the future
 * - Restores WAITING_FOR_OFFERS or OFFER_SELECTION
 * - Writes RideEvent + AuditLog on apply
 */
/* eslint-disable no-console */
const path = require('path');
const { PrismaClient, RideStatus, OfferStatus } = require('@prisma/client');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const prisma = new PrismaClient();
const GRACE_MS =
  (Number(process.env.RIDE_UNFULFILLED_GRACE_MINUTES) || 60) * 60 * 1000;

function parseArgs(argv) {
  const apply = argv.includes('--apply');
  const limitArg = argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Math.max(1, Number(limitArg.split('=')[1]) || 500) : 500;
  return { dryRun: !apply, limit };
}

function propose(ride, now) {
  if (ride.status !== RideStatus.EXPIRED) return null;
  const cutoff = new Date(ride.pickupAt.getTime() + GRACE_MS);
  if (cutoff.getTime() <= now.getTime()) return null;
  const to =
    ride.offers && ride.offers.length > 0
      ? RideStatus.OFFER_SELECTION
      : RideStatus.WAITING_FOR_OFFERS;
  return {
    rideId: ride.id,
    from: RideStatus.EXPIRED,
    to,
    reason:
      'Future scheduled ride was incorrectly expired by legacy createdAt-based request TTL',
    newRequestExpiresAt: cutoff,
  };
}

async function main() {
  const { dryRun, limit } = parseArgs(process.argv.slice(2));
  const now = new Date();

  const rows = await prisma.ride.findMany({
    where: { status: RideStatus.EXPIRED },
    select: {
      id: true,
      status: true,
      pickupAt: true,
      requestExpiresAt: true,
      offers: {
        where: { status: { in: [OfferStatus.ACTIVE, OfferStatus.SELECTED] } },
        select: { id: true },
        take: 1,
      },
    },
    take: limit,
    orderBy: { pickupAt: 'desc' },
  });

  const proposals = [];
  for (const row of rows) {
    const p = propose(row, now);
    if (p) proposals.push(p);
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        scannedExpired: rows.length,
        proposedRepairs: proposals.length,
        graceMinutes: GRACE_MS / 60000,
        now: now.toISOString(),
        sample: proposals.slice(0, 20),
      },
      null,
      2,
    ),
  );

  if (dryRun) {
    console.log('\nDry-run only. Re-run with --apply to persist repairs.');
    return;
  }

  let applied = 0;
  for (const p of proposals) {
    const updated = await prisma.ride.updateMany({
      where: { id: p.rideId, status: RideStatus.EXPIRED },
      data: {
        status: p.to,
        requestExpiresAt: p.newRequestExpiresAt,
      },
    });
    if (updated.count === 0) continue;

    await prisma.rideEvent.create({
      data: {
        rideId: p.rideId,
        fromStatus: p.from,
        toStatus: p.to,
        actorType: 'system',
        payload: {
          action: 'RIDE_STATUS_REPAIRED',
          reason: p.reason,
          actor: 'SYSTEM_MIGRATION',
        },
      },
    });
    await prisma.auditLog.create({
      data: {
        action: 'RIDE_STATUS_REPAIRED',
        resource: 'Ride',
        resourceId: p.rideId,
        reason: p.reason,
        meta: {
          from: p.from,
          to: p.to,
          actor: 'SYSTEM_MIGRATION',
        },
      },
    });
    applied += 1;
  }

  console.log(JSON.stringify({ applied, proposed: proposals.length }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
