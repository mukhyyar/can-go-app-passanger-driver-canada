import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import {
  DriverApprovalStatus,
  Prisma,
  Ride,
  RideStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from '../providers/payment/payment-provider.interface';

export interface ProviderReasonDefinition {
  code: string;
  label: string;
  description: string;
  isJustified: boolean;
  requiresDetails: boolean;
  sortOrder: number;
}

export const DEFAULT_PROVIDER_CANCELLATION_REASONS: ProviderReasonDefinition[] = [
  {
    code: 'UNSAFE_CONDITIONS',
    label: 'Immediate Safety Threat',
    description: 'Physical danger, threats, weapons, hostility, or hazardous environment',
    isJustified: true,
    requiresDetails: true,
    sortOrder: 1,
  },
  {
    code: 'UNLAWFUL_ACTIVITY',
    label: 'Unlawful Activity',
    description: 'Solicitation of illegal acts, illicit substances, or contraband',
    isJustified: true,
    requiresDetails: true,
    sortOrder: 2,
  },
  {
    code: 'PASSENGER_ISSUE',
    label: 'Dangerous Passenger Conduct',
    description: 'Passenger aggression, violence, intoxication, or safety violations',
    isJustified: true,
    requiresDetails: true,
    sortOrder: 3,
  },
  {
    code: 'VEHICLE_BREAKDOWN',
    label: 'Unsafe Vehicle Condition',
    description: 'Mechanical failure, flat tire, brake trouble, or compromised vehicle safety',
    isJustified: true,
    requiresDetails: false,
    sortOrder: 4,
  },
  {
    code: 'DRIVER_EMERGENCY',
    label: 'Emergency',
    description: 'Personal or passenger medical crisis, acute emergency, or collision',
    isJustified: true,
    requiresDetails: false,
    sortOrder: 5,
  },
  {
    code: 'LEGAL_RESTRICTION',
    label: 'Legal Restriction',
    description: 'Missing required child safety seat, excess passengers beyond seatbelts, or regulatory restriction',
    isJustified: true,
    requiresDetails: true,
    sortOrder: 6,
  },
  {
    code: 'WEATHER_ROAD_CONDITIONS',
    label: 'Weather or Road Conditions',
    description: 'Severe weather, impassable roads, flooding, or highway closures',
    isJustified: true,
    requiresDetails: false,
    sortOrder: 7,
  },
  {
    code: 'OTHER',
    label: 'Other',
    description: 'Any unlisted reason (requires explanation note)',
    isJustified: false,
    requiresDetails: true,
    sortOrder: 8,
  },
  {
    code: 'PROVIDER_NO_SHOW',
    label: 'Provider Failed to Arrive (No-Show)',
    description: 'Driver failed to reach pickup location within the required schedule and waiting window',
    isJustified: false,
    requiresDetails: false,
    sortOrder: 9,
  },
];

@Injectable()
export class DriverCancellationService implements OnModuleInit {
  private readonly logger = new Logger(DriverCancellationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @Optional()
    @Inject(PAYMENT_PROVIDER)
    private readonly payments?: PaymentProvider,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaultReasons();
  }

  /** Ensure default structured reasons exist in DB */
  async seedDefaultReasons(): Promise<void> {
    try {
      for (const def of DEFAULT_PROVIDER_CANCELLATION_REASONS) {
        await this.prisma.providerCancellationReason.upsert({
          where: { code: def.code },
          update: {},
          create: {
            code: def.code,
            label: def.label,
            description: def.description,
            isJustified: def.isJustified,
            requiresDetails: def.requiresDetails,
            sortOrder: def.sortOrder,
            isActive: true,
          },
        });
      }
      this.logger.log('Provider cancellation reasons seeded successfully');
    } catch (e) {
      this.logger.error(`Error seeding provider cancellation reasons: ${e}`);
    }
  }

  /** Public/driver-facing list of active cancellation reasons */
  async getActiveReasons() {
    return this.prisma.providerCancellationReason.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        code: true,
        label: true,
        description: true,
        isJustified: true,
        requiresDetails: true,
        sortOrder: true,
      },
    });
  }

  /**
   * Driver cancels an accepted/active ride.
   * Enforces structured reason, processes 100% full passenger refund, sets $0 driver comp,
   * creates audit record, logs events, and dispatches notifications.
   */
  async cancelByDriver(params: {
    userId: string;
    rideId: string;
    reasonCode: string;
    reasonDetails?: string;
    lat?: number;
    lng?: number;
    ip?: string;
  }) {
    const { userId, rideId, reasonCode, reasonDetails, lat, lng, ip } = params;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { driverProfile: true },
    });
    if (!user || !user.driverProfile) {
      throw new ForbiddenException('Only approved drivers can cancel via this method');
    }

    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        passenger: true,
        selectedOffer: { include: { driver: true } },
      },
    });
    if (!ride) {
      throw new NotFoundException('Ride not found');
    }

    if (ride.assignedDriverId !== user.driverProfile.id) {
      throw new ForbiddenException('You are not the assigned driver for this ride');
    }

    const cancellableStatuses: RideStatus[] = [
      RideStatus.BOOKED,
      RideStatus.DRIVER_EN_ROUTE,
      RideStatus.DRIVER_ARRIVED,
      RideStatus.TRIP_STARTED,
      RideStatus.IN_PROGRESS,
    ];

    if (!cancellableStatuses.includes(ride.status)) {
      throw new BadRequestException(
        `Cannot cancel ride with current status: ${ride.status}`,
      );
    }

    // Validate structured reason
    const reason = await this.prisma.providerCancellationReason.findUnique({
      where: { code: reasonCode },
    });
    if (!reason || !reason.isActive) {
      throw new BadRequestException(
        `Invalid cancellation reason code: ${reasonCode}`,
      );
    }

    const trimmedDetails = (reasonDetails ?? '').trim();
    if (reason.requiresDetails && trimmedDetails.length < 5) {
      throw new BadRequestException(
        `Please provide more details for reason "${reason.label}" (minimum 5 characters).`,
      );
    }

    const rideStatusAtCancel = ride.status;

    // Process 100% full passenger refund
    const refundInfo = await this.processFullPassengerRefund(
      rideId,
      userId,
      reason.label,
    );

    // Atomically record cancellation record and update ride status
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.ride.update({
        where: { id: rideId },
        data: { status: RideStatus.DRIVER_CANCELLED },
      });

      const record = await tx.driverCancellationRecord.create({
        data: {
          rideId,
          driverId: user.driverProfile!.id,
          reasonCode: reason.code,
          reasonLabel: reason.label,
          reasonDetails: trimmedDetails || null,
          isJustified: reason.isJustified,
          rideStatusAtCancel,
          driverLat: lat ?? null,
          driverLng: lng ?? null,
        },
      });

      await tx.rideEvent.create({
        data: {
          rideId,
          fromStatus: rideStatusAtCancel,
          toStatus: RideStatus.DRIVER_CANCELLED,
          actorType: 'driver',
          actorId: userId,
          payload: {
            action: 'driver.cancel',
            reasonCode: reason.code,
            reasonLabel: reason.label,
            isJustified: reason.isJustified,
            reasonDetails: trimmedDetails || null,
            refundAmount: refundInfo.amount ?? 0,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'ride.driver_cancelled',
          resource: 'Ride',
          resourceId: rideId,
          ip,
          meta: {
            reasonCode: reason.code,
            isJustified: reason.isJustified,
            refundAmount: refundInfo.amount ?? 0,
          },
        },
      });

      // Void driver earnings on financial record
      await tx.rideFinancial.updateMany({
        where: { rideId },
        data: {
          driverNetEarning: 0,
          refundAmount: refundInfo.amount ?? 0,
          refundReason: `Driver cancelled: ${reason.label}`,
        },
      });

      return record;
    });

    // Notify passenger
    if (ride.passenger?.userId) {
      const refundNotice =
        refundInfo.refunded && refundInfo.amount
          ? ` A 100% full refund of CAD $${refundInfo.amount.toFixed(2)} has been processed to your original payment method.`
          : '';
      await this.notifications.notifyRideStatus({
        userIds: [ride.passenger.userId],
        rideId,
        status: RideStatus.DRIVER_CANCELLED,
        title: 'Ride Cancelled by Driver',
        body: `Your driver had to cancel this trip (${reason.label}).${refundNotice}`,
        targetRole: ['PASSENGER', 'PASSENGER_WEB'],
      });
    }

    // Notify driver
    await this.notifications.notifyRideStatus({
      userIds: [userId],
      rideId,
      status: RideStatus.DRIVER_CANCELLED,
      title: 'Ride Cancellation Confirmed',
      body: reason.isJustified
        ? `Cancellation logged under "${reason.label}". Thank you for keeping the platform safe.`
        : `Cancellation logged under "${reason.label}". Repeated unjustified cancellations may affect your driver rating.`,
      targetRole: 'DRIVER',
    });

    return {
      success: true,
      rideId,
      status: RideStatus.DRIVER_CANCELLED,
      record: result,
      refund: refundInfo,
    };
  }

  /** Helper to fully refund all captured payments on the ride */
  private async processFullPassengerRefund(
    rideId: string,
    actorId: string,
    reasonLabel: string,
  ): Promise<{ refunded: boolean; amount?: number }> {
    try {
      const payment = await this.prisma.payment.findFirst({
        where: {
          rideId,
          status: { in: ['succeeded', 'captured', 'paid', 'SUCCEEDED', 'CAPTURED'] },
        },
        include: { refunds: true },
      });
      if (!payment) {
        return { refunded: false, amount: 0 };
      }

      const alreadyRefunded = payment.refunds
        .filter((r) => r.status === 'succeeded' || r.status === 'pending')
        .reduce((sum, r) => sum + Number(r.amount), 0);

      const remaining = Number(payment.amount) - alreadyRefunded;
      if (remaining <= 0.01) {
        return { refunded: false, amount: 0 };
      }

      let gatewayRefundId: string | undefined;
      let gatewayStatus = 'succeeded';
      let gatewayResponse: Record<string, unknown> = {};

      if (this.payments && remaining > 0.01) {
        try {
          const res = await this.payments.refund(
            payment.providerRef ?? payment.id,
            remaining,
          );
          gatewayRefundId = res.refundId;
          gatewayStatus =
            res.status === 'succeeded' || res.status === 'pending'
              ? res.status
              : 'succeeded';
          gatewayResponse = res as unknown as Record<string, unknown>;
        } catch (gatewayErr) {
          this.logger.error(
            `Gateway refund error on driver cancel for ride ${rideId}: ${gatewayErr}`,
          );
          gatewayStatus = 'failed';
          gatewayResponse = {
            error: gatewayErr instanceof Error ? gatewayErr.message : String(gatewayErr),
          };
        }
      }

      const validUser = await this.prisma.user.findUnique({
        where: { id: actorId },
        select: { id: true },
      });
      const refundRequesterId = validUser?.id ?? actorId;

      await this.prisma.refund.create({
        data: {
          paymentId: payment.id,
          requestedById: refundRequesterId,
          amount: remaining,
          currency: payment.currency,
          type: 'FULL',
          reason: `100% full refund due to driver cancellation (${reasonLabel})`,
          status: gatewayStatus,
          gatewayRefundId,
          gatewayResponse: gatewayResponse as unknown as Prisma.InputJsonValue,
        },
      });

      return { refunded: true, amount: remaining };
    } catch (e) {
      this.logger.error(`Failed to process full passenger refund for ride ${rideId}: ${e}`);
      return { refunded: false };
    }
  }

  /**
   * Repeated Unjustified Cancellation Analytics & Repeat Offenders Ranking.
   * Groups cancellations by driver within a given time window (default 30 days).
   */
  async getRepeatOffendersReport(params?: {
    windowDays?: number;
    threshold?: number;
  }) {
    const days = params?.windowDays ?? 30;
    const threshold = params?.threshold ?? 2;
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);

    // Aggregate records in time window
    const records = await this.prisma.driverCancellationRecord.findMany({
      where: {
        createdAt: { gte: sinceDate },
      },
      include: {
        driver: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                phoneE164: true,
                isSuspended: true,
              },
            },
          },
        },
        reason: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const driverMap = new Map<
      string,
      {
        driverId: string;
        fullName: string;
        userId: string;
        email: string | null;
        phone: string;
        isSuspended: boolean;
        approvalStatus: DriverApprovalStatus;
        warningCount: number;
        totalCancellations: number;
        unjustifiedCount: number;
        justifiedCount: number;
        recentCancellations: Array<{
          id: string;
          rideId: string;
          reasonCode: string;
          reasonLabel: string;
          isJustified: boolean;
          effectiveJustified: boolean;
          reasonDetails: string | null;
          createdAt: Date;
        }>;
      }
    >();

    let totalCancellations = 0;
    let totalUnjustified = 0;
    let totalJustified = 0;

    for (const r of records) {
      totalCancellations++;
      const effectiveJustified = r.adminOverriddenJustified ?? r.isJustified;
      if (effectiveJustified) {
        totalJustified++;
      } else {
        totalUnjustified++;
      }

      const d = r.driver;
      if (!driverMap.has(d.id)) {
        driverMap.set(d.id, {
          driverId: d.id,
          fullName: d.fullName || 'Unknown Driver',
          userId: d.userId,
          email: d.user.email ?? null,
          phone: d.user.phoneE164 ?? '',
          isSuspended: d.user.isSuspended,
          approvalStatus: d.approvalStatus,
          warningCount: d.warningCount,
          totalCancellations: 0,
          unjustifiedCount: 0,
          justifiedCount: 0,
          recentCancellations: [],
        });
      }

      const entry = driverMap.get(d.id)!;
      entry.totalCancellations++;
      if (effectiveJustified) {
        entry.justifiedCount++;
      } else {
        entry.unjustifiedCount++;
      }

      if (entry.recentCancellations.length < 5) {
        entry.recentCancellations.push({
          id: r.id,
          rideId: r.rideId,
          reasonCode: r.reasonCode,
          reasonLabel: r.reasonLabel,
          isJustified: r.isJustified,
          effectiveJustified,
          reasonDetails: r.reasonDetails,
          createdAt: r.createdAt,
        });
      }
    }

    const allDrivers = Array.from(driverMap.values()).map((d) => ({
      ...d,
      unjustifiedRate:
        d.totalCancellations > 0
          ? Math.round((d.unjustifiedCount / d.totalCancellations) * 100)
          : 0,
      isFlagged: d.unjustifiedCount >= threshold,
    }));

    allDrivers.sort((a, b) => b.unjustifiedCount - a.unjustifiedCount || b.totalCancellations - a.totalCancellations);

    const flaggedOffenders = allDrivers.filter((d) => d.unjustifiedCount >= threshold);

    return {
      windowDays: days,
      threshold,
      summary: {
        totalCancellations,
        totalUnjustified,
        totalJustified,
        unjustifiedRate:
          totalCancellations > 0
            ? Math.round((totalUnjustified / totalCancellations) * 100)
            : 0,
        flaggedDriversCount: flaggedOffenders.length,
      },
      flaggedOffenders,
      allActiveCancellers: allDrivers,
    };
  }

  /** Paginated cancellation records audit query */
  async getCancellationRecords(params?: {
    driverId?: string;
    reasonCode?: string;
    isJustified?: boolean;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params?.page ?? 1);
    const limit = Math.min(100, Math.max(1, params?.limit ?? 25));
    const skip = (page - 1) * limit;

    const where: Prisma.DriverCancellationRecordWhereInput = {};
    if (params?.driverId) where.driverId = params.driverId;
    if (params?.reasonCode) where.reasonCode = params.reasonCode;
    if (params?.isJustified !== undefined) where.isJustified = params.isJustified;

    const [items, total] = await Promise.all([
      this.prisma.driverCancellationRecord.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          driver: {
            select: {
              id: true,
              fullName: true,
              user: { select: { id: true, email: true, phoneE164: true } },
            },
          },
          ride: {
            select: {
              id: true,
              fromLabel: true,
              toLabel: true,
              pickupAt: true,
              status: true,
            },
          },
          reviewedByAdmin: {
            select: { id: true, email: true },
          },
        },
      }),
      this.prisma.driverCancellationRecord.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** Admin pardons or overrides cancellation justification with notes */
  async overrideJustification(
    adminId: string,
    recordId: string,
    dto: { isJustified: boolean; notes: string; ip?: string },
  ) {
    const record = await this.prisma.driverCancellationRecord.findUnique({
      where: { id: recordId },
      include: { driver: true },
    });
    if (!record) {
      throw new NotFoundException('Cancellation record not found');
    }

    const updated = await this.prisma.driverCancellationRecord.update({
      where: { id: recordId },
      data: {
        adminReviewed: true,
        adminOverriddenJustified: dto.isJustified,
        adminReviewNotes: dto.notes.trim(),
        reviewedByAdminId: adminId,
        reviewedAt: new Date(),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'driver_cancellation.justification_override',
        resource: 'DriverCancellationRecord',
        resourceId: recordId,
        ip: dto.ip,
        meta: {
          driverId: record.driverId,
          originalJustified: record.isJustified,
          newJustified: dto.isJustified,
          notes: dto.notes,
        },
      },
    });

    return updated;
  }

  /** Issue a formal warning to a driver */
  async issueWarning(
    adminId: string,
    driverId: string,
    dto: { reason: string; details?: string; category?: string; ip?: string },
  ) {
    const driver = await this.prisma.driverProfile.findUnique({
      where: { id: driverId },
      include: { user: true },
    });
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const newWarningCount = driver.warningCount + 1;

    const [warning] = await this.prisma.$transaction([
      this.prisma.driverWarning.create({
        data: {
          driverId,
          issuedByAdminId: adminId,
          category: dto.category ?? 'CANCELLATIONS',
          warningNumber: newWarningCount,
          reason: dto.reason.trim(),
          details: dto.details?.trim() || null,
        },
      }),
      this.prisma.driverProfile.update({
        where: { id: driverId },
        data: { warningCount: newWarningCount },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: adminId,
          action: 'driver.issue_warning',
          resource: 'DriverProfile',
          resourceId: driverId,
          ip: dto.ip,
          meta: {
            warningNumber: newWarningCount,
            reason: dto.reason,
          },
        },
      }),
    ]);

    // Send notification to driver
    await this.notifications.sendToUser({
      userId: driver.userId,
      title: `Formal Warning #${newWarningCount} Issued`,
      body: `Notice: ${dto.reason}. Please maintain platform standards to avoid account suspension.`,
      templateKey: 'driver.warning',
      targetRole: 'DRIVER',
      data: { type: 'driver.warning', warningNumber: String(newWarningCount) },
    });

    return warning;
  }

  /** Admin CRUD: Update structured reason configuration */
  async updateReason(
    adminId: string,
    code: string,
    dto: {
      label?: string;
      description?: string;
      isJustified?: boolean;
      requiresDetails?: boolean;
      isActive?: boolean;
      sortOrder?: number;
      ip?: string;
    },
  ) {
    const existing = await this.prisma.providerCancellationReason.findUnique({
      where: { code },
    });
    if (!existing) {
      throw new NotFoundException(`Reason with code ${code} not found`);
    }

    const updated = await this.prisma.providerCancellationReason.update({
      where: { code },
      data: {
        ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() } : {}),
        ...(dto.isJustified !== undefined ? { isJustified: dto.isJustified } : {}),
        ...(dto.requiresDetails !== undefined ? { requiresDetails: dto.requiresDetails } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'cancellation_reason.update',
        resource: 'ProviderCancellationReason',
        resourceId: updated.id,
        ip: dto.ip,
        meta: { code, changes: dto },
      },
    });

    return updated;
  }

  /** Admin disciplinary action: Permanently terminate driver account */
  async terminateDriver(
    adminId: string,
    driverId: string,
    dto: { reason: string; ip?: string },
  ) {
    const driver = await this.prisma.driverProfile.findUnique({
      where: { id: driverId },
      include: { user: true },
    });
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const cleanReason = dto.reason.trim();

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: driver.userId },
        data: { isSuspended: true },
      });
      await tx.userSession.updateMany({
        where: { userId: driver.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.driverProfile.update({
        where: { id: driverId },
        data: {
          approvalStatus: DriverApprovalStatus.REJECTED,
          drivingEnabled: false,
          isActivated: false,
          suspensionReason: `TERMINATED: ${cleanReason}`,
          suspendedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: adminId,
          action: 'driver.terminate',
          resource: 'DriverProfile',
          resourceId: driverId,
          ip: dto.ip,
          meta: { reason: cleanReason },
        },
      });
    });

    await this.notifications.sendToUser({
      userId: driver.userId,
      title: 'Account Terminated',
      body: `Your driver account has been terminated: ${cleanReason}. Contact support for inquiries.`,
      templateKey: 'driver.terminated',
      targetRole: 'DRIVER',
      data: { type: 'driver.terminated' },
    });

    return { success: true, driverId, status: 'TERMINATED' };
  }

  /**
   * Flag provider for failure to arrive / provider no-show (Section 11).
   * Creates an unjustified DriverCancellationRecord, adds a KYC review flag, and warns the driver.
   */
  async flagProviderForNoShow(params: {
    driverId: string;
    rideId: string;
    actorId?: string;
    reasonDetails?: string;
    ip?: string;
  }) {
    const { driverId, rideId, actorId, reasonDetails, ip } = params;

    const driver = await this.prisma.driverProfile.findUnique({
      where: { id: driverId },
      include: { user: true },
    });
    if (!driver) {
      this.logger.warn(`flagProviderForNoShow: Driver ${driverId} not found`);
      return;
    }

    const newWarningCount = driver.warningCount + 1;

    // 1. Create DriverCancellationRecord with PROVIDER_NO_SHOW
    const record = await this.prisma.driverCancellationRecord.create({
      data: {
        rideId,
        driverId,
        reasonCode: 'PROVIDER_NO_SHOW',
        reasonLabel: 'Provider Failed to Arrive (No-Show)',
        reasonDetails:
          reasonDetails ||
          'Driver failed to arrive at pickup location for scheduled ride.',
        isJustified: false,
        adminReviewed: false,
        rideStatusAtCancel: RideStatus.PASSENGER_CANCELLED,
      },
    });

    // 2. Add KycFlag for MANUAL_REVIEW
    try {
      if (this.prisma.kycFlag?.create) {
        await this.prisma.kycFlag.create({
          data: {
            driverId,
            flagType: 'MANUAL_REVIEW',
            reason: `Provider failed to arrive (no-show) on ride #${rideId.slice(-6)}`,
            note: 'Automatically flagged by system provider no-show workflow.',
            createdById: actorId ?? 'SYSTEM',
          },
        });
      }
    } catch (e) {
      this.logger.warn(`Could not create KycFlag: ${e}`);
    }

    // 3. Increment driver warning count
    await this.prisma.driverProfile.update({
      where: { id: driverId },
      data: { warningCount: newWarningCount },
    });

    // 4. Audit log
    await this.prisma.auditLog.create({
      data: {
        actorId: actorId ?? driver.userId,
        action: 'driver.no_show_flagged',
        resource: 'DriverProfile',
        resourceId: driverId,
        ip,
        meta: {
          rideId,
          reasonCode: 'PROVIDER_NO_SHOW',
          warningCount: newWarningCount,
        },
      },
    });

    // 5. Notify driver
    await this.notifications.sendToUser({
      userId: driver.userId,
      title: 'Provider No-Show Warning',
      body: `You did not arrive for scheduled pickup on ride #${rideId.slice(-6)}. Your account has been flagged for compliance review.`,
      templateKey: 'driver.no_show',
      targetRole: 'DRIVER',
      data: {
        type: 'driver.no_show',
        rideId,
        warningNumber: String(newWarningCount),
      },
    });

    return record;
  }
}

