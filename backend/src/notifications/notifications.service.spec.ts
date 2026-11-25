jest.mock('@nestjs/config', () => ({
  ConfigService: class MockConfigService {
    get = jest.fn();
  },
}));

import { NotificationsService } from './notifications.service';

describe('NotificationsService - Target Role Filtering', () => {
  let service: NotificationsService;
  let prismaMock: any;
  let firebaseMock: any;

  beforeEach(() => {
    prismaMock = {
      isReady: jest.fn().mockResolvedValue(true),
      notificationDelivery: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'delivery-1' }),
        count: jest.fn().mockResolvedValue(0),
      },
      deviceToken: {
        findMany: jest.fn().mockResolvedValue([]),
        delete: jest.fn().mockResolvedValue({}),
      },
    };

    firebaseMock = {
      isConfigured: jest.fn().mockReturnValue(true),
      messaging: jest.fn().mockReturnValue({
        send: jest.fn().mockResolvedValue('msg-id-123'),
      }),
    };

    service = new NotificationsService(prismaMock, firebaseMock, undefined);
  });

  it('filters device tokens by targetRole DRIVER', async () => {
    prismaMock.deviceToken.findMany.mockResolvedValue([
      { id: '1', token: 'token-driver', appRole: 'DRIVER' },
    ]);

    await service.sendToUser({
      userId: 'user-123',
      title: 'Offer not selected',
      body: 'Another offer was booked for this request.',
      templateKey: 'ride.offer_not_selected',
      targetRole: 'DRIVER',
      data: { type: 'OFFER_NOT_SELECTED' },
    });

    expect(prismaMock.deviceToken.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-123',
        appRole: 'DRIVER',
      },
    });
  });

  it('auto-infers targetRole DRIVER for OFFER_NOT_SELECTED even when targetRole not passed', async () => {
    prismaMock.deviceToken.findMany.mockResolvedValue([
      { id: '1', token: 'token-driver', appRole: 'DRIVER' },
    ]);

    await service.sendToUser({
      userId: 'user-123',
      title: 'Offer not selected',
      body: 'Another offer was booked for this request.',
      templateKey: 'ride.offer_not_selected',
      data: { type: 'OFFER_NOT_SELECTED' },
    });

    expect(prismaMock.deviceToken.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-123',
        appRole: 'DRIVER',
      },
    });
  });

  it('filters device tokens by PASSENGER and PASSENGER_WEB for passenger notifications', async () => {
    prismaMock.deviceToken.findMany.mockResolvedValue([
      { id: '2', token: 'token-passenger', appRole: 'PASSENGER' },
    ]);

    await service.sendToUser({
      userId: 'user-123',
      title: 'New offer available',
      body: 'A driver submitted an offer',
      templateKey: 'ride.offer_received',
      targetRole: 'PASSENGER',
      data: { type: 'RIDE_OFFER_RECEIVED' },
    });

    expect(prismaMock.deviceToken.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-123',
        appRole: { in: ['PASSENGER', 'PASSENGER_WEB'] },
      },
    });
  });

  it('auto-infers PASSENGER role from ride.offer_received templateKey', async () => {
    prismaMock.deviceToken.findMany.mockResolvedValue([
      { id: '2', token: 'token-passenger', appRole: 'PASSENGER' },
    ]);

    await service.sendToUser({
      userId: 'user-123',
      title: 'New offer available',
      body: 'A driver submitted an offer',
      templateKey: 'ride.offer_received',
      data: {},
    });

    expect(prismaMock.deviceToken.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-123',
        appRole: { in: ['PASSENGER', 'PASSENGER_WEB'] },
      },
    });
  });

  describe('App Icon Badge Count Calculation', () => {
    it('sets aps.badge and android.notificationCount to unread + 1 for visible notifications', async () => {
      prismaMock.deviceToken.findMany.mockResolvedValue([
        { id: '1', token: 'token-ios', appRole: 'PASSENGER' },
      ]);
      prismaMock.notificationDelivery.count.mockResolvedValue(2);

      const sendMock = jest.fn().mockResolvedValue('msg-id-123');
      firebaseMock.messaging.mockReturnValue({ send: sendMock });

      await service.sendToUser({
        userId: 'user-123',
        title: 'New offer',
        body: 'Driver offered $25',
        templateKey: 'ride.offer_received',
        data: {},
      });

      expect(prismaMock.notificationDelivery.count).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          readAt: null,
          OR: [{ title: { not: null } }, { body: { not: null } }],
        },
      });

      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'token-ios',
          apns: expect.objectContaining({
            payload: expect.objectContaining({
              aps: expect.objectContaining({
                badge: 3, // 2 unread + 1 new
                sound: 'default',
              }),
            }),
          }),
          android: expect.objectContaining({
            notification: expect.objectContaining({
              notificationCount: 3,
            }),
          }),
        }),
      );
    });

    it('respects explicit payload.badge override', async () => {
      prismaMock.deviceToken.findMany.mockResolvedValue([
        { id: '1', token: 'token-ios', appRole: 'PASSENGER' },
      ]);
      prismaMock.notificationDelivery.count.mockResolvedValue(5);

      const sendMock = jest.fn().mockResolvedValue('msg-id-123');
      firebaseMock.messaging.mockReturnValue({ send: sendMock });

      await service.sendToUser({
        userId: 'user-123',
        title: 'Badge reset',
        body: 'Count set to 0',
        templateKey: 'system.badge_reset',
        data: {},
        badge: 0,
      });

      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          apns: expect.objectContaining({
            payload: expect.objectContaining({
              aps: expect.objectContaining({
                badge: 0,
              }),
            }),
          }),
          android: expect.objectContaining({
            notification: expect.objectContaining({
              notificationCount: 0,
            }),
          }),
        }),
      );
    });
  });
});
