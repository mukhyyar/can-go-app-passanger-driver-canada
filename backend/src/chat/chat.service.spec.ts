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

    it('allows chat when ride is COMPLETED but has active support case / ride report', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'passenger-1', role: UserRole.PASSENGER });
      mockPrisma.ride.findUnique.mockResolvedValue({
        id: 'ride-1',
        passenger: { userId: 'passenger-1' },
        selectedOffer: { driver: { userId: 'driver-1' } },
        supportCases: [{ id: 'case-1', status: SupportCaseStatus.OPEN }],
        status: RideStatus.COMPLETED,
      });
      mockPrisma.supportCase.findMany.mockResolvedValue([{ id: 'case-1' }]);

      const msg = await service.send('passenger-1', 'ride-1', 'Need help with this ride');
      expect(msg.body).toBe('Need help with this ride');
      expect(mockNotifications.notifyAdmins).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('New chat on Ride'),
          body: 'Need help with this ride',
          templateKey: 'admin.chat_message',
        }),
      );
    });

    it('rejects chat when ride is COMPLETED and has no active support case', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'passenger-1', role: UserRole.PASSENGER });
      mockPrisma.ride.findUnique.mockResolvedValue({
        id: 'ride-1',
        passenger: { userId: 'passenger-1' },
        selectedOffer: { driver: { userId: 'driver-1' } },
        supportCases: [{ id: 'case-old', status: SupportCaseStatus.RESOLVED }],
        status: RideStatus.COMPLETED,
      });

      await expect(service.send('passenger-1', 'ride-1', 'Hello')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('Admin message handling', () => {
    it('notifies customer when admin replies to ride chat', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'admin-1', role: UserRole.ADMIN });
      mockPrisma.ride.findUnique.mockResolvedValue({
        id: 'ride-1',
        passenger: { userId: 'passenger-1' },
        selectedOffer: { driver: { userId: 'driver-1' } },
        supportCases: [{ id: 'case-1', status: SupportCaseStatus.IN_PROGRESS }],
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
});
