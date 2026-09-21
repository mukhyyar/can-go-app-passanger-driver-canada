jest.mock('../notifications/notifications.service', () => ({
  NotificationsService: class MockNotificationsService {},
}));

import { DocumentsExpiryService } from './documents-expiry.service';
import { DriverApprovalStatus, OfferStatus } from '@prisma/client';

describe('DocumentsExpiryService', () => {
  let service: DocumentsExpiryService;
  let mockPrisma: any;
  let mockNotifications: any;

  beforeEach(() => {
    mockPrisma = {
      isReady: jest.fn().mockResolvedValue(true),
      driverDocument: {
        findMany: jest.fn(),
      },
      driverProfile: {
        update: jest.fn().mockResolvedValue({}),
      },
      offer: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    mockNotifications = {
      sendToUser: jest.fn().mockResolvedValue({ sent: 1 }),
    };

    service = new DocumentsExpiryService(mockPrisma, mockNotifications);
  });

  describe('enforceExpiredDocuments', () => {
    it('deactivates driver profile, withdraws offers, and sends notification when documents expire', () => {
      const now = new Date('2026-09-21T12:00:00Z');
      const expiredDoc = {
        id: 'doc-license-1',
        driverId: 'driver-1',
        docType: 'license',
        expiresAt: new Date('2026-09-20T00:00:00Z'),
        driver: {
          id: 'driver-1',
          userId: 'user-1',
          isActivated: true,
          drivingEnabled: true,
          approvalStatus: DriverApprovalStatus.APPROVED,
        },
      };

      mockPrisma.driverDocument.findMany.mockResolvedValue([expiredDoc]);

      return service.enforceExpiredDocuments(now).then((result) => {
        expect(result.deactivatedDrivers).toBe(1);
        expect(result.expiredDocs).toBe(1);

        expect(mockPrisma.driverProfile.update).toHaveBeenCalledWith({
          where: { id: 'driver-1' },
          data: {
            isActivated: false,
            drivingEnabled: false,
            approvalStatus: DriverApprovalStatus.ACTION_REQUIRED,
            suspensionReason: expect.stringContaining('Document expired: Driving Licence'),
          },
        });

        expect(mockPrisma.offer.updateMany).toHaveBeenCalledWith({
          where: {
            driverId: 'driver-1',
            status: OfferStatus.ACTIVE,
          },
          data: {
            status: OfferStatus.WITHDRAWN,
          },
        });

        expect(mockNotifications.sendToUser).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'user-1',
            title: 'Account Deactivated: Document Expired',
            templateKey: 'driver.document.expired',
            eventId: 'doc_expired_doc-license-1',
          }),
        );

        expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              action: 'system.driver.document_expired_deactivation',
              resource: 'DriverProfile',
              resourceId: 'driver-1',
            }),
          }),
        );
      });
    });

    it('does nothing when no current documents are expired', () => {
      mockPrisma.driverDocument.findMany.mockResolvedValue([]);

      return service.enforceExpiredDocuments().then((result) => {
        expect(result.deactivatedDrivers).toBe(0);
        expect(result.expiredDocs).toBe(0);
        expect(mockPrisma.driverProfile.update).not.toHaveBeenCalled();
        expect(mockNotifications.sendToUser).not.toHaveBeenCalled();
      });
    });
  });

  describe('notifyExpiringSoon', () => {
    it('notifies active driver when a document expires within 30 days', () => {
      const now = new Date('2026-09-21T12:00:00Z');
      const expiringDoc = {
        id: 'doc-ins-1',
        driverId: 'driver-2',
        docType: 'insurance',
        expiresAt: new Date('2026-09-28T12:00:00Z'), // 7 days left
        driver: {
          id: 'driver-2',
          userId: 'user-2',
        },
      };

      mockPrisma.driverDocument.findMany.mockResolvedValue([expiringDoc]);

      return service.notifyExpiringSoon(now).then((result) => {
        expect(result.notifiedCount).toBe(1);
        expect(mockNotifications.sendToUser).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'user-2',
            title: 'Document Expiring Soon',
            templateKey: 'driver.document.expiring',
            eventId: 'doc_expiring_doc-ins-1_7d',
          }),
        );
      });
    });
  });
});
