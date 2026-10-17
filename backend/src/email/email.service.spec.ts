jest.mock('@nestjs/config', () => ({
  ConfigService: class MockConfigService {
    get = jest.fn(() => null);
  },
}));

import { EmailService } from './email.service';

describe('EmailService', () => {
  let emailService: EmailService;
  let mockConfigService: any;
  let mockPrisma: any;
  let mockTransporter: any;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'email.enabled') return true;
        if (key === 'email.fromAddress') return 'Can Ride <no-reply@can-rides.ca>';
        if (key === 'email.smtpHost') return 'mail.can-rides.ca';
        if (key === 'email.smtpPort') return 465;
        if (key === 'email.smtpUser') return 'no-reply@can-rides.ca';
        if (key === 'email.smtpPass') return 'secret';
        return null;
      }),
    };

    mockPrisma = {
      notificationDelivery: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'delivery_123', status: 'sent' }),
      },
    };

    emailService = new EmailService(mockConfigService, mockPrisma);

    mockTransporter = {
      sendMail: jest.fn().mockResolvedValue({ messageId: 'msg_test_123' }),
    };
    (emailService as any).transporter = mockTransporter;
  });

  it('sends email and creates notification delivery with providerMsgId and eventId', async () => {
    await emailService.sendTemplate(
      'ride_delayed_alert',
      'user@example.ca',
      'Urgent Action Required',
      '<p>Ride Stalled</p>',
      { eventId: 'ride_delayed_alert_email_ride1_passenger', userId: 'usr_1' },
    );

    expect(mockTransporter.sendMail).toHaveBeenCalledTimes(1);
    expect(mockTransporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.ca',
        subject: 'Urgent Action Required',
      }),
    );

    expect(mockPrisma.notificationDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          channel: 'email',
          templateKey: 'ride_delayed_alert',
          userId: 'usr_1',
          provider: 'smtp',
          providerMsgId: 'ride_delayed_alert_email_ride1_passenger',
          status: 'sent',
          dataJson: { eventId: 'ride_delayed_alert_email_ride1_passenger' },
        }),
      }),
    );
  });

  it('deduplicates when notificationDelivery already has status=sent', async () => {
    mockPrisma.notificationDelivery.findFirst.mockResolvedValue({
      id: 'existing_del_1',
      status: 'sent',
      createdAt: new Date(),
    });

    await emailService.sendTemplate(
      'ride_delayed_alert',
      'user@example.ca',
      'Urgent Action Required',
      '<p>Ride Stalled</p>',
      { eventId: 'ride_delayed_alert_email_ride1_passenger', userId: 'usr_1' },
    );

    expect(mockTransporter.sendMail).not.toHaveBeenCalled();
    expect(mockPrisma.notificationDelivery.create).not.toHaveBeenCalled();
  });

  it('drops duplicate in-flight sends for the same eventId', async () => {
    let resolveSend: any;
    mockTransporter.sendMail.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSend = resolve;
        }),
    );

    // Start first send (stays in-flight)
    const p1 = emailService.sendTemplate(
      'ride_delayed_alert',
      'user@example.ca',
      'Urgent Action Required',
      '<p>Ride Stalled</p>',
      { eventId: 'ride_delayed_alert_email_ride1_passenger' },
    );

    // Second send for the same event while first is in flight
    const p2 = emailService.sendTemplate(
      'ride_delayed_alert',
      'user@example.ca',
      'Urgent Action Required',
      '<p>Ride Stalled</p>',
      { eventId: 'ride_delayed_alert_email_ride1_passenger' },
    );

    // Wait a tick for first send to reach transporter
    await new Promise((r) => setTimeout(r, 10));

    // Resolve first send
    if (resolveSend) {
      resolveSend({ messageId: 'msg_1' });
    }
    await Promise.all([p1, p2]);

    // Transporter should have only been invoked ONCE
    expect(mockTransporter.sendMail).toHaveBeenCalledTimes(1);
  });

  it('enforces cooldown if prior delivery attempt recently failed (< 15 mins)', async () => {
    mockPrisma.notificationDelivery.findFirst.mockResolvedValue({
      id: 'failed_del_1',
      status: 'failed',
      createdAt: new Date(Date.now() - 2 * 60 * 1000), // 2 mins ago
    });

    await emailService.sendTemplate(
      'ride_delayed_alert',
      'user@example.ca',
      'Urgent Action Required',
      '<p>Ride Stalled</p>',
      { eventId: 'ride_delayed_alert_email_ride1_passenger' },
    );

    expect(mockTransporter.sendMail).not.toHaveBeenCalled();
  });

  it('falls back to recording delivery without userId if foreign key fails', async () => {
    mockPrisma.notificationDelivery.create
      .mockRejectedValueOnce(new Error('Foreign key constraint failed on userId'))
      .mockResolvedValueOnce({ id: 'fallback_del_1', status: 'sent' });

    await emailService.sendTemplate(
      'ride_delayed_alert',
      'user@example.ca',
      'Urgent Action Required',
      '<p>Ride Stalled</p>',
      { eventId: 'ride_delayed_alert_email_ride1_passenger', userId: 'invalid_usr' },
    );

    expect(mockTransporter.sendMail).toHaveBeenCalledTimes(1);
    expect(mockPrisma.notificationDelivery.create).toHaveBeenCalledTimes(2);
    expect(mockPrisma.notificationDelivery.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerMsgId: 'ride_delayed_alert_email_ride1_passenger',
          status: 'sent',
          dataJson: expect.objectContaining({
            eventId: 'ride_delayed_alert_email_ride1_passenger',
            failedUserId: 'invalid_usr',
          }),
        }),
      }),
    );
  });
});
