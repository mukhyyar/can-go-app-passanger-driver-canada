/**
 * One-shot: retrieve Stripe PI + mark ride BOOKED (incl. TTL-reopened rides).
 * Usage: node scripts/reconcile-stuck-payment.mjs <rideId> [paymentIntentId] [offerId]
 */
import { createRequire } from 'module';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

const require = createRequire(import.meta.url);
const { PrismaClient, RideStatus, OfferStatus } = require('@prisma/client');

const rideId = process.argv[2];
const paymentIntentIdArg = process.argv[3];
const offerIdArg = process.argv[4];

if (!rideId) {
  console.error(
    'Usage: node scripts/reconcile-stuck-payment.mjs <rideId> [paymentIntentId] [offerId]',
  );
  process.exit(1);
}

const prisma = new PrismaClient();
const secret = process.env.STRIPE_SECRET_KEY;

async function retrieveIntent(intentId) {
  if (!secret) throw new Error('STRIPE_SECRET_KEY missing');
  const res = await fetch(
    `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(intentId)}`,
    { headers: { Authorization: `Bearer ${secret}` } },
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message ?? `Stripe HTTP ${res.status}`);
  }
  return data;
}

function offerIdFromIdempotency(key) {
  if (!key) return undefined;
  const parts = String(key).split('-');
  if (parts.length >= 3 && parts[0] === 'pay') return parts[2];
  return undefined;
}

async function main() {
  const ride = await prisma.ride.findUnique({ where: { id: rideId } });
  if (!ride) {
    console.error(JSON.stringify({ ok: false, error: 'ride_not_found', rideId }));
    process.exit(2);
  }

  let payment = paymentIntentIdArg
    ? await prisma.payment.findFirst({
        where: { rideId, providerRef: paymentIntentIdArg },
      })
    : await prisma.payment.findFirst({
        where: { rideId },
        orderBy: { createdAt: 'desc' },
      });

  // Prefer explicit PI even if findFirst by ride missed (e.g. after reopen)
  if (!payment && paymentIntentIdArg) {
    payment = await prisma.payment.findFirst({
      where: { providerRef: paymentIntentIdArg },
    });
  }

  if (!payment?.providerRef) {
    console.error(
      JSON.stringify({
        ok: false,
        error: 'payment_not_found',
        rideStatus: ride.status,
      }),
    );
    process.exit(3);
  }

  if (ride.status === RideStatus.BOOKED) {
    console.log(
      JSON.stringify({
        ok: true,
        alreadyBooked: true,
        rideId,
        paymentId: payment.id,
        providerRef: payment.providerRef,
      }),
    );
    return;
  }

  const intent = await retrieveIntent(payment.providerRef);
  const offerId =
    offerIdArg ||
    intent.metadata?.offerId ||
    offerIdFromIdempotency(payment.idempotencyKey) ||
    ride.selectedOfferId ||
    undefined;

  console.log(
    JSON.stringify({
      stripeStatus: intent.status,
      providerRef: payment.providerRef,
      rideStatus: ride.status,
      offerId,
    }),
  );

  if (intent.status !== 'succeeded') {
    console.error(
      JSON.stringify({
        ok: false,
        error: 'stripe_not_succeeded',
        stripeStatus: intent.status,
      }),
    );
    process.exit(4);
  }

  if (!offerId) {
    console.error(JSON.stringify({ ok: false, error: 'missing_offer_id' }));
    process.exit(6);
  }

  const offer = await prisma.offer.findFirst({
    where: { id: offerId, rideId },
  });
  if (!offer) {
    console.error(JSON.stringify({ ok: false, error: 'offer_not_found', offerId }));
    process.exit(7);
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: 'succeeded' },
    });

    // Restore reservation if TTL reopened the ride
    if (ride.status !== RideStatus.PAYMENT_PENDING || !ride.selectedOfferId) {
      await tx.offer.updateMany({
        where: {
          id: offerId,
          rideId,
          status: { in: [OfferStatus.ACTIVE, OfferStatus.SELECTED] },
        },
        data: { status: OfferStatus.SELECTED, acceptedAt: now },
      });

      const restored = await tx.ride.updateMany({
        where: {
          id: rideId,
          status: {
            in: [
              RideStatus.OFFER_SELECTION,
              RideStatus.WAITING_FOR_OFFERS,
              RideStatus.PAYMENT_PENDING,
            ],
          },
        },
        data: {
          selectedOfferId: offerId,
          assignedDriverId: offer.driverId,
          priceSnapshot: offer.priceSnapshot,
          status: RideStatus.PAYMENT_PENDING,
          paymentExpiresAt: null,
        },
      });
      if (restored.count !== 1) {
        throw new Error(`restore_failed from ${ride.status}`);
      }

      if (ride.status !== RideStatus.PAYMENT_PENDING) {
        await tx.rideEvent.create({
          data: {
            rideId,
            fromStatus: ride.status,
            toStatus: RideStatus.PAYMENT_PENDING,
            actorType: 'system',
            payload: {
              offerId,
              action: 'restore_reservation_after_succeeded_payment',
              paymentId: payment.id,
              reconciledBy: 'reconcile-stuck-payment.mjs',
            },
          },
        });
      }
    }

    const rideLock = await tx.ride.updateMany({
      where: { id: rideId, status: RideStatus.PAYMENT_PENDING },
      data: { status: RideStatus.BOOKED, paymentExpiresAt: null },
    });
    if (rideLock.count !== 1) {
      throw new Error('book_lock_failed');
    }

    await tx.offer.updateMany({
      where: {
        rideId,
        id: { not: offerId },
        status: { in: [OfferStatus.ACTIVE, OfferStatus.SELECTED] },
      },
      data: { status: OfferStatus.REJECTED, rejectedAt: now },
    });

    await tx.rideEvent.create({
      data: {
        rideId,
        fromStatus: RideStatus.PAYMENT_PENDING,
        toStatus: RideStatus.BOOKED,
        actorType: 'system',
        payload: {
          paymentId: payment.id,
          action: 'payment_succeeded',
          offerId,
          reconciledBy: 'reconcile-stuck-payment.mjs',
        },
      },
    });
  });

  console.log(
    JSON.stringify({
      ok: true,
      booked: true,
      rideId,
      paymentId: payment.id,
      providerRef: payment.providerRef,
      offerId,
    }),
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
