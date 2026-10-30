jest.mock('../notifications/notifications.service', () => ({
  NotificationsService: class MockNotificationsService {},
}));

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RideStatus, SupportCaseStatus, UserRole } from '@prisma/client';
import { ChatService } from './chat.service';

describe('ChatService with Ride Reports and Support Cases', () => {
  let service: ChatService;
  let mockPrisma: any;
  let mockNotifications: any;

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: jest.fn(),
      },
      ride: {
        findUnique: jest.fn(),
      },
      driverProfile: {
        findUnique: jest.fn(),
      },
      chatThread: {
        upsert: jest.fn().mockResolvedValue({ id: 'thread-1', rideId: 'ride-1' }),
      },
      chatMessage: {
        create: jest.fn().mockImplementation((args) =>
          Promise.resolve({
            id: 'msg-1',
            threadId: args.data.threadId,
            senderId: args.data.senderId,
            body: args.data.body,
          }),
        ),
      },
      supportCase: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    mockNotifications = {
      sendToUser: jest.fn().mockResolvedValue({ sent: 1 }),
      notifyAdmins: jest.fn().mockResolvedValue([]),
    };

    service = new ChatService(mockPrisma, mockNotifications);
  });

  describe('Participant assertion & status gating', () => {
    it('throws NotFoundException if ride not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', role: UserRole.PASSENGER });
      mockPrisma.ride.findUnique.mockResolvedValue(null);

      await expect(service.send('user-1', 'ride-not-found', 'hello')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException if user is not participant or admin', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'stranger', role: UserRole.PASSENGER });
      mockPrisma.ride.findUnique.mockResolvedValue({
        id: 'ride-1',
        passenger: { userId: 'passenger-1' },
        selectedOffer: { driver: { userId: 'driver-1' } },
        supportCases: [],
        status: RideStatus.IN_PROGRESS,
      });

      await expect(service.send('stranger', 'ride-1', 'hello')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects chat when ride is COMPLETED', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'passenger-1', role: UserRole.PASSENGER });
      mockPrisma.ride.findUnique.mockResolvedValue({
        id: 'ride-1',
        passenger: { userId: 'passenger-1' },
        selectedOffer: { driver: { userId: 'driver-1' } },
        supportCases: [{ id: 'case-1', status: SupportCaseStatus.OPEN }],
        status: RideStatus.COMPLETED,
      });

      await expect(service.send('passenger-1', 'ride-1', 'Hello')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects chat when ride is CANCELLED', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'passenger-1', role: UserRole.PASSENGER });
      mockPrisma.ride.findUnique.mockResolvedValue({
        id: 'ride-1',
        passenger: { userId: 'passenger-1' },
        selectedOffer: { driver: { userId: 'driver-1' } },
        supportCases: [],
        status: RideStatus.PASSENGER_CANCELLED,
      });

      await expect(service.send('passenger-1', 'ride-1', 'Hello')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('marks thread as locked and includes lockReason in getOrCreateThread for terminal rides', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'passenger-1', role: UserRole.PASSENGER });
      mockPrisma.ride.findUnique.mockResolvedValue({
        id: 'ride-1',
        passenger: { userId: 'passenger-1' },
        selectedOffer: { driver: { userId: 'driver-1' } },
        supportCases: [],
        status: RideStatus.DRIVER_CANCELLED,
      });
      mockPrisma.chatThread.upsert.mockResolvedValue({
        id: 'thread-1',
        rideId: 'ride-1',
        messages: [],
      });

      const thread = await service.getOrCreateThread('passenger-1', 'ride-1');
      expect(thread.isLocked).toBe(true);
      expect(thread.lockReason).toBe('RIDE_CANCELLED');
      expect(thread.rideStatus).toBe(RideStatus.DRIVER_CANCELLED);
    });
  });

  describe('Admin message handling', () => {
    it('notifies customer when admin replies to ride chat', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'admin-1', role: UserRole.ADMIN });
      mockPrisma.ride.findUnique.mockResolvedValue({
        id: 'ride-1',
        passenger: { userId: 'passenger-1' },
        selectedOffer: { driver: { userId: 'driver-1' } },
        supportCases: [{ id: 'case-1', status: SupportCaseStatus.ASSIGNED }],
        status: RideStatus.COMPLETED,
      });

      const msg = await service.send('admin-1', 'ride-1', 'We are reviewing your report.');
      expect(msg.body).toBe('We are reviewing your report.');
      expect(mockNotifications.sendToUser).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'passenger-1',
          title: 'Support message from Can-Ride',
          body: 'We are reviewing your report.',
        }),
      );
    });
  });

  describe('Role preservation & Zigzag alignment', () => {
    it('preserves distinct PASSENGER and DRIVER roles even when passenger and driver share the same userId', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'shared-user', role: UserRole.PASSENGER });
      mockPrisma.ride.findUnique.mockResolvedValue({
        id: 'ride-shared',
        passenger: { userId: 'shared-user' },
        selectedOffer: { driver: { userId: 'shared-user' } },
        supportCases: [],
        status: RideStatus.IN_PROGRESS,
      });
      mockPrisma.chatThread.upsert.mockResolvedValue({
        id: 'thread-shared',
        rideId: 'ride-shared',
        messages: [
          {
            id: 'msg-1',
            threadId: 'thread-shared',
            senderId: 'shared-user',
            body: '<!--role:PASSENGER-->im ready',
            createdAt: new Date('2026-10-30T10:00:00Z'),
          },
          {
            id: 'msg-2',
            threadId: 'thread-shared',
            senderId: 'shared-user',
            body: '<!--role:DRIVER-->arrived',
            createdAt: new Date('2026-10-30T10:05:00Z'),
          },
        ],
      });

      const thread = await service.getOrCreateThread('shared-user', 'ride-shared');
      expect(thread.messages).toHaveLength(2);

      const m1 = thread.messages[0];
      expect(m1.body).toBe('im ready');
      expect(m1.senderRole).toBe('PASSENGER');

      const m2 = thread.messages[1];
      expect(m2.body).toBe('arrived');
      expect(m2.senderRole).toBe('DRIVER');
    });

    it('stores role tag when sending as PASSENGER or DRIVER', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', role: UserRole.PASSENGER });
      mockPrisma.ride.findUnique.mockResolvedValue({
        id: 'ride-1',
        passenger: { userId: 'user-1' },
        selectedOffer: { driver: { userId: 'driver-2' } },
        supportCases: [],
        status: RideStatus.IN_PROGRESS,
      });

      const sentPassenger = await service.send('user-1', 'ride-1', 'I am here', 'PASSENGER');
      expect(sentPassenger.body).toBe('I am here');
      expect(sentPassenger.senderRole).toBe('PASSENGER');
      expect(mockPrisma.chatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            body: '<!--role:PASSENGER-->I am here',
          }),
        }),
      );
    });
  });
});
