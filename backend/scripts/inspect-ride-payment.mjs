/**
 * Inspect ride + payment for stuck Stripe reconcile debugging.
 * Usage: node scripts/inspect-ride-payment.mjs <rideId> [paymentIntentId]
 */
import { createRequire } from 'module';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const rideId = process.argv[2];
const pi = process.argv[3];
if (!rideId) {
  console.error('Usage: node scripts/inspect-ride-payment.mjs <rideId> [paymentIntentId]');
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    select: {
      id: true,
      status: true,
      selectedOfferId: true,
      paymentExpiresAt: true,
      updatedAt: true,
      createdAt: true,
    },
  });
  const byPi = pi
    ? await prisma.payment.findMany({ where: { providerRef: pi } })
    : [];
  const byRide = await prisma.payment.findMany({
    where: { rideId },
    orderBy: { createdAt: 'desc' },
  });
  const events = await prisma.rideEvent.findMany({
    where: { rideId },
    orderBy: { createdAt: 'desc' },
    take: 15,
  });
  const offerByMeta = await prisma.offer.findUnique({
    where: { id: 'cmuklb9jh00264t16hn897b9b' },
    select: { id: true, status: true, rideId: true },
  });
  const webhooks = pi
    ? await prisma.webhookEvent.findMany({
        where: {
          OR: [
            { eventId: { contains: pi.slice(0, 12) } },
            // payload search not indexed; skip
          ],
        },
        take: 5,
        orderBy: { createdAt: 'desc' },
      })
    : [];
  const recentStripeHooks = await prisma.webhookEvent.findMany({
    where: { provider: 'stripe' },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      eventId: true,
      processedAt: true,
      createdAt: true,
      provider: true,
    },
  });

  console.log(
    JSON.stringify(
      {
        ride,
        offerByMeta,
        byPi: byPi.map((p) => ({
          id: p.id,
          status: p.status,
          providerRef: p.providerRef,
          rideId: p.rideId,
          amount: p.amount,
          createdAt: p.createdAt,
        })),
        byRide: byRide.map((p) => ({
          id: p.id,
          status: p.status,
          providerRef: p.providerRef,
          amount: p.amount,
          createdAt: p.createdAt,
        })),
        events: events.map((e) => ({
          from: e.fromStatus,
          to: e.toStatus,
          actorType: e.actorType,
          payload: e.payload,
          createdAt: e.createdAt,
        })),
        recentStripeHooks,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
