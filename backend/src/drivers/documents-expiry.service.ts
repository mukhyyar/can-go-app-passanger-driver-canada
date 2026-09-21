import { Injectable, Logger } from '@nestjs/common';
import {
  DocumentLifecycleStatus,
  DriverApprovalStatus,
  OfferStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DOC_TYPE_LABELS, DriverDocType } from './documents.constants';

@Injectable()
export class DocumentsExpiryService {
  private readonly logger = new Logger(DocumentsExpiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Sweeps current driver documents for expirations.
   * If any current document has expired, the driver's profile is deactivated,
   * active offers are withdrawn, and the driver is notified to re-upload.
   */
  async enforceExpiredDocuments(
    now = new Date(),
  ): Promise<{ deactivatedDrivers: number; expiredDocs: number }> {
    if (!(await this.prisma.isReady())) {
      return { deactivatedDrivers: 0, expiredDocs: 0 };
    }

    // Find all CURRENT documents that have expired
    const expiredDocs = await this.prisma.driverDocument.findMany({
      where: {
        lifecycleStatus: DocumentLifecycleStatus.CURRENT,
        expiresAt: { lt: now },
      },
      include: {
        driver: {
          select: {
            id: true,
            userId: true,
            isActivated: true,
            drivingEnabled: true,
            approvalStatus: true,
          },
        },
      },
    });

    if (!expiredDocs.length) {
      return { deactivatedDrivers: 0, expiredDocs: 0 };
    }

    // Group expired documents by driver
    const driverMap = new Map<
      string,
      {
        driver: (typeof expiredDocs)[0]['driver'];
        docs: typeof expiredDocs;
      }
    >();

    for (const doc of expiredDocs) {
      const existing = driverMap.get(doc.driverId);
      if (existing) {
        existing.docs.push(doc);
      } else {
        driverMap.set(doc.driverId, { driver: doc.driver, docs: [doc] });
      }
    }

    let deactivatedCount = 0;

    for (const [driverId, { driver, docs }] of driverMap.entries()) {
      const isActiveOrApproved =
        driver.isActivated ||
        driver.drivingEnabled ||
        driver.approvalStatus === DriverApprovalStatus.APPROVED;

      const expiredNames = docs
        .map((d) => DOC_TYPE_LABELS[d.docType as DriverDocType] || d.docType)
        .join(', ');

      if (isActiveOrApproved) {
        // 1. Deactivate driver profile
        await this.prisma.driverProfile.update({
          where: { id: driverId },
          data: {
            isActivated: false,
            drivingEnabled: false,
            approvalStatus: DriverApprovalStatus.ACTION_REQUIRED,
            suspensionReason: `Document expired: ${expiredNames}. Please upload updated document(s).`,
          },
        });

        // 2. Withdraw any active marketplace offers
        await this.prisma.offer.updateMany({
          where: {
            driverId,
            status: OfferStatus.ACTIVE,
          },
          data: {
            status: OfferStatus.WITHDRAWN,
          },
        });

        // 3. Audit log
        try {
          await this.prisma.auditLog.create({
            data: {
              action: 'system.driver.document_expired_deactivation',
              resource: 'DriverProfile',
              resourceId: driverId,
              reason: `Document expired: ${expiredNames}`,
              before: {
                isActivated: driver.isActivated,
                drivingEnabled: driver.drivingEnabled,
                approvalStatus: driver.approvalStatus,
              } as Prisma.InputJsonValue,
              after: {
                isActivated: false,
                drivingEnabled: false,
                approvalStatus: DriverApprovalStatus.ACTION_REQUIRED,
              } as Prisma.InputJsonValue,
              meta: {
                expiredDocumentIds: docs.map((d) => d.id),
                expiredDocTypes: docs.map((d) => d.docType),
              } as Prisma.InputJsonValue,
            },
          });
        } catch (e) {
          this.logger.warn(
            `Failed to create audit log for driver deactivation ${driverId}: ${e}`,
          );
        }

        deactivatedCount++;
      }

      // 4. Send notification to driver (deduplicated by primary expired doc id)
      const primaryDoc = docs[0];
      try {
        await this.notifications.sendToUser({
          userId: driver.userId,
          title: 'Account Deactivated: Document Expired',
          body: `Your ${expiredNames} has expired. Your profile has been deactivated and you cannot accept rides. Please upload the updated document for admin verification.`,
          templateKey: 'driver.document.expired',
          eventId: `doc_expired_${primaryDoc.id}`,
          data: {
            type: 'DOCUMENT_EXPIRED',
            docId: primaryDoc.id,
            docType: primaryDoc.docType,
          },
        });
      } catch (err) {
        this.logger.warn(
          `Failed to send expired notification to user ${driver.userId}: ${err}`,
        );
      }
    }

    return {
      deactivatedDrivers: deactivatedCount,
      expiredDocs: expiredDocs.length,
    };
  }

  /**
   * Sweeps current driver documents that are expiring soon (within 30 days)
   * and notifies active drivers so they can re-upload before expiry.
   */
  async notifyExpiringSoon(
    now = new Date(),
  ): Promise<{ notifiedCount: number }> {
    if (!(await this.prisma.isReady())) {
      return { notifiedCount: 0 };
    }

    const maxUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const expiringDocs = await this.prisma.driverDocument.findMany({
      where: {
        lifecycleStatus: DocumentLifecycleStatus.CURRENT,
        expiresAt: {
          gte: now,
          lte: maxUntil,
        },
        driver: {
          isActivated: true,
        },
      },
      include: {
        driver: {
          select: {
            id: true,
            userId: true,
          },
        },
      },
    });

    let notifiedCount = 0;

    for (const doc of expiringDocs) {
      if (!doc.expiresAt) continue;
      const diffMs = doc.expiresAt.getTime() - now.getTime();
      const daysLeft = Math.max(1, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));

      // Bucketing for reminder intervals: 30d, 7d, 1d
      let bucket: string | null = null;
      if (daysLeft <= 1) {
        bucket = '1d';
      } else if (daysLeft <= 7) {
        bucket = '7d';
      } else if (daysLeft <= 30) {
        bucket = '30d';
      }

      if (!bucket) continue;

      const label =
        DOC_TYPE_LABELS[doc.docType as DriverDocType] || doc.docType;
      const eventId = `doc_expiring_${doc.id}_${bucket}`;

      try {
        const result = await this.notifications.sendToUser({
          userId: doc.driver.userId,
          title: 'Document Expiring Soon',
          body: `Your ${label} will expire in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. Kindly upload your updated document to avoid interruption to your driving account.`,
          templateKey: 'driver.document.expiring',
          eventId,
          data: {
            type: 'DOCUMENT_EXPIRING',
            docId: doc.id,
            docType: doc.docType,
            daysLeft: String(daysLeft),
          },
        });
        if (result.sent > 0) notifiedCount++;
      } catch (err) {
        this.logger.warn(
          `Failed to send expiring notification for doc ${doc.id}: ${err}`,
        );
      }
    }

    return { notifiedCount };
  }
}
