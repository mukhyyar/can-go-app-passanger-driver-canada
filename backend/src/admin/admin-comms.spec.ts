jest.mock('@nestjs/config', () => ({
  ConfigService: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
  })),
}));
jest.mock('@nestjs/jwt', () => ({
  JwtService: jest.fn().mockImplementation(() => ({
    sign: jest.fn(),
    verify: jest.fn(),
  })),
}));

import { AdminOpsService } from './admin.service';

describe('AdminOpsService - Communication & Notifications', () => {
  let service: AdminOpsService;
  let prisma: any;
  let mockSms: any;
  let mockNotifications: any;

  beforeEach(() => {
    prisma = {
      notificationDelivery: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      notificationCampaign: {
        create: jest.fn().mockResolvedValue({ id: 'camp-1' }),
        update: jest.fn().mockResolvedValue({ id: 'camp-1', status: 'SENT' }),
      },
      notificationTemplate: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({ id: 'tmpl-1' }),
      },
      inAppAnnouncement: {
        create: jest.fn().mockResolvedValue({ id: 'anno-1' }),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };

    const mockConfig = { get: jest.fn() } as any;
    mockNotifications = {
      logDelivery: jest.fn().mockResolvedValue({ id: 'del-1' }),
      sendToUser: jest.fn().mockResolvedValue({ sent: true }),
    };
    const mockLaunchGate = {} as any;
    const mockFirebase = {} as any;
    const mockPasswords = {} as any;
    const mockTokens = {} as any;
    const mockStorage = { isReady: jest.fn().mockReturnValue(false) } as any;
    const mockPayments = {} as any;
    mockSms = {
      sendSms: jest.fn().mockResolvedValue({ sid: 'SM123' }),
    };

    service = new AdminOpsService(
      prisma,
      mockConfig,
      mockNotifications,
      mockLaunchGate,
      mockFirebase,
      mockPasswords,
      mockTokens,
      mockStorage,
      mockPayments,
      mockSms,
    );
  });

  describe('listDeliveries', () => {
    it('queries deliveries including user relation', async () => {
      await service.listDeliveries();
      expect(prisma.notificationDelivery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
          orderBy: { createdAt: 'desc' },
          include: expect.objectContaining({
            user: expect.any(Object),
          }),
        }),
      );
    });

    it('filters by channel=sms correctly', async () => {
      await service.listDeliveries('sms');
      expect(prisma.notificationDelivery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: [{ channel: 'sms' }, { provider: 'twilio' }] },
        }),
      );
    });

    it('filters by channel=push correctly', async () => {
      await service.listDeliveries('push');
      expect(prisma.notificationDelivery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: [{ channel: 'push' }, { channel: 'fcm' }, { provider: 'fcm' }] },
        }),
      );
    });
  });

  describe('templates', () => {
    it('lists templates ordered by key', async () => {
      await service.listTemplates();
      expect(prisma.notificationTemplate.findMany).toHaveBeenCalledWith({
        orderBy: { key: 'asc' },
      });
    });
  });
});

