jest.mock('@nestjs/config', () => ({
  ConfigService: class MockConfigService {
    get = jest.fn();
  },
}));
jest.mock('@nestjs/jwt', () => ({
  JwtService: class MockJwtService {
    sign = jest.fn();
    verify = jest.fn();
  },
}));

import { createHmac } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  DriverApprovalStatus,
  DriverPayoutStatus,
  OfferStatus,
  RideStatus,
  UserRole,
  WalletEntryStatus,
  WalletEntryType,
} from '@prisma/client';
import {
  PricingService,
  type PriceSnapshot,
} from '../../marketplace/pricing.service';
import { OfferPresentationService } from '../../marketplace/offer-presentation.service';
import { MarketplaceService } from '../../marketplace/marketplace.service';
import { DriversService } from '../../drivers/drivers.service';
import { DriverWalletService } from '../../wallet/driver-wallet.service';
import { StripePaymentProvider } from '../payment/stripe-payment.provider';
import { StripePayoutProvider } from '../payout/stripe-payout.provider';

function signStripeWebhook(payload: string, secret: string): string {
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', secret)
    .update(`${t}.${payload}`)
    .digest('hex');
  return `t=${t},v1=${v1}`;
}

describe('Stripe Connect & Commercial Model End-to-End Flows (Document 2)', () => {
  describe('1. Section 3 Commercial & Commission Model ($100 -> $120 / $80 / $40)', () => {
    const pricing = new PricingService({} as never);
    const presentation = new OfferPresentationService(
      {} as never,
      { get: jest.fn() } as never,
      {},
    );

    it('calculates $120 passenger total, $80 driver net, and $40 CAN-RIDE gross revenue on a $100 fare', () => {
      const guidance: PriceSnapshot = {
        currency: 'CAD',
        serviceType: 'RIDE',
        vehicleClass: 'sedan',
        distanceKm: 25,
        durationMin: 30,
        guidanceAmount: 100,
        minBid: 80,
        maxBid: 150,
        minFare: 15,
        baseFare: 10,
        perKm: 2,
        perMinute: 0.5,
        perHour: 0,
        platformCommissionPct: 20,
        taxPct: 0,
      };

      const snap = pricing.freezeBid(guidance, 100);
      expect(snap.subtotal).toBe(100);
      expect(snap.platformFee).toBe(20);
      expect(snap.marketplaceFee).toBe(20);
      expect(snap.driverCommission).toBe(20);
      expect(snap.passengerTotal).toBe(120);
      expect(snap.driverEarning).toBe(80);
      expect(snap.canRideGrossRevenue).toBe(40);

      const breakdown = presentation.priceBreakdown(snap);
      expect(breakdown?.ridePrice).toBe(100);
      expect(breakdown?.marketplaceFee).toBe(20);
      expect(breakdown?.total).toBe(120);
    });

    it('applies automatic 15% discount on return ride only, funded from CAN-RIDE commission', async () => {
      const guidance: PriceSnapshot = {
        currency: 'CAD',
        serviceType: 'RIDE',
        vehicleClass: 'sedan',
        distanceKm: 50,
        durationMin: 60,
        guidanceAmount: 220,
        minBid: 180,
        maxBid: 320,
        minFare: 15,
        baseFare: 10,
        perKm: 2,
        perMinute: 0.5,
        perHour: 0,
        platformCommissionPct: 20,
        taxPct: 0,
        isRoundTrip: true,
        legs: 2,
      };

      const snap = pricing.freezeBid(guidance, 220, {
        outboundPrice: 120,
        returnPrice: 100,
      });

      expect(snap.outboundPrice).toBe(120);
      expect(snap.returnPrice).toBe(100);
      expect(snap.returnDiscountPct).toBe(15);
      expect(snap.returnDiscountAmount).toBe(15);
      expect(snap.discountedReturnPrice).toBe(85);
      expect(snap.originalPassengerTotal).toBe(264);
      expect(snap.passengerTotal).toBe(249);
      // Driver gets full 80% of $220 ($176); CAN-RIDE commission absorbs the $15 discount ($88 - $15 = $73)
      expect(snap.driverEarning).toBe(176);
      expect(snap.canRideGrossRevenue).toBe(73);

      const breakdown = presentation.priceBreakdown(snap);
      expect(breakdown?.outboundPrice).toBe(120);
      expect(breakdown?.returnPrice).toBe(100);
      expect(breakdown?.discountedReturnPrice).toBe(85);
      expect(breakdown?.returnDiscountPct).toBe(15);
      expect(breakdown?.returnDiscountAmount).toBe(15);
      expect(breakdown?.discount).toBe(15);
      expect(breakdown?.originalTotal).toBe(264);
      expect(breakdown?.total).toBe(249);
      expect(breakdown?.driverEarning).toBe(176);
      expect(breakdown?.canRideGrossRevenue).toBe(73);

      const mockPrisma: any = {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'pass-user-1',
            phoneVerifiedAt: new Date(),
            isSuspended: false,
            passengerProfile: { id: 'pass-1', userId: 'pass-user-1' },
          }),
        },
        ride: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'ride-roundtrip',
            passengerId: 'pass-1',
            status: RideStatus.PAYMENT_PENDING,
            currency: 'CAD',
            selectedOfferId: 'offer-rt',
            selectedOffer: {
              id: 'offer-rt',
              outboundPrice: 120,
              returnPrice: 100,
              priceSnapshot: snap,
            },
          }),
          findUnique: jest.fn().mockResolvedValue({
            id: 'ride-roundtrip',
            currency: 'CAD',
            selectedOffer: {
              id: 'offer-rt',
              outboundPrice: 120,
              returnPrice: 100,
              priceSnapshot: snap,
            },
          }),
        },
        payment: {
          findUnique: jest.fn().mockResolvedValue(null),
          findFirst: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockImplementation(({ create }) => ({
            id: 'pay-rt',
            ...create,
          })),
        },
        rideFinancial: {
          upsert: jest.fn().mockImplementation(({ create }) => create),
        },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
      };

      const mockPayments = {
        createIntent: jest.fn().mockResolvedValue({
          provider: 'stripe',
          intentId: 'pi_rt_249',
          clientSecret: 'pi_rt_249_secret',
          status: 'requires_payment',
        }),
      };

      const mkt = new MarketplaceService(
        mockPrisma,
        pricing,
        mockPayments as never,
        {} as never,
        {} as never,
        {} as never,
        presentation,
        {} as never,
        { get: jest.fn() } as never,
      );
      jest
        .spyOn(mkt, 'getRideForActor')
        .mockResolvedValue({ id: 'ride-roundtrip' } as never);

      await mkt.createPaymentIntent('pass-user-1', {
        rideId: 'ride-roundtrip',
        paymentMode: 'FULL',
        termsAccepted: true,
      } as never);

      expect(mockPayments.createIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 249,
          currency: 'CAD',
        }),
      );

      expect(mockPrisma.rideFinancial.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            rideId: 'ride-roundtrip',
          }),
        }),
      );
      const rfCreate = mockPrisma.rideFinancial.upsert.mock.calls[0][0].create;
      expect(Number(rfCreate.rideFare)).toBe(220);
      expect(Number(rfCreate.marketplaceFee)).toBe(44);
      expect(Number(rfCreate.passengerTotalCharged)).toBe(249);
      expect(Number(rfCreate.driverCommission)).toBe(44);
      expect(Number(rfCreate.driverNetEarning)).toBe(176);
      expect(Number(rfCreate.canRideGrossRevenue)).toBe(73);
    });

    it('applies automatic 5% discount for unconfirmed ride enquiry within 12 hours of expiration', async () => {
      const guidance: PriceSnapshot = {
        currency: 'CAD',
        serviceType: 'RIDE',
        vehicleClass: 'sedan',
        distanceKm: 25,
        durationMin: 30,
        guidanceAmount: 100,
        minBid: 80,
        maxBid: 150,
        minFare: 15,
        baseFare: 10,
        perKm: 2,
        perMinute: 0.5,
        perHour: 0,
        platformCommissionPct: 20,
        taxPct: 0,
      };

      // Offer created earlier (before 12h window) had passengerTotal = 120
      const initialSnap = pricing.freezeBid(guidance, 100);
      expect(initialSnap.passengerTotal).toBe(120);

      // Now only 6 hours remain before requestExpiresAt, and passenger completes payment
      const now = new Date();
      const requestExpiresAt = new Date(now.getTime() + 6 * 3600 * 1000);
      const pickupAt = new Date(now.getTime() + 5 * 3600 * 1000);

      const mockPrisma: any = {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'pass-user-1',
            phoneVerifiedAt: new Date(),
            isSuspended: false,
            passengerProfile: { id: 'pass-1', userId: 'pass-user-1' },
          }),
        },
        ride: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'ride-expiring-5pct',
            passengerId: 'pass-1',
            status: RideStatus.PAYMENT_PENDING,
            pickupAt,
            requestExpiresAt,
            currency: 'CAD',
            selectedOfferId: 'offer-5pct',
            selectedOffer: {
              id: 'offer-5pct',
              bidAmount: 100,
              outboundPrice: 100,
              returnPrice: null,
              priceSnapshot: initialSnap,
            },
          }),
          findUnique: jest.fn().mockResolvedValue({
            id: 'ride-expiring-5pct',
            currency: 'CAD',
            selectedOffer: {
              id: 'offer-5pct',
              bidAmount: 100,
              outboundPrice: 100,
              returnPrice: null,
              priceSnapshot: initialSnap,
            },
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        offer: {
          update: jest.fn().mockResolvedValue({}),
        },
        payment: {
          findUnique: jest.fn().mockResolvedValue(null),
          findFirst: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockImplementation(({ create }) => ({
            id: 'pay-5pct',
            ...create,
          })),
        },
        rideFinancial: {
          upsert: jest.fn().mockImplementation(({ create }) => create),
        },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
      };

      const mockPayments = {
        createIntent: jest.fn().mockResolvedValue({
          provider: 'stripe',
          intentId: 'pi_5pct_115',
          clientSecret: 'pi_5pct_115_secret',
          status: 'requires_payment',
        }),
      };

      const mkt = new MarketplaceService(
        mockPrisma,
        pricing,
        mockPayments as never,
        {} as never,
        {} as never,
        {} as never,
        presentation,
        {} as never,
        { get: jest.fn() } as never,
      );
      jest
        .spyOn(mkt, 'getRideForActor')
        .mockResolvedValue({ id: 'ride-expiring-5pct' } as never);

      await mkt.createPaymentIntent('pass-user-1', {
        rideId: 'ride-expiring-5pct',
        paymentMode: 'FULL',
        termsAccepted: true,
      } as never);

      // $100 ride fare + $20 platform fee = $120 original total - $5 (5% discount) = $115 charged
      expect(mockPayments.createIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 115,
          currency: 'CAD',
        }),
      );

      const rfCreate = mockPrisma.rideFinancial.upsert.mock.calls[0][0].create;
      expect(Number(rfCreate.rideFare)).toBe(100);
      expect(Number(rfCreate.marketplaceFee)).toBe(20);
      expect(Number(rfCreate.passengerTotalCharged)).toBe(115);
      expect(Number(rfCreate.driverCommission)).toBe(20);
      // Driver still receives full 80% ($80); CAN-RIDE commission absorbs the $5 discount ($40 - $5 = $35)
      expect(Number(rfCreate.driverNetEarning)).toBe(80);
      expect(Number(rfCreate.canRideGrossRevenue)).toBe(35);
    });

    it('createPaymentIntent charges full $120 (including 20% marketplace fee) even for legacy snapshots', async () => {
      const mockPrisma: any = {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'pass-user-1',
            phoneVerifiedAt: new Date(),
            isSuspended: false,
            passengerProfile: { id: 'pass-1', userId: 'pass-user-1' },
          }),
        },
        ride: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'ride-100',
            passengerId: 'pass-1',
            status: RideStatus.PAYMENT_PENDING,
            currency: 'CAD',
            selectedOfferId: 'offer-100',
            selectedOffer: {
              id: 'offer-100',
              bidAmount: 100,
              priceSnapshot: {
                bidAmount: 100,
                subtotal: 100,
                platformFee: 20,
                driverEarning: 80,
                // Legacy snapshot where passengerTotal was 100
                passengerTotal: 100,
                taxAmount: 0,
                currency: 'CAD',
              },
            },
          }),
          findUnique: jest.fn().mockResolvedValue({
            id: 'ride-100',
            passengerId: 'pass-1',
            status: RideStatus.PAYMENT_PENDING,
            currency: 'CAD',
            passenger: { id: 'pass-1', userId: 'pass-user-1' },
            offers: [],
            events: [],
            payments: [],
            supportCases: [],
          }),
        },
        payment: {
          findUnique: jest.fn().mockResolvedValue(null),
          findFirst: jest.fn().mockResolvedValue(null),
          upsert: jest
            .fn()
            .mockImplementation(({ create }) =>
              Promise.resolve({ id: 'pay-100', ...create }),
            ),
        },
        rideFinancial: {
          upsert: jest.fn().mockResolvedValue({}),
        },
        auditLog: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      const mockPayments: any = {
        name: 'stripe',
        createIntent: jest.fn().mockResolvedValue({
          provider: 'stripe',
          intentId: 'pi_120_test',
          clientSecret: 'pi_120_secret',
          status: 'requires_payment',
        }),
      };

      const svc = new MarketplaceService(
        mockPrisma,
        pricing,
        mockPayments,
        {} as any,
        {} as any,
        {} as any,
        presentation,
        {} as any,
        { get: jest.fn() } as any,
      );

      await svc.createPaymentIntent('pass-user-1', {
        rideId: 'ride-100',
        paymentMode: 'FULL',
      });

      expect(mockPayments.createIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 120,
          currency: 'CAD',
          rideId: 'ride-100',
        }),
      );
      expect(mockPrisma.rideFinancial.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            rideFare: expect.anything(),
            marketplaceFee: expect.anything(),
            passengerTotalCharged: expect.anything(),
            driverCommission: expect.anything(),
            driverNetEarning: expect.anything(),
            canRideGrossRevenue: expect.anything(),
          }),
        }),
      );
      const rfCreate = mockPrisma.rideFinancial.upsert.mock.calls[0][0].create;
      expect(Number(rfCreate.rideFare)).toBe(100);
      expect(Number(rfCreate.marketplaceFee)).toBe(20);
      expect(Number(rfCreate.passengerTotalCharged)).toBe(120);
      expect(Number(rfCreate.driverCommission)).toBe(20);
      expect(Number(rfCreate.driverNetEarning)).toBe(80);
      expect(Number(rfCreate.canRideGrossRevenue)).toBe(40);
    });
  });

  describe('2. Section 5 Driver Onboarding & Incomplete Verification Restrictions', () => {
    it('blocks going online (setAvailability) when Stripe Connect verification is incomplete', async () => {
      const mockPrisma: any = {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'drv-user-1',
            role: UserRole.DRIVER,
            isSuspended: false,
            driverProfile: {
              id: 'drv-1',
              userId: 'drv-user-1',
              isActivated: true,
              approvalStatus: DriverApprovalStatus.APPROVED,
              stripeAccountId: 'acct_123',
              stripeAccountStatus: 'REQUIREMENTS_DUE',
              stripePayoutsEnabled: false,
            },
          }),
        },
        driverDocument: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
        vehicle: {
          findFirst: jest.fn().mockResolvedValue({ id: 'veh-1' }),
        },
      };
      const mockStripeConnect: any = {
        isConfigured: jest.fn().mockReturnValue(true),
      };
      const driversSvc = new DriversService(
        mockPrisma,
        {} as any,
        {} as any,
        { syncDriverVehiclesApproval: jest.fn() } as any,
        mockStripeConnect,
      );

      await expect(
        driversSvc.setAvailability('drv-user-1', true),
      ).rejects.toThrow(ForbiddenException);
    });

    it('syncs Stripe status on /stripe/return and generates fresh link on /stripe/refresh', async () => {
      const mockPrisma: any = {
        driverProfile: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'drv-1',
            stripeAccountId: 'acct_live_1',
            stripeAccountStatus: 'PENDING',
            stripeChargesEnabled: false,
            stripePayoutsEnabled: false,
          }),
          update: jest.fn().mockResolvedValue({}),
        },
      };
      const mockStripeConnect: any = {
        isConfigured: jest.fn().mockReturnValue(true),
        getAccountStatus: jest.fn().mockResolvedValue({
          id: 'acct_live_1',
          chargesEnabled: true,
          payoutsEnabled: true,
          detailsSubmitted: true,
          requirements: {
            currentlyDue: [],
            eventuallyDue: [],
            pastDue: [],
            disabledReason: null,
          },
        }),
        createAccountOnboardingLink: jest
          .fn()
          .mockResolvedValue('https://connect.stripe.com/setup/s/fresh_link'),
      };

      const driversSvc = new DriversService(
        mockPrisma,
        {} as any,
        {} as any,
        {} as any,
        mockStripeConnect,
      );

      const ret = await driversSvc.handleStripeConnectReturn('acct_live_1');
      expect(ret.ok).toBe(true);
      expect(ret.status).toBe('ACTIVE');
      expect(ret.payoutsEnabled).toBe(true);
      expect(mockPrisma.driverProfile.update).toHaveBeenCalledWith({
        where: { id: 'drv-1' },
        data: {
          stripeAccountStatus: 'ACTIVE',
          stripeChargesEnabled: true,
          stripePayoutsEnabled: true,
        },
      });

      const ref = await driversSvc.handleStripeConnectRefresh('acct_live_1');
      expect(ref.ok).toBe(true);
      expect(ref.url).toBe('https://connect.stripe.com/setup/s/fresh_link');
    });

    it('blocks wallet withdrawal when Stripe payoutsEnabled is false or an open dispute exists', async () => {
      const mockPrisma: any = {
        user: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: 'u1', isSuspended: false }),
        },
        driverProfile: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'drv-1',
            userId: 'u1',
            isActivated: true,
            approvalStatus: DriverApprovalStatus.APPROVED,
            payoutSettingsJson: {},
            stripeAccountId: 'acct_123',
            stripeAccountStatus: 'REQUIREMENTS_DUE',
            stripePayoutsEnabled: false,
          }),
        },
        driverWalletEntry: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'e1',
              type: WalletEntryType.EARNING,
              direction: 'CREDIT',
              amount: '80.00',
              currency: 'CAD',
              status: WalletEntryStatus.POSTED,
              availableAt: null,
              payoutId: null,
              description: 'Trip earning',
              createdAt: new Date(),
            },
          ]),
        },
        driverPayout: {
          findMany: jest.fn().mockResolvedValue([]),
        },
        supportCase: {
          count: jest.fn().mockResolvedValue(0),
        },
        dispute: {
          count: jest.fn().mockResolvedValue(0),
        },
        $queryRaw: jest.fn().mockResolvedValue([{ now: new Date() }]),
      };

      const walletSvc = new DriverWalletService(
        mockPrisma,
        {
          get: jest.fn((k: string) => (k === 'wallet.currency' ? 'CAD' : null)),
        } as any,
        { sendToUser: jest.fn() } as any,
        {
          name: 'stripe',
          ensureBeneficiary: jest.fn(),
          createPayout: jest.fn(),
          parseWebhook: jest.fn(),
        },
      );

      const summaryUnverified = await walletSvc.getWalletForUser('u1');
      expect(summaryUnverified.canWithdraw).toBe(false);
      expect(summaryUnverified.cannotWithdrawReason).toBe(
        'PAYOUT_METHOD_NOT_VERIFIED',
      );

      // Now mark Stripe ACTIVE, but add an open dispute on a ride
      mockPrisma.driverProfile.findUnique.mockResolvedValue({
        id: 'drv-1',
        userId: 'u1',
        isActivated: true,
        approvalStatus: DriverApprovalStatus.APPROVED,
        payoutSettingsJson: {},
        stripeAccountId: 'acct_123',
        stripeAccountStatus: 'ACTIVE',
        stripePayoutsEnabled: true,
      });
      mockPrisma.supportCase.count.mockResolvedValue(1);
      mockPrisma.dispute.count.mockResolvedValue(1);

      const summaryDisputed = await walletSvc.getWalletForUser('u1');
      expect(summaryDisputed.canWithdraw).toBe(false);
      expect(summaryDisputed.cannotWithdrawReason).toBe('DRIVER_NOT_ELIGIBLE');
    });
  });

  describe('3. Section 4, 6 & 7 Webhooks, Cancellations & Dispute Holds', () => {
    it('verifies Stripe webhook signatures on both Payment and Payout providers', async () => {
      const secret = 'whsec_test_secret_123';
      const config: any = {
        get: jest.fn((k: string) => {
          if (k === 'stripe.secretKey') return 'sk_test_123';
          if (k === 'stripe.webhookSecret') return secret;
          if (k === 'nodeEnv') return 'production';
          return undefined;
        }),
      };
      const payProvider = new StripePaymentProvider(config);
      const payoutProvider = new StripePayoutProvider(config);

      const body = JSON.stringify({
        id: 'evt_dispute_1',
        type: 'charge.dispute.created',
        data: {
          object: {
            id: 'dp_1',
            payment_intent: 'pi_disputed_1',
            reason: 'fraudulent',
          },
        },
      });

      await expect(
        payProvider.parseWebhook({ 'stripe-signature': 't=1,v1=bad' }, body),
      ).rejects.toThrow(ServiceUnavailableException);

      await expect(
        payoutProvider.parseWebhook({ 'stripe-signature': 't=1,v1=bad' }, body),
      ).rejects.toThrow(ServiceUnavailableException);

      const validSig = signStripeWebhook(body, secret);
      const parsedPay = await payProvider.parseWebhook(
        { 'stripe-signature': validSig },
        body,
      );
      expect(parsedPay.eventId).toBe('evt_dispute_1');
      expect(parsedPay.paymentRef).toBe('pi_disputed_1');

      const parsedPayout = await payoutProvider.parseWebhook(
        { 'stripe-signature': validSig },
        body,
      );
      expect(parsedPayout.eventId).toBe('evt_dispute_1');
    });

    it('freezes driver wallet earning and opens Dispute + SupportCase on charge.dispute.created webhook', async () => {
      const mockPrisma: any = {
        webhookEvent: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockResolvedValue({}),
          update: jest.fn().mockResolvedValue({}),
        },
        payment: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'pay-1',
            rideId: 'ride-1',
            amount: 120,
            providerRef: 'pi_disputed_1',
            ride: {
              id: 'ride-1',
              passengerId: 'pass-1',
              assignedDriverId: 'drv-1',
            },
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        rideFinancial: {
          updateMany: jest.fn().mockResolvedValue({}),
        },
        driverWalletEntry: {
          updateMany: jest.fn().mockResolvedValue({}),
        },
        passengerProfile: {
          findUnique: jest.fn().mockResolvedValue({ userId: 'pass-user-1' }),
        },
        dispute: {
          create: jest.fn().mockResolvedValue({ id: 'disp-1' }),
        },
        supportCase: {
          create: jest.fn().mockResolvedValue({ id: 'case-1' }),
        },
      };

      const mockPayments: any = {
        name: 'stripe',
        parseWebhook: jest.fn().mockResolvedValue({
          provider: 'stripe',
          eventId: 'evt_dispute_1',
          type: 'charge.dispute.created',
          paymentRef: 'pi_disputed_1',
          raw: {
            id: 'evt_dispute_1',
            type: 'charge.dispute.created',
            data: {
              object: {
                id: 'dp_123',
                payment_intent: 'pi_disputed_1',
                reason: 'fraudulent',
                status: 'needs_response',
              },
            },
          },
        }),
      };

      const svc = new MarketplaceService(
        mockPrisma,
        {} as any,
        mockPayments,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        { get: jest.fn() } as any,
      );

      const res = await svc.handlePaymentWebhook('stripe', {}, '{}');
      expect(res).toEqual({ ok: true, handled: 'charge.dispute.created' });
      expect(mockPrisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pay-1' },
          data: expect.objectContaining({ status: 'disputed' }),
        }),
      );
      expect(mockPrisma.driverWalletEntry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { rideId: 'ride-1', type: WalletEntryType.EARNING },
          data: expect.objectContaining({ status: WalletEntryStatus.PENDING }),
        }),
      );
      expect(mockPrisma.dispute.create).toHaveBeenCalled();
      expect(mockPrisma.supportCase.create).toHaveBeenCalled();
    });

    it('calls Stripe refund API when cancelling a paid ride in cancelRide', async () => {
      const mockPrisma: any = {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'pass-user-1',
            phoneVerifiedAt: new Date(),
            isSuspended: false,
            passengerProfile: { id: 'pass-1', userId: 'pass-user-1' },
          }),
        },
        ride: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'ride-cancel-1',
            passengerId: 'pass-1',
            assignedDriverId: 'drv-1',
            status: RideStatus.BOOKED,
            pickupAt: new Date(Date.now() + 48 * 3600_000),
            passenger: { id: 'pass-1', userId: 'pass-user-1' },
            offers: [],
            events: [],
            payments: [],
            supportCases: [],
          }),
          findUnique: jest.fn().mockResolvedValue({
            id: 'ride-cancel-1',
            passengerId: 'pass-1',
            assignedDriverId: 'drv-1',
            status: RideStatus.BOOKED,
            pickupAt: new Date(Date.now() + 48 * 3600_000),
            passenger: { id: 'pass-1', userId: 'pass-user-1' },
            offers: [],
            events: [],
            payments: [],
            supportCases: [],
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        offer: {
          findMany: jest.fn().mockResolvedValue([]),
          updateMany: jest.fn().mockResolvedValue({}),
        },
        payment: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'pay-cancel-1',
            rideId: 'ride-cancel-1',
            amount: 120,
            currency: 'CAD',
            providerRef: 'pi_cancel_1',
            status: 'succeeded',
            refunds: [],
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        refund: {
          create: jest.fn().mockResolvedValue({ id: 'ref-1' }),
        },
        rideFinancial: {
          updateMany: jest.fn().mockResolvedValue({}),
        },
        rideEvent: {
          create: jest.fn().mockResolvedValue({}),
        },
        auditLog: {
          create: jest.fn().mockResolvedValue({}),
        },
        $transaction: jest.fn(async (cb: any) => cb(mockPrisma)),
      };

      const mockPayments: any = {
        name: 'stripe',
        refund: jest.fn().mockResolvedValue({
          refundId: 're_stripe_123',
          status: 'succeeded',
        }),
      };

      const mockLifecycle: any = {
        transition: jest.fn().mockResolvedValue({ ok: true }),
        requireTransition: jest.fn().mockResolvedValue({ ok: true }),
      };

      const svc = new MarketplaceService(
        mockPrisma,
        {} as any,
        mockPayments,
        { notifyRideStatus: jest.fn().mockResolvedValue(undefined) } as any,
        {} as any,
        mockLifecycle,
        {} as any,
        {} as any,
        { get: jest.fn() } as any,
      );

      await svc.cancelRide('pass-user-1', 'ride-cancel-1', {
        reason: 'Schedule changed',
      });

      expect(mockPayments.refund).toHaveBeenCalledWith('pi_cancel_1', 120);
      expect(mockPrisma.refund.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paymentId: 'pay-cancel-1',
            amount: 120,
            gatewayRefundId: 're_stripe_123',
            status: 'succeeded',
          }),
        }),
      );
    });
  });
});
