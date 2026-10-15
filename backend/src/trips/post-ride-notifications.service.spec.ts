jest.mock('@nestjs/config', () => ({
  ConfigService: class MockConfigService {
    get = jest.fn((key: string) => {
      if (key === 'admin.passengerWebBase') return 'https://can-rides.ca';
      if (key === 'postRide.tipReminderDelayMinutes') return 60;
      if (key === 'email.assetBaseUrl') return 'https://can-rides.ca/assets';
      return null;
    });
  },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RideStatus, UserRole } from '@prisma/client';

import { PostRideNotificationService } from './post-ride-notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailEventsService } from '../email/email-events.service';
import { SMS_PROVIDER } from '../providers/sms/sms-provider.interface';
import { NotificationsService } from '../notifications/notifications.service';

describe('PostRideNotificationService', () => {
  let service: PostRideNotificationService;
  let prisma: any;
  let emailEvents: any;
  let smsProvider: any;
  let notifications: any;

  const mockRideId = 'cuid_ride_12345';
  const mockPassengerUserId = 'user_passenger_1';
  const mockDriverUserId = 'user_driver_1';

  const createMockRide = (overrides: Record<string, any> = {}) => ({
    id: mockRideId,
    status: RideStatus.COMPLETED,
    fromLabel: '100 King St W, Toronto',
    toLabel: 'Pearson Airport Terminal 1',
    currency: 'CAD',
    updatedAt: new Date('2026-10-15T12:00:00Z'),
    passenger: {
      id: 'passenger_prof_1',
      userId: mockPassengerUserId,
      fullName: 'Alice Walker',
      user: {
        id: mockPassengerUserId,
        email: 'alice@example.com',
        phoneE164: '+14165550199',
        isSuspended: false,
        archivedAt: null,
      },
    },
    selectedOffer: {
      driver: {
        id: 'driver_prof_1',
        fullName: 'Bob Driver',
        user: { id: mockDriverUserId },
      },
      vehicle: {
        name: 'Toyota Camry',
        plate: 'CANDR1VE',
        vehicleClass: 'SEDAN',
        color: 'Black',
        year: 2024,
      },
    },
    financial: {
      rideFare: 200.0,
      marketplaceFee: 40.0,
      taxes: 0.0,
      tipAmount: 0.0,
      passengerTotalCharged: 240.0,
      currency: 'CAD',
    },
    payments: [
      {
        id: 'payment_1',
        status: 'succeeded',
        amount: 240.0,
        currency: 'CAD',
        paymentMethod: 'CARD',
        providerRef: 'pi_stripe_12345',
      },
    ],
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      ride: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      rating: {
        findUnique: jest.fn(),
      },
      notificationDelivery: {
        findFirst: jest.fn(),
      },
      rideFinancial: {
        findUnique: jest.fn(),
      },
      payment: {
        findFirst: jest.fn(),
      },
    };

    emailEvents = {
      sendPostRideReview: jest.fn().mockResolvedValue(undefined),
      sendRideInvoice: jest.fn().mockResolvedValue(undefined),
      sendRideTipReminder: jest.fn().mockResolvedValue(undefined),
    };

    smsProvider = {
      name: 'test_sms',
      sendSms: jest.fn().mockResolvedValue({ providerMessageId: 'mock_msg_123' }),
    };

    notifications = {
      logDelivery: jest.fn().mockResolvedValue({ id: 'deliv_1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostRideNotificationService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'admin.passengerWebBase') return 'https://can-rides.ca';
              if (key === 'postRide.tipReminderDelayMinutes') return 60;
              if (key === 'email.assetBaseUrl') return 'https://can-rides.ca/assets';
              return null;
            }),
          },
        },
        { provide: EmailEventsService, useValue: emailEvents },
        { provide: SMS_PROVIDER, useValue: smsProvider },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get<PostRideNotificationService>(PostRideNotificationService);
  });

  describe('handleRideCompleted (Review, SMS & Invoice Triggers)', () => {
    it('successfully sends review email, review SMS, and invoice email for a completed ride', async () => {
      const ride = createMockRide();
      prisma.ride.findUnique.mockResolvedValue(ride);
      prisma.rating.findUnique.mockResolvedValue(null); // not rated
      prisma.notificationDelivery.findFirst.mockResolvedValue(null); // not previously sent

      await service.handleRideCompleted(mockRideId);

      // 1. Review Email
      expect(emailEvents.sendPostRideReview).toHaveBeenCalledTimes(1);
      expect(emailEvents.sendPostRideReview).toHaveBeenCalledWith(
        mockPassengerUserId,
        'alice@example.com',
        expect.objectContaining({
          rideId: mockRideId,
          driverName: 'Bob Driver',
          reviewUrl: `https://can-rides.ca/rides/${mockRideId}`,
        }),
      );

      // 2. Review SMS
      expect(smsProvider.sendSms).toHaveBeenCalledTimes(1);
      expect(smsProvider.sendSms).toHaveBeenCalledWith(
        '+14165550199',
        expect.stringContaining('Thank you for riding with CAN-RIDE!'),
      );
      expect(notifications.logDelivery).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockPassengerUserId,
          channel: 'sms',
          status: 'sent',
          dataJson: expect.objectContaining({ rideId: mockRideId }),
        }),
      );

      // 3. Invoice Email
      expect(emailEvents.sendRideInvoice).toHaveBeenCalledTimes(1);
      expect(emailEvents.sendRideInvoice).toHaveBeenCalledWith(
        mockPassengerUserId,
        'alice@example.com',
        expect.objectContaining({
          rideId: mockRideId,
          rideFare: '200.00',
          marketplaceFee: '40.00',
          totalCharged: '240.00',
          currency: 'CAD',
          driverName: 'Bob Driver',
          vehicleName: 'Toyota Camry',
          vehiclePlate: 'CANDR1VE',
        }),
      );
    });

    it('does not send review email/SMS if passenger has already rated the ride', async () => {
      const ride = createMockRide();
      prisma.ride.findUnique.mockResolvedValue(ride);
      prisma.rating.findUnique.mockResolvedValue({ id: 'rating_1', stars: 5 }); // ALREADY RATED
      prisma.notificationDelivery.findFirst.mockResolvedValue(null);

      await service.handleRideCompleted(mockRideId);

      expect(emailEvents.sendPostRideReview).not.toHaveBeenCalled();
      expect(smsProvider.sendSms).not.toHaveBeenCalled();
      // Invoice email should still be sent independently
      expect(emailEvents.sendRideInvoice).toHaveBeenCalledTimes(1);
    });

    it('does not send duplicate review email or SMS if already sent', async () => {
      const ride = createMockRide();
      prisma.ride.findUnique.mockResolvedValue(ride);
      prisma.rating.findUnique.mockResolvedValue(null);
      // Already sent in notification delivery
      prisma.notificationDelivery.findFirst.mockImplementation(({ where }: any) => {
        if (where.templateKey === 'post_ride_review') return Promise.resolve({ id: 'sent_email' });
        if (where.templateKey === 'post_ride_review_sms') return Promise.resolve({ id: 'sent_sms' });
        if (where.templateKey === 'ride_invoice') return Promise.resolve({ id: 'sent_invoice' });
        return Promise.resolve(null);
      });

      await service.handleRideCompleted(mockRideId);

      expect(emailEvents.sendPostRideReview).not.toHaveBeenCalled();
      expect(smsProvider.sendSms).not.toHaveBeenCalled();
      expect(emailEvents.sendRideInvoice).not.toHaveBeenCalled();
    });

    it('does not send communications for non-completed rides (e.g. CANCELLED or EXPIRED)', async () => {
      const ride = createMockRide({ status: RideStatus.PASSENGER_CANCELLED });
      prisma.ride.findUnique.mockResolvedValue(ride);

      await service.handleRideCompleted(mockRideId);

      expect(emailEvents.sendPostRideReview).not.toHaveBeenCalled();
      expect(smsProvider.sendSms).not.toHaveBeenCalled();
      expect(emailEvents.sendRideInvoice).not.toHaveBeenCalled();
    });

    it('isolates failures: SMS failure does not crash or block invoice email', async () => {
      const ride = createMockRide();
      prisma.ride.findUnique.mockResolvedValue(ride);
      prisma.rating.findUnique.mockResolvedValue(null);
      prisma.notificationDelivery.findFirst.mockResolvedValue(null);
      smsProvider.sendSms.mockRejectedValueOnce(new Error('Twilio Gateway Timeout'));

      await service.handleRideCompleted(mockRideId);

      // Review email should have succeeded
      expect(emailEvents.sendPostRideReview).toHaveBeenCalledTimes(1);
      // SMS failed but logged as failed
      expect(notifications.logDelivery).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          errorCode: expect.stringContaining('Twilio Gateway Timeout'),
        }),
      );
      // Invoice email still sent
      expect(emailEvents.sendRideInvoice).toHaveBeenCalledTimes(1);
    });

    it('handles passenger with missing email gracefully without error', async () => {
      const ride = createMockRide();
      ride.passenger.user.email = null;
      prisma.ride.findUnique.mockResolvedValue(ride);
      prisma.rating.findUnique.mockResolvedValue(null);
      prisma.notificationDelivery.findFirst.mockResolvedValue(null);

      await service.handleRideCompleted(mockRideId);

      expect(emailEvents.sendPostRideReview).not.toHaveBeenCalled();
      expect(emailEvents.sendRideInvoice).not.toHaveBeenCalled();
      // SMS should still succeed
      expect(smsProvider.sendSms).toHaveBeenCalledTimes(1);
    });

    it('handles passenger with missing phone gracefully without error', async () => {
      const ride = createMockRide();
      ride.passenger.user.phoneE164 = null;
      prisma.ride.findUnique.mockResolvedValue(ride);
      prisma.rating.findUnique.mockResolvedValue(null);
      prisma.notificationDelivery.findFirst.mockResolvedValue(null);

      await service.handleRideCompleted(mockRideId);

      expect(smsProvider.sendSms).not.toHaveBeenCalled();
      // Emails should still succeed
      expect(emailEvents.sendPostRideReview).toHaveBeenCalledTimes(1);
      expect(emailEvents.sendRideInvoice).toHaveBeenCalledTimes(1);
    });
  });

  describe('Driver Tipping Reminder', () => {
    it('sends tipping reminder if ride is completed, untipped, and unreminded', async () => {
      const ride = createMockRide({
        financial: {
          rideFare: 200.0,
          marketplaceFee: 40.0,
          tipAmount: 0.0, // untipped
          passengerTotalCharged: 240.0,
        },
      });
      prisma.ride.findUnique.mockResolvedValue(ride);
      prisma.payment.findFirst.mockResolvedValue(null); // no tip payment
      prisma.notificationDelivery.findFirst.mockResolvedValue(null); // not already sent

      const result = await service.sendTippingReminderIfEligible(mockRideId);

      expect(result).toBe(true);
      expect(emailEvents.sendRideTipReminder).toHaveBeenCalledWith(
        mockPassengerUserId,
        'alice@example.com',
        expect.objectContaining({
          rideId: mockRideId,
          driverName: 'Bob Driver',
          tipUrl: `https://can-rides.ca/rides/${mockRideId}?action=tip`,
        }),
      );
    });

    it('does NOT send tipping reminder if passenger has already tipped in RideFinancial', async () => {
      const ride = createMockRide({
        financial: {
          rideFare: 200.0,
          marketplaceFee: 40.0,
          tipAmount: 15.0, // ALREADY TIPPED
          passengerTotalCharged: 255.0,
        },
      });
      prisma.ride.findUnique.mockResolvedValue(ride);

      const result = await service.sendTippingReminderIfEligible(mockRideId);

      expect(result).toBe(false);
      expect(emailEvents.sendRideTipReminder).not.toHaveBeenCalled();
    });

    it('does NOT send tipping reminder if tip payment exists', async () => {
      const ride = createMockRide();
      prisma.ride.findUnique.mockResolvedValue(ride);
      prisma.payment.findFirst.mockResolvedValue({ id: 'tip_pay_1', status: 'succeeded' });

      const result = await service.sendTippingReminderIfEligible(mockRideId);

      expect(result).toBe(false);
      expect(emailEvents.sendRideTipReminder).not.toHaveBeenCalled();
    });

    it('does NOT send tipping reminder if reminder was already sent', async () => {
      const ride = createMockRide();
      prisma.ride.findUnique.mockResolvedValue(ride);
      prisma.payment.findFirst.mockResolvedValue(null);
      prisma.notificationDelivery.findFirst.mockResolvedValue({ id: 'reminder_1', status: 'sent' });

      const result = await service.sendTippingReminderIfEligible(mockRideId);

      expect(result).toBe(false);
      expect(emailEvents.sendRideTipReminder).not.toHaveBeenCalled();
    });

    it('does NOT send tipping reminder for cancelled or uncompleted rides', async () => {
      const ride = createMockRide({ status: RideStatus.DRIVER_CANCELLED });
      prisma.ride.findUnique.mockResolvedValue(ride);

      const result = await service.sendTippingReminderIfEligible(mockRideId);

      expect(result).toBe(false);
      expect(emailEvents.sendRideTipReminder).not.toHaveBeenCalled();
    });
  });

  describe('getPrintableInvoiceHtml', () => {
    it('returns formatted printable invoice for authorized passenger', async () => {
      const ride = createMockRide();
      prisma.ride.findUnique.mockResolvedValue(ride);

      const html = await service.getPrintableInvoiceHtml(
        mockPassengerUserId,
        mockRideId,
        UserRole.PASSENGER,
      );

      expect(html).toContain('TAX INVOICE');
      expect(html).toContain('CA$200.00');
      expect(html).toContain('CA$40.00');
      expect(html).toContain('CA$240.00');
      expect(html).toContain('Toyota Camry');
      expect(html).toContain('Bob Driver');
    });

    it('allows admin to view invoice', async () => {
      const ride = createMockRide();
      prisma.ride.findUnique.mockResolvedValue(ride);

      const html = await service.getPrintableInvoiceHtml(
        'admin_user_id',
        mockRideId,
        UserRole.ADMIN,
      );

      expect(html).toContain('TAX INVOICE');
    });

    it('forbids unrelated user from viewing another passenger invoice', async () => {
      const ride = createMockRide();
      prisma.ride.findUnique.mockResolvedValue(ride);

      await expect(
        service.getPrintableInvoiceHtml(
          'unrelated_user_id',
          mockRideId,
          UserRole.PASSENGER,
        ),
      ).rejects.toThrow('You do not have permission to view this invoice');
    });
  });
});
