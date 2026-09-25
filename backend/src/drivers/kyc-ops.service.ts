import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DocumentLifecycleStatus,
  DocumentReviewStatus,
  DriverApprovalStatus,
  KycFlagType,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import {
  DOC_TYPE_LABELS,
  DRIVER_DOC_TYPES,
  KYC_FLAG_TYPES,
  KYC_REJECT_REASON_LABELS,
  QUEUE_DOC_TYPES,
  REQUIRED_DOC_TYPES,
  RESUBMISSION_REASON_LABELS,
  type DriverDocType,
  type KycRejectReason,
  type ResubmissionReason,
} from './documents.constants';
import {
  activeDocs,
  approvalStatusesForTab,
  averageMs,
  buildEligibility,
  buildVerificationChecks,
  canApproveKyc,
  docIndicator,
  driverShortId,
  expiryBand,
  expiryLabel,
  formatDuration,
  isOpenQueueStatus,
  percentChange,
  pickLatestByType,
  progressFromDocs,
  waitingSla,
} from './kyc-ops.logic';
import { KycDocumentsService } from './kyc-documents.service';
import type {
  AddKycNoteDto,
  ApproveKycDto,
  AssignKycDto,
  BulkAssignKycDto,
  RejectKycDto,
  RequestChangesDto,
  RequestResubmissionDto,
  ReviewDocumentDto,
} from './dto/drivers.dto';
import type {
  ActivateDriverDto,
  AddKycFlagDto,
  ClearKycFlagDto,
  EditApplicantDto,
  ReopenKycDto,
  ResetKycDto,
  SuspendDriverDto,
} from './dto/kyc-enterprise.dto';

export type KycListQuery = {
  tab?: string;
  status?: string;
  q?: string;
  accountStatus?: string;
  dateFrom?: string;
  dateTo?: string;
  datePreset?: string;
  documentStatus?: string;
  vehicleStatus?: string;
  expiring?: string;
  zone?: string;
  page?: string;
  pageSize?: string;
  sort?: string;
  sortDir?: string;
};

const OPEN_STATUSES: DriverApprovalStatus[] = [
  DriverApprovalStatus.PENDING_KYC,
  DriverApprovalStatus.IN_REVIEW,
  DriverApprovalStatus.ACTION_REQUIRED,
];

@Injectable()
export class KycOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
    private readonly kycDocs: KycDocumentsService,
  ) {}

  async listQueue(query: KycListQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 25));
    const where = this.buildListWhere(query);
    const sortKey = query.sort ?? 'waiting';
    const sortDir = query.sortDir === 'asc' ? 'asc' : 'desc';

    const orderBy: Prisma.DriverProfileOrderByWithRelationInput =
      sortKey === 'name'
        ? { fullName: sortDir }
        : sortKey === 'submitted'
          ? { kycSubmittedAt: sortDir }
          : sortKey === 'updated'
            ? { updatedAt: sortDir }
            : { updatedAt: 'asc' };

    const [rows, total, stats] = await Promise.all([
      this.prisma.driverProfile.findMany({
        where,
        include: this.queueInclude(),
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.driverProfile.count({ where }),
      this.computeStats(),
    ]);

    const phones = rows
      .map((r) => r.user.phoneE164)
      .filter((p): p is string => Boolean(p));
    const plates = rows.flatMap((r) => r.vehicles.map((v) => v.plate.toLowerCase()));
    const dup = await this.duplicateIndex(phones, plates);

    let items = rows.map((d) => this.serializeQueueRow(d, dup));
    if (sortKey === 'waiting') {
      items = items.sort((a, b) =>
        sortDir === 'asc' ? a.waitingMs - b.waitingMs : b.waitingMs - a.waitingMs,
      );
    }

    return {
      items,
      total,
      page,
      pageSize,
      generatedAt: new Date().toISOString(),
      stats,
      tabCounts: stats.tabs,
    };
  }

  async getWorkspace(driverId: string) {
    const driver = await this.loadDriver(driverId);
    const docs = await Promise.all(
      driver.documents.map(async (doc) => {
        let url: string | undefined;
        try {
          url = await this.storage.getSignedGetUrl(doc.storageKey);
        } catch {
          url = undefined;
        }
        return { ...this.kycDocs.serializeDoc(doc), url };
      }),
    );
    const currentDocs = activeDocs(docs);
    const latest = pickLatestByType(currentDocs);
    const progress = progressFromDocs(currentDocs);
    const eligibility = buildEligibility({
      docs: currentDocs,
      approvalStatus: driver.approvalStatus,
      overrideUsed: driver.kycOverrideUsed,
    });
    const primaryVehicle = driver.vehicles[0] ?? null;
    const lastSeen = driver.user.sessions[0]?.lastSeenAt ?? null;
    const checks = buildVerificationChecks({
      docs: currentDocs,
      profileName: driver.fullName,
      vehiclePlate: primaryVehicle?.plate ?? null,
    });
    const signals = await this.buildSignals(driver);
    const notes = driver.reviewNotes.map((n) => ({
      id: n.id,
      body: n.body,
      customerFacing: n.customerFacing,
      createdAt: n.createdAt,
      author: {
        id: n.author.id,
        email: n.author.email,
        name: n.author.email ?? 'Admin',
      },
    }));
    const audit = await this.buildAudit(driver);
    const neighbors = await this.neighbors(driver.id);
    const checklist = this.workspaceChecklist(latest, docs);

    const versionsByGroup: Record<
      string,
      Array<{
        id: string;
        versionNumber: number;
        lifecycleStatus: string;
        status: string;
        createdAt: Date;
        uploadSource: string;
        expiresAt: Date | null;
        docType: string;
      }>
    > = {};
    for (const doc of docs) {
      const gid = doc.documentGroupId;
      if (!versionsByGroup[gid]) versionsByGroup[gid] = [];
      versionsByGroup[gid].push({
        id: doc.id,
        versionNumber: doc.versionNumber,
        lifecycleStatus: doc.lifecycleStatus,
        status: doc.status,
        createdAt: doc.createdAt,
        uploadSource: doc.uploadSource,
        expiresAt: doc.expiresAt,
        docType: doc.docType,
      });
    }
    for (const gid of Object.keys(versionsByGroup)) {
      versionsByGroup[gid].sort((a, b) => b.versionNumber - a.versionNumber);
    }

    const caseHealth = {
      current: currentDocs.length,
      superseded: docs.filter(
        (d) => d.lifecycleStatus === DocumentLifecycleStatus.SUPERSEDED,
      ).length,
      archived: docs.filter(
        (d) => d.lifecycleStatus === DocumentLifecycleStatus.ARCHIVED,
      ).length,
      softDeleted: docs.filter(
        (d) => d.lifecycleStatus === DocumentLifecycleStatus.SOFT_DELETED,
      ).length,
      pendingReview: currentDocs.filter(
        (d) => d.status === DocumentReviewStatus.PENDING,
      ).length,
      approved: currentDocs.filter(
        (d) => d.status === DocumentReviewStatus.APPROVED,
      ).length,
      rejected: currentDocs.filter(
        (d) => d.status === DocumentReviewStatus.REJECTED,
      ).length,
      needsResubmission: currentDocs.filter(
        (d) => d.status === DocumentReviewStatus.NEEDS_RESUBMISSION,
      ).length,
      activeFlags: driver.kycFlags.length,
    };

    const documentTypes = DRIVER_DOC_TYPES.map((t) => ({
      id: t,
      label: DOC_TYPE_LABELS[t],
      required: REQUIRED_DOC_TYPES.includes(t),
      queue: QUEUE_DOC_TYPES.includes(t),
    }));

    const flags = driver.kycFlags.map((f) => ({
      id: f.id,
      flagType: f.flagType,
      reason: f.reason,
      note: f.note,
      createdById: f.createdById,
      createdAt: f.createdAt,
    }));

    return {
      id: driver.id,
      userId: driver.userId,
      shortId: driverShortId(driver.id),
      fullName: driver.fullName,
      legalName: driver.legalName,
      isIndividual: driver.isIndividual,
      approvalStatus: driver.approvalStatus,
      isActivated: driver.isActivated,
      baseLocation: driver.baseLocation,
      dateOfBirth: driver.dateOfBirth,
      addressLine1: driver.addressLine1,
      addressLine2: driver.addressLine2,
      city: driver.city,
      province: driver.province,
      postalCode: driver.postalCode,
      country: driver.country,
      licenceNumber: driver.licenceNumber,
      licenceJurisdiction: driver.licenceJurisdiction,
      licenceIssueDate: driver.licenceIssueDate,
      licenceExpiryDate: driver.licenceExpiryDate,
      createdAt: driver.createdAt,
      updatedAt: driver.updatedAt,
      kycAssignedAt: driver.kycAssignedAt,
      kycSubmittedAt: driver.kycSubmittedAt,
      kycDecidedAt: driver.kycDecidedAt,
      kycDecisionNote: driver.kycDecisionNote,
      kycDecisionReason: driver.kycDecisionReason,
      kycCustomerMessage: driver.kycCustomerMessage,
      kycOverrideUsed: driver.kycOverrideUsed,
      kycOverrideReason: driver.kycOverrideReason,
      kycOverrideAt: driver.kycOverrideAt,
      kycOverrideById: driver.kycOverrideById,
      suspensionReason: driver.suspensionReason,
      suspendedAt: driver.suspendedAt,
      reviewer: driver.kycAssignedTo
        ? {
            id: driver.kycAssignedTo.id,
            email: driver.kycAssignedTo.email,
            name: driver.kycAssignedTo.email ?? 'Admin',
          }
        : null,
      user: {
        id: driver.user.id,
        email: driver.user.email,
        phoneE164: driver.user.phoneE164,
        isSuspended: driver.user.isSuspended,
        createdAt: driver.user.createdAt,
        lastSeenAt: lastSeen,
      },
      vehicles: driver.vehicles,
      operatingZones: driver.operatingZones.map((z) => ({
        id: z.id,
        name: z.name,
        zoneType: z.zoneType,
      })),
      documents: docs,
      latestByType: Object.fromEntries(
        QUEUE_DOC_TYPES.map((t) => [t, latest[t] ?? null]),
      ),
      progress,
      checklist,
      eligibility: {
        identityVerified: latest.selfie?.status === 'APPROVED',
        licenceVerified: latest.license?.status === 'APPROVED',
        vehicleVerified:
          latest.vehicle_registration?.status === 'APPROVED' &&
          latest.vehicle_photo?.status === 'APPROVED',
        requiredDocumentsComplete: progress.readyForKycApproval,
        ...eligibility,
      },
      verificationChecks: checks,
      signals,
      notes,
      audit,
      neighbors,
      flags,
      documentTypes,
      versionsByGroup,
      caseHealth,
      canApproveKyc: canApproveKyc(progress, false),
      canActivate:
        progress.readyForKycApproval &&
        driver.approvalStatus === DriverApprovalStatus.APPROVED,
    };
  }

  async assign(
    actor: AuthUser,
    driverId: string,
    dto: AssignKycDto,
    ip?: string,
  ) {
    this.assertCanReview(actor);
    const driver = await this.requireDriver(driverId);
    this.assertFresh(driver.updatedAt, dto.expectedUpdatedAt);
    const assigneeId = dto.adminId?.trim() || actor.id;
    const previous = driver.approvalStatus;
    const nextStatus = isOpenQueueStatus(driver.approvalStatus)
      ? driver.approvalStatus === DriverApprovalStatus.PENDING_KYC
        ? DriverApprovalStatus.IN_REVIEW
        : driver.approvalStatus
      : driver.approvalStatus;

    const updated = await this.prisma.driverProfile.update({
      where: { id: driverId },
      data: {
        kycAssignedToId: assigneeId,
        kycAssignedAt: new Date(),
        approvalStatus: nextStatus,
      },
    });
    await this.audit(actor.id, 'admin.kyc.assign', 'DriverProfile', driverId, ip, {
      assigneeId,
      previousStatus: previous,
      newStatus: updated.approvalStatus,
    });
    return this.getWorkspace(driverId);
  }

  async bulkAssign(actor: AuthUser, dto: BulkAssignKycDto, ip?: string) {
    this.assertCanReview(actor);
    const ids = [...new Set(dto.driverIds)].slice(0, 50);
    const result = [];
    for (const id of ids) {
      result.push(await this.assign(actor, id, {}, ip));
    }
    return { assigned: result.length, items: result.map((r) => r.id) };
  }

  async reviewDocument(
    actor: AuthUser,
    documentId: string,
    dto: ReviewDocumentDto,
    ip?: string,
  ) {
    this.assertCanReview(actor);
    if (dto.status === 'REJECTED' && !dto.rejectionReason?.trim()) {
      throw new BadRequestException('rejectionReason is required when rejecting');
    }
    const doc = await this.prisma.driverDocument.findUnique({
      where: { id: documentId },
    });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.lifecycleStatus !== DocumentLifecycleStatus.CURRENT) {
      throw new BadRequestException(
        'Historical document versions are read-only. Review the CURRENT version.',
      );
    }
    const driver = await this.requireDriver(doc.driverId);
    this.assertFresh(driver.updatedAt, dto.expectedUpdatedAt);

    const newExpiresAt = dto.expiresAt !== undefined
      ? (dto.expiresAt ? new Date(dto.expiresAt) : null)
      : doc.expiresAt;
    if (dto.status === 'APPROVED' && newExpiresAt && newExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Cannot approve an expired document. Please update the expiry date.');
    }

    const previous = doc.status;
    const updated = await this.prisma.driverDocument.update({
      where: { id: documentId },
      data: {
        status: dto.status as DocumentReviewStatus,
        expiresAt: newExpiresAt,
        rejectionReason:
          dto.status === 'REJECTED' ? dto.rejectionReason!.trim() : null,
        resubmissionReason: null,
        customerMessage: dto.status === 'REJECTED' ? dto.rejectionReason!.trim() : null,
        reviewedAt: new Date(),
        reviewedById: actor.id,
      },
    });

    if (dto.status === 'REJECTED') {
      await this.prisma.driverProfile.update({
        where: { id: doc.driverId },
        data: {
          approvalStatus: isOpenQueueStatus(driver.approvalStatus)
            ? DriverApprovalStatus.ACTION_REQUIRED
            : driver.approvalStatus,
        },
      });
    }

    await this.audit(
      actor.id,
      `admin.document.${dto.status.toLowerCase()}`,
      'DriverDocument',
      documentId,
      ip,
      {
        driverId: doc.driverId,
        docType: doc.docType,
        previousStatus: previous,
        newStatus: updated.status,
        reason: dto.rejectionReason ?? null,
      },
    );
    return this.serializeDoc(updated);
  }

  async requestResubmission(
    actor: AuthUser,
    documentId: string,
    dto: RequestResubmissionDto,
    ip?: string,
  ) {
    this.assertCanReview(actor);
    const doc = await this.prisma.driverDocument.findUnique({
      where: { id: documentId },
    });
    if (!doc) throw new NotFoundException('Document not found');
    const driver = await this.requireDriver(doc.driverId);
    this.assertFresh(driver.updatedAt, dto.expectedUpdatedAt);
    const label = RESUBMISSION_REASON_LABELS[dto.reason as ResubmissionReason];
    const customer =
      dto.customerMessage?.trim() ||
      `Please upload a clearer ${DOC_TYPE_LABELS[doc.docType as DriverDocType] ?? doc.docType}.`;

    await this.prisma.driverDocument.update({
      where: { id: documentId },
      data: {
        status: DocumentReviewStatus.NEEDS_RESUBMISSION,
        rejectionReason: dto.note?.trim() || label,
        resubmissionReason: dto.reason,
        customerMessage: customer,
        reviewedAt: new Date(),
        reviewedById: actor.id,
      },
    });
    await this.prisma.driverProfile.update({
      where: { id: doc.driverId },
      data: { approvalStatus: DriverApprovalStatus.ACTION_REQUIRED },
    });
    await this.audit(
      actor.id,
      'admin.document.request_resubmission',
      'DriverDocument',
      documentId,
      ip,
      {
        driverId: doc.driverId,
        docType: doc.docType,
        reason: dto.reason,
        note: dto.note ?? null,
      },
    );
    await this.notifyDriver(
      driver.userId,
      'Action required on your documents',
      customer,
    );
    return this.getWorkspace(doc.driverId);
  }

  async requestChanges(
    actor: AuthUser,
    driverId: string,
    dto: RequestChangesDto,
    ip?: string,
  ) {
    this.assertCanReview(actor);
    const driver = await this.requireDriver(driverId);
    this.assertFresh(driver.updatedAt, dto.expectedUpdatedAt);
    const ids = dto.documents.map((d) => d.documentId);
    const docs = await this.prisma.driverDocument.findMany({
      where: { id: { in: ids }, driverId },
    });
    if (docs.length !== ids.length) {
      throw new BadRequestException('One or more documents do not belong to this driver');
    }
    const message =
      dto.message?.trim() ||
      'Please update the highlighted verification documents.';

    for (const item of dto.documents) {
      const doc = docs.find((d) => d.id === item.documentId)!;
      const label = RESUBMISSION_REASON_LABELS[item.reason as ResubmissionReason];
      await this.prisma.driverDocument.update({
        where: { id: item.documentId },
        data: {
          status: DocumentReviewStatus.NEEDS_RESUBMISSION,
          rejectionReason: label,
          resubmissionReason: item.reason,
          customerMessage: item.customerMessage?.trim() || message,
          reviewedAt: new Date(),
          reviewedById: actor.id,
        },
      });
    }

    await this.prisma.driverProfile.update({
      where: { id: driverId },
      data: { approvalStatus: DriverApprovalStatus.ACTION_REQUIRED },
    });
    await this.audit(actor.id, 'admin.kyc.request_changes', 'DriverProfile', driverId, ip, {
      documentIds: ids,
      message,
    });
    await this.notifyDriver(driver.userId, 'Action required on your documents', message);
    return this.getWorkspace(driverId);
  }

  async approveKyc(
    actor: AuthUser,
    driverId: string,
    dto: ApproveKycDto,
    ip?: string,
  ) {
    this.assertCanApprove(actor);
    const driver = await this.requireDriver(driverId);
    this.assertFresh(driver.updatedAt, dto.expectedUpdatedAt);
    const docs = await this.prisma.driverDocument.findMany({
      where: { driverId },
      orderBy: { createdAt: 'desc' },
    });
    const progress = progressFromDocs(docs);
    const override = dto.override === true;
    if (override) {
      this.assertCanOverride(actor);
      if (!dto.overrideReason?.trim() || dto.overrideReason.trim().length < 8) {
        throw new BadRequestException('overrideReason is required (min 8 characters)');
      }
    }
    if (!canApproveKyc(progress, override)) {
      throw new BadRequestException({
        message:
          'Required documents + at least 1 vehicle photo must be approved before KYC approval',
        progress,
      });
    }

    // When docs are fully ready, activate in the same step so the driver
    // status updates immediately after admin Approve KYC (no separate click).
    const activateNow = progress.readyForKycApproval;
    const updated = await this.prisma.driverProfile.update({
      where: { id: driverId },
      data: {
        approvalStatus: DriverApprovalStatus.APPROVED,
        ...(activateNow ? { isActivated: true } : {}),
        kycDecidedAt: new Date(),
        kycDecisionNote: dto.note?.trim() || null,
        kycDecisionReason: override ? dto.overrideReason!.trim() : null,
        ...(override
          ? {
              kycOverrideUsed: true,
              kycOverrideReason: dto.overrideReason!.trim(),
              kycOverrideAt: new Date(),
              kycOverrideById: actor.id,
            }
          : {
              kycOverrideUsed: false,
              kycOverrideReason: null,
              kycOverrideAt: null,
              kycOverrideById: null,
            }),
      },
    });
    await this.audit(actor.id, 'admin.kyc.approve', 'DriverProfile', driverId, ip, {
      previousStatus: driver.approvalStatus,
      newStatus: updated.approvalStatus,
      previousActivated: driver.isActivated,
      newActivated: updated.isActivated,
      override,
      reason: dto.overrideReason ?? null,
      note: dto.note ?? null,
    });
    if (override) {
      await this.audit(actor.id, 'KYC_OVERRIDE_USED', 'DriverProfile', driverId, ip, {
        kind: 'kyc_approve',
        reason: dto.overrideReason ?? null,
        note: dto.note ?? null,
      });
    }
    await this.notifyDriver(
      driver.userId,
      activateNow ? 'You are approved and activated' : 'Your KYC was approved',
      activateNow
        ? 'Admin approved your documents. You can now receive transfer requests.'
        : 'Admin approved your KYC. Activation may still be pending.',
    );
    return this.getWorkspace(driverId);
  }

  async rejectKyc(
    actor: AuthUser,
    driverId: string,
    dto: RejectKycDto,
    ip?: string,
  ) {
    this.assertCanReject(actor);
    if (dto.confirmed === false) {
      throw new BadRequestException('Confirmation is required to reject KYC');
    }
    const driver = await this.requireDriver(driverId);
    this.assertFresh(driver.updatedAt, dto.expectedUpdatedAt);
    const reasonCode = dto.reasonCode;
    const reasonLabel = reasonCode
      ? KYC_REJECT_REASON_LABELS[reasonCode as KycRejectReason]
      : dto.reason;

    const updated = await this.prisma.driverProfile.update({
      where: { id: driverId },
      data: {
        isActivated: false,
        approvalStatus: DriverApprovalStatus.REJECTED,
        kycDecidedAt: new Date(),
        kycDecisionReason: reasonLabel,
        kycDecisionNote: dto.internalNote?.trim() || null,
        kycCustomerMessage: dto.customerMessage?.trim() || null,
      },
    });
    await this.audit(actor.id, 'admin.driver.reject_kyc', 'DriverProfile', driverId, ip, {
      previousStatus: driver.approvalStatus,
      newStatus: updated.approvalStatus,
      reason: reasonLabel,
      reasonCode: reasonCode ?? null,
      note: dto.internalNote ?? null,
    });
    if (dto.customerMessage?.trim()) {
      await this.notifyDriver(
        driver.userId,
        'Your driver verification was not approved',
        dto.customerMessage.trim(),
      );
    }
    return {
      id: updated.id,
      approvalStatus: updated.approvalStatus,
      isActivated: updated.isActivated,
      reason: reasonLabel,
    };
  }

  async activate(
    actor: AuthUser,
    driverId: string,
    dto: ActivateDriverDto = {},
    ip?: string,
  ) {
    this.assertCanActivate(actor);
    const driver = await this.requireDriver(driverId);
    this.assertFresh(driver.updatedAt, dto.expectedUpdatedAt);
    const docs = await this.prisma.driverDocument.findMany({
      where: { driverId },
      orderBy: { createdAt: 'desc' },
    });
    const progress = progressFromDocs(docs);
    const override = dto.override === true;
    if (override) {
      this.assertCanOverride(actor);
      if (!dto.overrideReason?.trim() || dto.overrideReason.trim().length < 8) {
        throw new BadRequestException(
          'overrideReason is required (min 8 characters)',
        );
      }
    }
    if (!progress.readyForKycApproval && !override) {
      throw new BadRequestException({
        message:
          'Required documents + at least 1 vehicle photo must be approved',
        progress,
      });
    }
    const data: Prisma.DriverProfileUpdateInput = {
      isActivated: true,
      ...(override
        ? {
            kycOverrideUsed: true,
            kycOverrideReason: dto.overrideReason!.trim(),
            kycOverrideAt: new Date(),
            kycOverrideById: actor.id,
          }
        : {}),
    };
    if (driver.approvalStatus !== DriverApprovalStatus.APPROVED) {
      data.approvalStatus = DriverApprovalStatus.APPROVED;
      data.kycDecidedAt = new Date();
      if (dto.note?.trim()) data.kycDecisionNote = dto.note.trim();
      if (override) data.kycDecisionReason = dto.overrideReason!.trim();
    }
    const updated = await this.prisma.driverProfile.update({
      where: { id: driverId },
      data,
    });
    await this.audit(
      actor.id,
      override ? 'DRIVER_ACTIVATED_WITH_OVERRIDE' : 'admin.driver.activate',
      'DriverProfile',
      driverId,
      ip,
      {
        previousStatus: driver.approvalStatus,
        newStatus: updated.approvalStatus,
        previousActivated: driver.isActivated,
        newActivated: true,
        override,
        reason: dto.overrideReason ?? null,
        note: dto.note ?? null,
      },
    );
    return {
      id: updated.id,
      approvalStatus: updated.approvalStatus,
      isActivated: updated.isActivated,
    };
  }

  async deactivate(actor: AuthUser, driverId: string, ip?: string) {
    this.assertCanActivate(actor);
    const driver = await this.requireDriver(driverId);
    const updated = await this.prisma.driverProfile.update({
      where: { id: driverId },
      data: { isActivated: false },
    });
    await this.audit(actor.id, 'admin.driver.deactivate', 'DriverProfile', driverId, ip, {
      previousActivated: driver.isActivated,
      newActivated: false,
    });
    return {
      id: updated.id,
      approvalStatus: updated.approvalStatus,
      isActivated: updated.isActivated,
    };
  }

  async addNote(actor: AuthUser, driverId: string, dto: AddKycNoteDto, ip?: string) {
    this.assertCanReview(actor);
    await this.requireDriver(driverId);
    const note = await this.prisma.kycReviewNote.create({
      data: {
        driverId,
        authorId: actor.id,
        body: dto.body.trim(),
        customerFacing: dto.customerFacing === true,
      },
      include: { author: { select: { id: true, email: true } } },
    });
    await this.audit(actor.id, 'admin.kyc.note', 'KycReviewNote', note.id, ip, {
      driverId,
      customerFacing: note.customerFacing,
    });
    return {
      id: note.id,
      body: note.body,
      customerFacing: note.customerFacing,
      createdAt: note.createdAt,
      author: {
        id: note.author.id,
        email: note.author.email,
        name: note.author.email ?? 'Admin',
      },
    };
  }

  async listAudit(driverId: string) {
    const driver = await this.loadDriver(driverId);
    return this.buildAudit(driver);
  }

  async afterDriverUpload(driverId: string) {
    const driver = await this.prisma.driverProfile.findUnique({
      where: { id: driverId },
      include: { documents: true },
    });
    if (!driver) return;
    const current = activeDocs(driver.documents);
    const data: Prisma.DriverProfileUpdateInput = {};
    if (!driver.kycSubmittedAt) data.kycSubmittedAt = new Date();
    const hasPendingReview = current.some(
      (d) => d.status === DocumentReviewStatus.PENDING,
    );
    if (driver.approvalStatus === DriverApprovalStatus.REJECTED) {
      data.approvalStatus = DriverApprovalStatus.PENDING_KYC;
      data.kycDecidedAt = null;
    } else if (driver.approvalStatus === DriverApprovalStatus.ACTION_REQUIRED) {
      const needs = current.some(
        (d) => d.status === DocumentReviewStatus.NEEDS_RESUBMISSION,
      );
      if (!needs) {
        data.approvalStatus = driver.kycAssignedToId
          ? DriverApprovalStatus.IN_REVIEW
          : DriverApprovalStatus.PENDING_KYC;
      }
    } else if (
      driver.approvalStatus === DriverApprovalStatus.APPROVED &&
      hasPendingReview
    ) {
      data.approvalStatus = driver.kycAssignedToId
        ? DriverApprovalStatus.IN_REVIEW
        : DriverApprovalStatus.PENDING_KYC;
      data.isActivated = false;
      data.drivingEnabled = false;
      data.kycDecidedAt = null;
    }
    if (Object.keys(data).length) {
      await this.prisma.driverProfile.update({ where: { id: driverId }, data });
    }
  }

  async editApplicant(
    actor: AuthUser,
    driverId: string,
    dto: EditApplicantDto,
    ip?: string,
  ) {
    this.assertCanEdit(actor);
    const driver = await this.loadDriver(driverId);
    this.assertFresh(driver.updatedAt, dto.expectedUpdatedAt);

    const before = {
      fullName: driver.fullName,
      legalName: driver.legalName,
      email: driver.user.email,
      phoneE164: driver.user.phoneE164,
      dateOfBirth: driver.dateOfBirth,
      addressLine1: driver.addressLine1,
      addressLine2: driver.addressLine2,
      city: driver.city,
      province: driver.province,
      postalCode: driver.postalCode,
      country: driver.country,
      baseLocation: driver.baseLocation,
      licenceNumber: driver.licenceNumber,
      licenceJurisdiction: driver.licenceJurisdiction,
      licenceIssueDate: driver.licenceIssueDate,
      licenceExpiryDate: driver.licenceExpiryDate,
    };

    const profileData: Prisma.DriverProfileUpdateInput = {};
    if (dto.fullName !== undefined) profileData.fullName = dto.fullName.trim();
    if (dto.legalName !== undefined) profileData.legalName = dto.legalName.trim();
    if (dto.dateOfBirth !== undefined) {
      profileData.dateOfBirth = dto.dateOfBirth
        ? new Date(dto.dateOfBirth)
        : null;
    }
    if (dto.addressLine1 !== undefined) profileData.addressLine1 = dto.addressLine1;
    if (dto.addressLine2 !== undefined) profileData.addressLine2 = dto.addressLine2;
    if (dto.city !== undefined) profileData.city = dto.city;
    if (dto.province !== undefined) profileData.province = dto.province;
    if (dto.postalCode !== undefined) profileData.postalCode = dto.postalCode;
    if (dto.country !== undefined) profileData.country = dto.country;
    if (dto.baseLocation !== undefined) profileData.baseLocation = dto.baseLocation;
    if (dto.licenceNumber !== undefined) profileData.licenceNumber = dto.licenceNumber;
    if (dto.licenceJurisdiction !== undefined) {
      profileData.licenceJurisdiction = dto.licenceJurisdiction;
    }
    if (dto.licenceIssueDate !== undefined) {
      profileData.licenceIssueDate = dto.licenceIssueDate
        ? new Date(dto.licenceIssueDate)
        : null;
    }
    if (dto.licenceExpiryDate !== undefined) {
      profileData.licenceExpiryDate = dto.licenceExpiryDate
        ? new Date(dto.licenceExpiryDate)
        : null;
    }

    const userData: Prisma.UserUpdateInput = {};
    if (dto.email !== undefined) userData.email = dto.email.trim() || null;
    if (dto.phoneE164 !== undefined) {
      userData.phoneE164 = dto.phoneE164.trim() || null;
    }

    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(userData).length) {
        await tx.user.update({
          where: { id: driver.userId },
          data: userData,
        });
      }
      await tx.driverProfile.update({
        where: { id: driverId },
        data: {
          ...profileData,
          updatedAt: new Date(),
        },
      });
    });

    const afterDriver = await this.loadDriver(driverId);
    const after = {
      fullName: afterDriver.fullName,
      legalName: afterDriver.legalName,
      email: afterDriver.user.email,
      phoneE164: afterDriver.user.phoneE164,
      dateOfBirth: afterDriver.dateOfBirth,
      addressLine1: afterDriver.addressLine1,
      addressLine2: afterDriver.addressLine2,
      city: afterDriver.city,
      province: afterDriver.province,
      postalCode: afterDriver.postalCode,
      country: afterDriver.country,
      baseLocation: afterDriver.baseLocation,
      licenceNumber: afterDriver.licenceNumber,
      licenceJurisdiction: afterDriver.licenceJurisdiction,
      licenceIssueDate: afterDriver.licenceIssueDate,
      licenceExpiryDate: afterDriver.licenceExpiryDate,
    };

    await this.audit(
      actor.id,
      'KYC_APPLICANT_CHANGED',
      'DriverProfile',
      driverId,
      ip,
      { before, after, reason: dto.reason },
    );
    return this.getWorkspace(driverId);
  }

  async reopenKyc(
    actor: AuthUser,
    driverId: string,
    dto: ReopenKycDto,
    ip?: string,
  ) {
    this.assertCanReopen(actor);
    const driver = await this.requireDriver(driverId);
    this.assertFresh(driver.updatedAt, dto.expectedUpdatedAt);
    const previous = {
      approvalStatus: driver.approvalStatus,
      kycDecidedAt: driver.kycDecidedAt,
      kycDecisionNote: driver.kycDecisionNote,
      kycDecisionReason: driver.kycDecisionReason,
      kycCustomerMessage: driver.kycCustomerMessage,
      isActivated: driver.isActivated,
    };
    await this.prisma.driverProfile.update({
      where: { id: driverId },
      data: {
        approvalStatus: DriverApprovalStatus.IN_REVIEW,
        isActivated: false,
        kycDecidedAt: null,
        kycDecisionNote: dto.note?.trim() || null,
        kycDecisionReason: null,
        kycCustomerMessage: null,
        kycAssignedToId: actor.id,
        kycAssignedAt: new Date(),
      },
    });
    await this.audit(actor.id, 'KYC_REOPENED', 'DriverProfile', driverId, ip, {
      before: previous,
      reason: dto.reason,
      note: dto.note ?? null,
      previousStatus: previous.approvalStatus,
      newStatus: DriverApprovalStatus.IN_REVIEW,
    });
    return this.getWorkspace(driverId);
  }

  async resetKycReview(
    actor: AuthUser,
    driverId: string,
    dto: ResetKycDto,
    ip?: string,
  ) {
    this.assertCanOverride(actor);
    const driver = await this.requireDriver(driverId);
    this.assertFresh(driver.updatedAt, dto.expectedUpdatedAt);
    const previous = {
      approvalStatus: driver.approvalStatus,
      kycAssignedToId: driver.kycAssignedToId,
      kycAssignedAt: driver.kycAssignedAt,
      kycDecidedAt: driver.kycDecidedAt,
      kycDecisionNote: driver.kycDecisionNote,
      kycDecisionReason: driver.kycDecisionReason,
      kycCustomerMessage: driver.kycCustomerMessage,
      kycOverrideUsed: driver.kycOverrideUsed,
      isActivated: driver.isActivated,
    };
    await this.prisma.driverProfile.update({
      where: { id: driverId },
      data: {
        approvalStatus: DriverApprovalStatus.PENDING_KYC,
        isActivated: false,
        kycAssignedToId: null,
        kycAssignedAt: null,
        kycReviewStartedAt: null,
        kycDecidedAt: null,
        kycDecisionNote: dto.note?.trim() || null,
        kycDecisionReason: null,
        kycCustomerMessage: null,
        kycOverrideUsed: false,
        kycOverrideReason: null,
        kycOverrideAt: null,
        kycOverrideById: null,
      },
    });
    await this.audit(actor.id, 'KYC_RESET', 'DriverProfile', driverId, ip, {
      before: previous,
      reason: dto.reason,
      note: dto.note ?? null,
      previousStatus: previous.approvalStatus,
      newStatus: DriverApprovalStatus.PENDING_KYC,
    });
    return this.getWorkspace(driverId);
  }

  async addFlag(
    actor: AuthUser,
    driverId: string,
    dto: AddKycFlagDto,
    ip?: string,
  ) {
    this.assertCanReview(actor);
    await this.requireDriver(driverId);
    if (!KYC_FLAG_TYPES.includes(dto.flagType)) {
      throw new BadRequestException('Invalid flagType');
    }
    const flag = await this.prisma.kycFlag.create({
      data: {
        driverId,
        flagType: dto.flagType as KycFlagType,
        reason: dto.reason.trim(),
        note: dto.note?.trim() || null,
        createdById: actor.id,
      },
    });
    await this.audit(actor.id, 'KYC_FLAG_ADDED', 'KycFlag', flag.id, ip, {
      driverId,
      flagType: flag.flagType,
      reason: dto.reason,
      note: dto.note ?? null,
    });
    return {
      id: flag.id,
      flagType: flag.flagType,
      reason: flag.reason,
      note: flag.note,
      createdById: flag.createdById,
      createdAt: flag.createdAt,
    };
  }

  async clearFlag(
    actor: AuthUser,
    driverId: string,
    flagId: string,
    dto: ClearKycFlagDto = {},
    ip?: string,
  ) {
    this.assertCanReview(actor);
    const flag = await this.prisma.kycFlag.findFirst({
      where: { id: flagId, driverId },
    });
    if (!flag) throw new NotFoundException('Flag not found');
    if (flag.clearedAt) {
      throw new BadRequestException('Flag already cleared');
    }
    const updated = await this.prisma.kycFlag.update({
      where: { id: flagId },
      data: {
        clearedAt: new Date(),
        clearedById: actor.id,
      },
    });
    await this.audit(actor.id, 'KYC_FLAG_CLEARED', 'KycFlag', flagId, ip, {
      driverId,
      flagType: flag.flagType,
      reason: dto.reason ?? null,
    });
    return {
      id: updated.id,
      flagType: updated.flagType,
      clearedAt: updated.clearedAt,
      clearedById: updated.clearedById,
    };
  }

  async suspendDriver(
    actor: AuthUser,
    driverId: string,
    dto: SuspendDriverDto,
    ip?: string,
  ) {
    this.assertCanSuspend(actor);
    const driver = await this.requireDriver(driverId);
    this.assertFresh(driver.updatedAt, dto.expectedUpdatedAt);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: driver.userId },
        data: { isSuspended: true },
      });
      return tx.driverProfile.update({
        where: { id: driverId },
        data: {
          approvalStatus: DriverApprovalStatus.SUSPENDED,
          isActivated: false,
          suspensionReason: dto.reason.trim(),
          suspendedAt: new Date(),
        },
      });
    });
    await this.audit(actor.id, 'DRIVER_SUSPENDED', 'DriverProfile', driverId, ip, {
      previousStatus: driver.approvalStatus,
      newStatus: updated.approvalStatus,
      reason: dto.reason,
      note: dto.note ?? null,
    });
    return this.getWorkspace(driverId);
  }

  async unsuspendDriver(
    actor: AuthUser,
    driverId: string,
    dto: SuspendDriverDto,
    ip?: string,
  ) {
    this.assertCanSuspend(actor);
    const driver = await this.requireDriver(driverId);
    this.assertFresh(driver.updatedAt, dto.expectedUpdatedAt);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: driver.userId },
        data: { isSuspended: false },
      });
      return tx.driverProfile.update({
        where: { id: driverId },
        data: {
          approvalStatus: DriverApprovalStatus.PENDING_KYC,
          suspensionReason: null,
          suspendedAt: null,
        },
      });
    });
    await this.audit(actor.id, 'DRIVER_UNSUSPENDED', 'DriverProfile', driverId, ip, {
      previousStatus: driver.approvalStatus,
      newStatus: updated.approvalStatus,
      reason: dto.reason,
      note: dto.note ?? null,
    });
    return this.getWorkspace(driverId);
  }

  async exportSummary(driverId: string) {
    const workspace = await this.getWorkspace(driverId);
    return {
      exportedAt: new Date().toISOString(),
      driverId: workspace.id,
      shortId: workspace.shortId,
      fullName: workspace.fullName,
      legalName: workspace.legalName,
      approvalStatus: workspace.approvalStatus,
      isActivated: workspace.isActivated,
      user: workspace.user,
      identity: {
        dateOfBirth: workspace.dateOfBirth,
        addressLine1: workspace.addressLine1,
        addressLine2: workspace.addressLine2,
        city: workspace.city,
        province: workspace.province,
        postalCode: workspace.postalCode,
        country: workspace.country,
        licenceNumber: workspace.licenceNumber,
        licenceJurisdiction: workspace.licenceJurisdiction,
        licenceIssueDate: workspace.licenceIssueDate,
        licenceExpiryDate: workspace.licenceExpiryDate,
      },
      progress: workspace.progress,
      eligibility: workspace.eligibility,
      checklist: workspace.checklist,
      caseHealth: workspace.caseHealth,
      flags: workspace.flags,
      documents: workspace.documents.map((d) => ({
        id: d.id,
        docType: d.docType,
        label: d.label,
        status: d.status,
        lifecycleStatus: d.lifecycleStatus,
        versionNumber: d.versionNumber,
        documentGroupId: d.documentGroupId,
        uploadSource: d.uploadSource,
        expiresAt: d.expiresAt,
        documentNumber: d.documentNumber,
        createdAt: d.createdAt,
        reviewedAt: d.reviewedAt,
      })),
      versionsByGroup: workspace.versionsByGroup,
      vehicles: workspace.vehicles,
      kycOverrideUsed: workspace.kycOverrideUsed,
      kycOverrideReason: workspace.kycOverrideReason,
      suspensionReason: workspace.suspensionReason,
      suspendedAt: workspace.suspendedAt,
      decidedAt: workspace.kycDecidedAt,
      decisionReason: workspace.kycDecisionReason,
    };
  }

  // --- internals ---

  private queueInclude() {
    return {
      user: {
        select: {
          id: true,
          email: true,
          phoneE164: true,
          isSuspended: true,
        },
      },
      documents: { orderBy: { createdAt: 'desc' as const } },
      vehicles: true,
      operatingZones: { select: { id: true, name: true } },
      kycAssignedTo: { select: { id: true, email: true } },
    };
  }

  private buildListWhere(query: KycListQuery): Prisma.DriverProfileWhereInput {
    const AND: Prisma.DriverProfileWhereInput[] = [];
    const tabStatuses = approvalStatusesForTab(query.tab);
    if (query.tab && query.tab !== 'all' && tabStatuses) {
      AND.push({
        approvalStatus: { in: tabStatuses as DriverApprovalStatus[] },
      });
    } else if (
      query.status &&
      Object.values(DriverApprovalStatus).includes(query.status as DriverApprovalStatus)
    ) {
      AND.push({ approvalStatus: query.status as DriverApprovalStatus });
    }

    const range = this.dateRange(query);
    if (range) {
      AND.push({
        OR: [
          { kycSubmittedAt: { gte: range.from, lte: range.to } },
          { kycSubmittedAt: null, createdAt: { gte: range.from, lte: range.to } },
        ],
      });
    }

    if (query.accountStatus === 'active') {
      AND.push({ isActivated: true, user: { isSuspended: false } });
    } else if (query.accountStatus === 'inactive') {
      AND.push({ isActivated: false, user: { isSuspended: false } });
    } else if (query.accountStatus === 'suspended') {
      AND.push({
        OR: [
          { user: { isSuspended: true } },
          { approvalStatus: DriverApprovalStatus.SUSPENDED },
        ],
      });
    }

    if (query.vehicleStatus === 'registered') {
      AND.push({ vehicles: { some: {} } });
    } else if (query.vehicleStatus === 'none') {
      AND.push({ vehicles: { none: {} } });
    }

    if (
      query.documentStatus &&
      Object.values(DocumentReviewStatus).includes(
        query.documentStatus as DocumentReviewStatus,
      )
    ) {
      AND.push({
        documents: { some: { status: query.documentStatus as DocumentReviewStatus } },
      });
    }

    if (query.expiring) {
      const now = new Date();
      if (query.expiring === 'expired') {
        AND.push({ documents: { some: { expiresAt: { lt: now } } } });
      } else {
        const days = Number(query.expiring);
        if (days > 0) {
          const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
          AND.push({
            documents: { some: { expiresAt: { gte: now, lte: until } } },
          });
        }
      }
    }

    if (query.zone?.trim()) {
      AND.push({
        operatingZones: {
          some: { name: { contains: query.zone.trim(), mode: 'insensitive' } },
        },
      });
    }

    const q = query.q?.trim();
    if (q) {
      AND.push({
        OR: [
          { fullName: { contains: q, mode: 'insensitive' } },
          { id: { contains: q, mode: 'insensitive' } },
          { user: { email: { contains: q, mode: 'insensitive' } } },
          { user: { phoneE164: { contains: q, mode: 'insensitive' } } },
          { vehicles: { some: { plate: { contains: q, mode: 'insensitive' } } } },
        ],
      });
    }

    return AND.length ? { AND } : {};
  }

  private dateRange(query: KycListQuery): { from: Date; to: Date } | null {
    const now = new Date();
    const to = now;
    if (query.datePreset === 'today') {
      const from = new Date(now);
      from.setHours(0, 0, 0, 0);
      return { from, to };
    }
    if (query.datePreset === '7d') {
      return { from: new Date(now.getTime() - 7 * 86400000), to };
    }
    if (query.datePreset === '30d') {
      return { from: new Date(now.getTime() - 30 * 86400000), to };
    }
    if (query.dateFrom || query.dateTo) {
      const from = query.dateFrom ? new Date(query.dateFrom) : new Date(0);
      const end = query.dateTo ? new Date(query.dateTo) : now;
      if (!Number.isNaN(from.getTime()) && !Number.isNaN(end.getTime())) {
        return { from, to: end };
      }
    }
    return null;
  }

  private async computeStats() {
    const now = new Date();
    const startToday = new Date(now);
    startToday.setHours(0, 0, 0, 0);
    const startYesterday = new Date(startToday.getTime() - 86400000);
    const start7 = new Date(now.getTime() - 7 * 86400000);
    const start14 = new Date(now.getTime() - 14 * 86400000);

    const [
      awaiting,
      inReview,
      actionRequired,
      approved,
      rejected,
      approvedToday,
      rejectedToday,
      awaitingYesterday,
      decided7,
      decidedPrev7,
    ] = await Promise.all([
      this.prisma.driverProfile.count({
        where: { approvalStatus: DriverApprovalStatus.PENDING_KYC },
      }),
      this.prisma.driverProfile.count({
        where: { approvalStatus: DriverApprovalStatus.IN_REVIEW },
      }),
      this.prisma.driverProfile.count({
        where: { approvalStatus: DriverApprovalStatus.ACTION_REQUIRED },
      }),
      this.prisma.driverProfile.count({
        where: { approvalStatus: DriverApprovalStatus.APPROVED },
      }),
      this.prisma.driverProfile.count({
        where: { approvalStatus: DriverApprovalStatus.REJECTED },
      }),
      this.prisma.driverProfile.count({
        where: {
          approvalStatus: DriverApprovalStatus.APPROVED,
          kycDecidedAt: { gte: startToday },
        },
      }),
      this.prisma.driverProfile.count({
        where: {
          approvalStatus: DriverApprovalStatus.REJECTED,
          kycDecidedAt: { gte: startToday },
        },
      }),
      this.prisma.driverProfile.count({
        where: {
          approvalStatus: DriverApprovalStatus.PENDING_KYC,
          updatedAt: { lt: startToday, gte: startYesterday },
        },
      }),
      this.prisma.driverProfile.findMany({
        where: {
          kycDecidedAt: { gte: start7 },
          kycSubmittedAt: { not: null },
        },
        select: { kycSubmittedAt: true, kycDecidedAt: true },
      }),
      this.prisma.driverProfile.findMany({
        where: {
          kycDecidedAt: { gte: start14, lt: start7 },
          kycSubmittedAt: { not: null },
        },
        select: { kycSubmittedAt: true, kycDecidedAt: true },
      }),
    ]);

    const avgCurrent = averageMs(
      decided7
        .filter((d) => d.kycSubmittedAt && d.kycDecidedAt)
        .map(
          (d) => d.kycDecidedAt!.getTime() - d.kycSubmittedAt!.getTime(),
        ),
    );
    const avgPrev = averageMs(
      decidedPrev7
        .filter((d) => d.kycSubmittedAt && d.kycDecidedAt)
        .map(
          (d) => d.kycDecidedAt!.getTime() - d.kycSubmittedAt!.getTime(),
        ),
    );

    return {
      awaiting,
      inReview,
      actionRequired,
      approvedToday,
      rejectedToday,
      avgReviewMs: avgCurrent,
      avgReviewLabel: avgCurrent != null ? formatDuration(avgCurrent) : null,
      avgReviewChangePct: percentChange(avgCurrent, avgPrev),
      awaitingDelta: awaiting - awaitingYesterday,
      tabs: {
        all: awaiting + inReview + actionRequired + approved + rejected,
        awaiting,
        in_review: inReview,
        action_required: actionRequired,
        approved,
        rejected,
      },
    };
  }

  private serializeQueueRow(
    d: Awaited<ReturnType<KycOpsService['loadDriverForQueue']>>,
    dup: { phones: Set<string>; plates: Set<string> },
  ) {
    const latest = pickLatestByType(d.documents);
    const progress = progressFromDocs(d.documents);
    const submittedAt = d.kycSubmittedAt ?? d.createdAt;
    const pendingAt = d.documents.find(
      (doc) =>
        doc.status === DocumentReviewStatus.PENDING ||
        doc.status === DocumentReviewStatus.NEEDS_RESUBMISSION,
    )?.createdAt;
    const waitingMs = Date.now() - (pendingAt ?? submittedAt).getTime();
    const flags: Array<{ id: string; label: string }> = [];
    if (d.user.phoneE164 && dup.phones.has(d.user.phoneE164)) {
      flags.push({ id: 'duplicate_phone', label: 'Duplicate phone' });
    }
    const plate = d.vehicles[0]?.plate;
    if (plate && dup.plates.has(plate.toLowerCase())) {
      flags.push({ id: 'duplicate_plate', label: 'Duplicate plate' });
    }
    const expired = d.documents.find(
      (doc) => doc.expiresAt && doc.expiresAt.getTime() < Date.now(),
    );
    if (expired) flags.push({ id: 'expired', label: 'Expired' });
    else {
      const expiring = d.documents.find((doc) => expiryBand(doc.expiresAt) != null);
      if (expiring) flags.push({ id: 'expiring', label: expiryLabel(expiring.expiresAt) ?? 'Expiring' });
    }
    if (d.approvalStatus === DriverApprovalStatus.ACTION_REQUIRED) {
      flags.push({ id: 'manual_review', label: 'Manual review' });
    }

    const docs = Object.fromEntries(
      QUEUE_DOC_TYPES.map((t) => [
        t,
        {
          status: latest[t]?.status ?? null,
          indicator: docIndicator(latest[t]?.status),
          expiresAt: latest[t]?.expiresAt ?? null,
        },
      ]),
    );

    return {
      id: d.id,
      userId: d.userId,
      shortId: driverShortId(d.id),
      fullName: d.fullName,
      approvalStatus: d.approvalStatus,
      isActivated: d.isActivated,
      isSuspended: d.user.isSuspended,
      email: d.user.email,
      phone: d.user.phoneE164,
      progress,
      docs,
      submittedAt,
      waitingMs,
      waitingLabel: formatDuration(waitingMs),
      waitingSla: waitingSla(waitingMs),
      accountStatus: d.user.isSuspended
        ? 'suspended'
        : d.isActivated
          ? 'active'
          : 'inactive',
      flags,
      reviewer: d.kycAssignedTo
        ? {
            id: d.kycAssignedTo.id,
            email: d.kycAssignedTo.email,
            name: d.kycAssignedTo.email ?? 'Admin',
          }
        : null,
      vehicle: d.vehicles[0]
        ? {
            id: d.vehicles[0].id,
            name: d.vehicles[0].name,
            plate: d.vehicles[0].plate,
            vehicleClass: d.vehicles[0].vehicleClass,
          }
        : null,
      zones: d.operatingZones.map((z) => z.name),
      updatedAt: d.updatedAt,
    };
  }

  private async loadDriverForQueue(id: string) {
    const row = await this.prisma.driverProfile.findUnique({
      where: { id },
      include: this.queueInclude(),
    });
    if (!row) throw new NotFoundException('Driver not found');
    return row;
  }

  private async loadDriver(driverId: string) {
    const driver = await this.prisma.driverProfile.findUnique({
      where: { id: driverId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            phoneE164: true,
            isSuspended: true,
            createdAt: true,
            sessions: {
              where: { revokedAt: null },
              orderBy: { lastSeenAt: 'desc' },
              take: 1,
              select: { lastSeenAt: true },
            },
          },
        },
        documents: { orderBy: [{ versionNumber: 'desc' }, { createdAt: 'desc' }] },
        vehicles: true,
        operatingZones: true,
        kycAssignedTo: { select: { id: true, email: true } },
        reviewNotes: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { author: { select: { id: true, email: true } } },
        },
        kycFlags: {
          where: { clearedAt: null },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!driver) throw new NotFoundException('Driver not found');
    return driver;
  }

  private async requireDriver(driverId: string) {
    const driver = await this.prisma.driverProfile.findUnique({
      where: { id: driverId },
    });
    if (!driver) throw new NotFoundException('Driver not found');
    return driver;
  }

  private async duplicateIndex(phones: string[], plates: string[]) {
    const phoneDup = new Set<string>();
    const plateDup = new Set<string>();
    if (phones.length) {
      const users = await this.prisma.user.findMany({
        where: { phoneE164: { in: phones }, role: UserRole.DRIVER },
        select: { phoneE164: true },
      });
      const counts = new Map<string, number>();
      for (const u of users) {
        if (!u.phoneE164) continue;
        counts.set(u.phoneE164, (counts.get(u.phoneE164) ?? 0) + 1);
      }
      for (const [p, n] of counts) if (n > 1) phoneDup.add(p);
    }
    if (plates.length) {
      const vehicles = await this.prisma.vehicle.findMany({
        where: {
          OR: [...new Set(plates)].map((p) => ({
            plate: { equals: p, mode: 'insensitive' as const },
          })),
        },
        select: { plate: true },
      });
      const counts = new Map<string, number>();
      for (const v of vehicles) {
        const key = v.plate.toLowerCase();
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      for (const [p, n] of counts) if (n > 1) plateDup.add(p);
    }
    return { phones: phoneDup, plates: plateDup };
  }

  private async buildSignals(
    driver: Awaited<ReturnType<KycOpsService['loadDriver']>>,
  ): Promise<Array<{ id: string; label: string; severity: 'info' | 'warn' | 'high'; detail?: string }>> {
    const signals: Array<{
      id: string;
      label: string;
      severity: 'info' | 'warn' | 'high';
      detail?: string;
    }> = [];
    if (driver.user.phoneE164) {
      const others = await this.prisma.user.count({
        where: {
          phoneE164: driver.user.phoneE164,
          role: UserRole.DRIVER,
          id: { not: driver.userId },
        },
      });
      if (others > 0) {
        signals.push({
          id: 'duplicate_phone',
          label: 'Same phone used previously',
          severity: 'high',
          detail: `${others} other driver account${others === 1 ? '' : 's'}`,
        });
      }
    }
    const plate = driver.vehicles[0]?.plate;
    if (plate) {
      const others = await this.prisma.vehicle.count({
        where: {
          plate: { equals: plate, mode: 'insensitive' },
          driverId: { not: driver.id },
        },
      });
      if (others > 0) {
        signals.push({
          id: 'duplicate_plate',
          label: 'Same plate registered elsewhere',
          severity: 'high',
          detail: plate,
        });
      }
    }
    const rejects = await this.prisma.auditLog.count({
      where: { action: 'admin.driver.reject_kyc', resourceId: driver.id },
    });
    if (rejects > 0) {
      signals.push({
        id: 'repeated_rejection',
        label: 'Repeated KYC rejection',
        severity: 'warn',
        detail: `${rejects} previous rejection${rejects === 1 ? '' : 's'}`,
      });
    }
    for (const doc of activeDocs(driver.documents)) {
      const band = expiryBand(doc.expiresAt);
      if (band === 'expired') {
        signals.push({
          id: `expired_${doc.docType}`,
          label: `${DOC_TYPE_LABELS[doc.docType as DriverDocType] ?? doc.docType} expired`,
          severity: 'high',
          detail: expiryLabel(doc.expiresAt) ?? undefined,
        });
      } else if (band) {
        signals.push({
          id: `expiring_${doc.docType}`,
          label: `${DOC_TYPE_LABELS[doc.docType as DriverDocType] ?? doc.docType} expiring`,
          severity: 'warn',
          detail: expiryLabel(doc.expiresAt) ?? undefined,
        });
      }
    }
    return signals;
  }

  private async buildAudit(driver: Awaited<ReturnType<KycOpsService['loadDriver']>>) {
    const docIds = driver.documents.map((d) => d.id);
    const logs = await this.prisma.auditLog.findMany({
      where: {
        OR: [
          { resource: 'DriverProfile', resourceId: driver.id },
          { resource: 'KycReviewNote', resourceId: { in: driver.reviewNotes.map((n) => n.id) } },
          ...(docIds.length
            ? [{ resource: 'DriverDocument', resourceId: { in: docIds } }]
            : []),
          {
            action: { contains: 'impersonat' },
            resourceId: driver.userId,
          },
        ],
      },
      include: { actor: { select: { id: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const events = logs.map((l) => ({
      id: l.id,
      at: l.createdAt,
      action: l.action,
      label: this.auditLabel(l.action, l.meta),
      actor: l.actor?.email ?? (l.actorId ? 'Admin' : 'System'),
      actorId: l.actorId,
      resource: l.resource,
      resourceId: l.resourceId,
      reason: l.reason,
      meta: l.meta,
    }));

    for (const doc of driver.documents) {
      events.push({
        id: `upload-${doc.id}`,
        at: doc.createdAt,
        action: 'driver.document.upload',
        label: `${DOC_TYPE_LABELS[doc.docType as DriverDocType] ?? doc.docType} uploaded`,
        actor: 'Driver',
        actorId: driver.userId,
        resource: 'DriverDocument',
        resourceId: doc.id,
        reason: null,
        meta: { docType: doc.docType },
      });
    }

    events.sort((a, b) => b.at.getTime() - a.at.getTime());
    const seen = new Set<string>();
    return events.filter((e) => {
      const key = `${e.action}:${e.resourceId}:${e.at.toISOString().slice(0, 16)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private auditLabel(action: string, meta: Prisma.JsonValue): string {
    const m = meta && typeof meta === 'object' && !Array.isArray(meta)
      ? (meta as Record<string, unknown>)
      : {};
    switch (action) {
      case 'admin.document.approved':
        return `${this.docMetaLabel(m)} approved`;
      case 'admin.document.rejected':
        return `${this.docMetaLabel(m)} rejected`;
      case 'admin.document.request_resubmission':
        return `${this.docMetaLabel(m)} resubmission requested`;
      case 'admin.kyc.approve':
        return 'KYC approved';
      case 'admin.driver.reject_kyc':
        return 'KYC rejected';
      case 'admin.kyc.request_changes':
        return 'KYC changes requested';
      case 'admin.kyc.assign':
        return 'Reviewer assigned';
      case 'admin.driver.activate':
        return 'Account activated';
      case 'admin.driver.deactivate':
        return 'Account deactivated';
      case 'admin.kyc.note':
        return 'Internal note added';
      case 'driver.document.upload':
        return 'Document uploaded';
      case 'KYC_APPLICANT_CHANGED':
        return 'Applicant details changed';
      case 'KYC_REOPENED':
        return 'KYC reopened';
      case 'KYC_RESET':
        return 'KYC review reset';
      case 'KYC_OVERRIDE_USED':
        return 'Manual override used';
      case 'DRIVER_ACTIVATED_WITH_OVERRIDE':
        return 'Activated with override';
      case 'DRIVER_SUSPENDED':
        return 'Driver suspended';
      case 'DRIVER_UNSUSPENDED':
        return 'Driver unsuspended';
      case 'KYC_FLAG_ADDED':
        return 'KYC flag added';
      case 'KYC_FLAG_CLEARED':
        return 'KYC flag cleared';
      case 'KYC_DOCUMENT_UPLOADED':
        return 'Document uploaded by admin';
      case 'KYC_DOCUMENT_VERSION_CREATED':
        return 'Document version created';
      case 'KYC_DOCUMENT_REPLACED':
        return 'Document replaced';
      case 'KYC_METADATA_CHANGED':
        return 'Document metadata changed';
      case 'KYC_DOCUMENT_ARCHIVED':
        return 'Document archived';
      case 'KYC_DOCUMENT_RESTORED':
        return 'Document restored';
      case 'KYC_DOCUMENT_SOFT_DELETED':
        return 'Document soft-deleted';
      default:
        if (action.includes('impersonat')) return 'Admin logged in as driver';
        return action.replace(/[._]/g, ' ');
    }
  }

  private docMetaLabel(m: Record<string, unknown>): string {
    const t = typeof m.docType === 'string' ? m.docType : '';
    return DOC_TYPE_LABELS[t as DriverDocType] ?? t ?? 'Document';
  }

  private workspaceChecklist(
    latest: Record<
      string,
      | {
          id?: string;
          status: string;
          documentGroupId?: string;
          uploadSource?: string | null;
          expiresAt?: Date | null;
          expiryLabel?: string | null;
          lifecycleStatus?: string | null;
        }
      | undefined
    >,
    allDocs: Array<{ documentGroupId: string }>,
  ) {
    return QUEUE_DOC_TYPES.map((t) => {
      const doc = latest[t];
      const versionCount = doc?.documentGroupId
        ? allDocs.filter((d) => d.documentGroupId === doc.documentGroupId).length
        : 0;
      return {
        docType: t,
        label: DOC_TYPE_LABELS[t],
        status: doc?.status ?? 'MISSING',
        indicator: docIndicator(doc?.status),
        documentId: doc?.id ?? null,
        versionCount,
        uploadSource: doc?.uploadSource ?? null,
        expiryLabel: doc?.expiryLabel ?? expiryLabel(doc?.expiresAt ?? null),
        lifecycleStatus: doc?.lifecycleStatus ?? null,
      };
    });
  }

  private async neighbors(driverId: string) {
    const open = await this.prisma.driverProfile.findMany({
      where: { approvalStatus: { in: OPEN_STATUSES } },
      orderBy: [{ kycSubmittedAt: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
      take: 200,
    });
    const idx = open.findIndex((d) => d.id === driverId);
    return {
      prevId: idx > 0 ? open[idx - 1].id : null,
      nextId: idx >= 0 && idx < open.length - 1 ? open[idx + 1].id : null,
    };
  }

  serializeDoc(doc: Parameters<KycDocumentsService['serializeDoc']>[0]) {
    return this.kycDocs.serializeDoc(doc);
  }

  /**
   * Authenticated binary stream for admin KYC viewer.
   * Never returns MinIO keys, signed URLs, or redirects.
   */
  async getDocumentContent(
    actor: AuthUser,
    driverId: string,
    documentId: string,
    ip?: string,
  ) {
    this.assertPerm(actor, 'kyc.document.view', 'kyc.view');
    const doc = await this.prisma.driverDocument.findFirst({
      where: { id: documentId, driverId },
    });
    if (!doc) throw new NotFoundException('Document not found');
    if (!doc.storageKey?.trim()) {
      throw new GoneException('Document storage key missing');
    }
    let object: { body: Buffer; contentType: string };
    try {
      object = await this.storage.getObjectBytes(doc.storageKey);
    } catch {
      throw new GoneException('Document object no longer available');
    }
    await this.audit(
      actor.id,
      'admin.kyc.document.content',
      'DriverDocument',
      documentId,
      ip,
      { driverId, documentId, action: 'content_view' },
    );
    return {
      body: object.body,
      contentType: doc.mimeType || object.contentType || 'application/octet-stream',
      filename: doc.originalFilename ?? `${doc.docType}`,
    };
  }

  private assertFresh(updatedAt: Date, expected?: string) {
    if (!expected) return;
    const exp = new Date(expected).getTime();
    if (Number.isNaN(exp)) {
      throw new BadRequestException('Invalid expectedUpdatedAt');
    }
    if (Math.abs(updatedAt.getTime() - exp) > 2000) {
      throw new ConflictException({
        message:
          'This application was updated by another reviewer. Reload and try again.',
        currentUpdatedAt: updatedAt.toISOString(),
      });
    }
  }

  private hasPerm(user: AuthUser, perm: string) {
    if (user.role === UserRole.SUPER_ADMIN) return true;
    const perms = user.permissions ?? [];
    return perms.includes('*') || perms.includes(perm);
  }

  private assertPerm(user: AuthUser, ...need: string[]) {
    if (need.some((p) => this.hasPerm(user, p))) return;
    throw new ForbiddenException(`Missing permission (${need.join(' or ')})`);
  }

  private assertCanReview(user: AuthUser) {
    if (this.hasPerm(user, 'kyc.review') || this.hasPerm(user, 'kyc.approve')) return;
    throw new ForbiddenException('Missing permission kyc.review');
  }

  private assertCanEdit(user: AuthUser) {
    if (
      this.hasPerm(user, 'kyc.edit') ||
      this.hasPerm(user, 'kyc.approve')
    ) {
      return;
    }
    throw new ForbiddenException('Missing permission kyc.edit');
  }

  private assertCanReopen(user: AuthUser) {
    if (
      this.hasPerm(user, 'kyc.reopen') ||
      this.hasPerm(user, 'kyc.override') ||
      this.hasPerm(user, 'kyc.approve')
    ) {
      return;
    }
    throw new ForbiddenException('Missing permission kyc.reopen');
  }

  private assertCanSuspend(user: AuthUser) {
    if (
      this.hasPerm(user, 'drivers.suspend') ||
      this.hasPerm(user, 'users.suspend') ||
      this.hasPerm(user, 'kyc.override')
    ) {
      return;
    }
    throw new ForbiddenException('Missing permission drivers.suspend');
  }

  private assertCanApprove(user: AuthUser) {
    if (this.hasPerm(user, 'kyc.approve')) return;
    throw new ForbiddenException('Missing permission kyc.approve');
  }

  private assertCanReject(user: AuthUser) {
    if (this.hasPerm(user, 'kyc.reject') || this.hasPerm(user, 'kyc.approve')) return;
    throw new ForbiddenException('Missing permission kyc.reject');
  }

  private assertCanOverride(user: AuthUser) {
    if (this.hasPerm(user, 'kyc.override')) return;
    throw new ForbiddenException('Missing permission kyc.override');
  }

  private assertCanActivate(user: AuthUser) {
    if (this.hasPerm(user, 'drivers.activate') || this.hasPerm(user, 'kyc.approve')) {
      return;
    }
    throw new ForbiddenException('Missing permission drivers.activate');
  }

  private async notifyDriver(userId: string, title: string, body: string) {
    try {
      await this.notifications.sendToUser({
        userId,
        title,
        body,
        templateKey: 'kyc_action_required',
        data: { type: 'kyc' },
      });
    } catch {
      // notification delivery is non-fatal
    }
  }

  private async audit(
    actorId: string | undefined,
    action: string,
    resource?: string,
    resourceId?: string,
    ip?: string,
    meta?: Record<string, unknown>,
  ) {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          action,
          resource,
          resourceId,
          ip,
          reason: typeof meta?.reason === 'string' ? meta.reason : undefined,
          before:
            meta?.before !== undefined
              ? (meta.before as Prisma.InputJsonValue)
              : meta?.previousStatus
                ? ({ status: meta.previousStatus } as Prisma.InputJsonValue)
                : undefined,
          after:
            meta?.after !== undefined
              ? (meta.after as Prisma.InputJsonValue)
              : meta?.newStatus
                ? ({ status: meta.newStatus } as Prisma.InputJsonValue)
                : undefined,
          meta: (meta ?? {}) as Prisma.InputJsonValue,
        },
      });
    } catch {
      // non-fatal
    }
  }
}
