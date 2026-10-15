jest.mock('@nestjs/config', () => ({
  ConfigService: class MockConfigService {
    get = jest.fn(() => null);
  },
}));

jest.mock('@nestjs/jwt', () => ({
  JwtService: class MockJwtService {},
}));

import { RideStatus } from '@prisma/client';
import { RideLifecycleService } from './ride-lifecycle.service';
import { TripService } from '../trips/trip.service';

describe('Overdue and Stalled Rides Feature', () => {
  describe('RideLifecycleService.detectAndNotifyOverdueBookings', () => {
    it('notifies passenger and driver across Push, SMS, and Email for overdue and stalled rides', async () => {
      const mockPrisma: any = {
        ride: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'cuid_stalled_1007',
              status: RideStatus.IN_PROGRESS,
              pickupAt: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4h ago (stalled)
              fromLabel: '100 King St W, Toronto',
              toLabel: 'Toronto Pearson Airport',
              passenger: {
                userId: 'user_pax_1',
                fullName: 'Jane Doe',
                user: {
                  id: 'user_pax_1',
                  email: 'jane@example.ca',
                  phoneE164: '+14165550199',
                },
              },
              selectedOffer: {
                driver: {
                  userId: 'user_drv_1',
                  fullName: 'John Driver',
                  user: {
                    id: 'user_drv_1',
                    email: 'john@example.ca',
                    phoneE164: '+14165550188',
                  },
                },
              },
            },
          ]),
        },
        notificationDelivery: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'delivery_1' }),
        },
      };

      const mockTracking: any = {
        emitRideEvent: jest.fn(),
      };

      const mockEmailEvents: any = {
        sendRideDelayedAlert: jest.fn().mockResolvedValue(undefined),
      };

      const mockNotifications: any = {
        notifyRideStatus: jest.fn().mockResolvedValue([]),
      };

      const mockSms: any = {
        sendSms: jest.fn().mockResolvedValue({ messageId: 'sms_123' }),
      };

      const service = new RideLifecycleService(
        mockPrisma,
        mockTracking,
        mockEmailEvents,
        mockNotifications,
        mockSms,
      );

      const count = await service.detectAndNotifyOverdueBookings();
      expect(count).toBe(1);

      // Verify Push notifications
      expect(mockNotifications.notifyRideStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          userIds: ['user_pax_1'],
          rideId: 'cuid_stalled_1007',
          status: 'OVERDUE',
          title: 'Action Required: Ride Delayed / Stalled',
        }),
      );
      expect(mockNotifications.notifyRideStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          userIds: ['user_drv_1'],
          rideId: 'cuid_stalled_1007',
          status: 'OVERDUE',
          title: 'Trip Stalled / Delayed',
        }),
      );

      // Verify SMS notifications dispatched
      await new Promise((r) => setTimeout(r, 20));
      expect(mockSms.sendSms).toHaveBeenCalledWith(
        '+14165550199',
        expect.stringContaining('CAN-RIDE Alert: Your ride'),
      );
      expect(mockSms.sendSms).toHaveBeenCalledWith(
        '+14165550188',
        expect.stringContaining('CAN-RIDE Alert: Trip'),
      );

      // Verify Email notifications dispatched
      expect(mockEmailEvents.sendRideDelayedAlert).toHaveBeenCalledWith(
        'user_pax_1',
        'jane@example.ca',
        expect.objectContaining({
          recipientRole: 'passenger',
          rideId: 'cuid_stalled_1007',
          recipientName: 'Jane Doe',
        }),
      );
      expect(mockEmailEvents.sendRideDelayedAlert).toHaveBeenCalledWith(
        'user_drv_1',
        'john@example.ca',
        expect.objectContaining({
          recipientRole: 'driver',
          rideId: 'cuid_stalled_1007',
          recipientName: 'John Driver',
        }),
      );

      // Verify live WebSocket event emitted
      expect(mockTracking.emitRideEvent).toHaveBeenCalledWith(
        'cuid_stalled_1007',
        expect.objectContaining({
          type: 'ride.overdue',
          isOverdue: true,
        }),
      );
    });
  });

  describe('TripService.handleCancellationRefund', () => {
    it('processes full refund through payment gateway and updates financial records on cancellation', async () => {
      const mockPrisma: any = {
        payment: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'pay_123',
            provider: 'stripe',
            providerRef: 'pi_stripe_123',
            amount: 240.0,
            currency: 'CAD',
            refunds: [],
          }),
          update: jest.fn().mockResolvedValue({ id: 'pay_123', status: 'refunded' }),
        },
        user: {
          findUnique: jest.fn().mockResolvedValue({ id: 'user_pax_1' }),
        },
        refund: {
          create: jest.fn().mockResolvedValue({ id: 'ref_1' }),
        },
        rideFinancial: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        $transaction: jest.fn(async (cb: any) => {
          return cb(mockPrisma);
        }),
      };

      const mockPaymentProvider: any = {
        name: 'stripe',
        refund: jest.fn().mockResolvedValue({ refundId: 're_stripe_999', status: 'succeeded' }),
      };

      const tripService = new TripService(
        mockPrisma,
        {} as any,
        {} as any,
        {} as any,
        undefined,
        undefined,
        undefined,
        mockPaymentProvider,
      );

      const result = await tripService.handleCancellationRefund(
        'ride_123',
        RideStatus.PASSENGER_CANCELLED,
        'user_pax_1',
      );

      expect(result.refunded).toBe(true);
      expect(result.amount).toBe(240);
      expect(result.refundId).toBe('re_stripe_999');

      expect(mockPaymentProvider.refund).toHaveBeenCalledWith('pi_stripe_123', 240);
      expect(mockPrisma.refund.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paymentId: 'pay_123',
            amount: 240,
            status: 'succeeded',
            type: 'FULL',
          }),
        }),
      );
      expect(mockPrisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pay_123' },
          data: { status: 'refunded' },
        }),
      );
      expect(mockPrisma.rideFinancial.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { rideId: 'ride_123' },
          data: expect.objectContaining({
            refundAmount: 240,
          }),
        }),
      );
    });
  });
});
