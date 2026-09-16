import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DocumentLifecycleStatus,
  DocumentReviewStatus,
  DriverApprovalStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import {
  ALLOWED_MIME,
  DOC_TYPE_LABELS,
  DOCUMENT_UPLOAD_SOURCES,
  DRIVER_DOC_TYPES,
  MAX_UPLOAD_BYTES,
  MAX_VEHICLE_PHOTOS,
  SINGLE_ACTIVE_DOC_TYPES,
  type DocumentUploadSource,
  type DriverDocType,
} from './documents.constants';
import { expiryLabel } from './kyc-ops.logic';
import type {
  AdminUploadDocumentDto,
  DocumentActionDto,
  EditDocumentMetadataDto,
  OverrideDocumentDto,
  RestoreDocumentDto,
} from './dto/kyc-enterprise.dto';

// file-type@16 CommonJS
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FileType = require('file-type') as {
  fromBuffer: (
    buf: Buffer,
  ) => Promise<{ ext: string; mime: string } | undefined>;
};

export type StoredUpload = {
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  originalFilename: string | null;
  ext: string;
};

@Injectable()
export class KycDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async validateAndStore(params: {
    driverId: string;
    docType: string;
    file: Express.Multer.File;
  }): Promise<StoredUpload> {
    const { file, driverId, docType } = params;
    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required');
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException(
        `File too large (max ${MAX_UPLOAD_BYTES} bytes)`,
      );
    }
    const detected = await FileType.fromBuffer(file.buffer);
    const normalizeMime = (m?: string | null) => {
      if (!m) return undefined;
      const lower = m.toLowerCase().trim();
      if (lower === 'image/jpg') return 'image/jpeg';
      return lower;
    };
    const detectedMime = normalizeMime(detected?.mime);
    const clientMime = normalizeMime(file.mimetype);

    // Magic bytes are authoritative when present. Accept any allowed detected type
    // even if the browser/extension claimed a different (also image) MIME.
    const mime = detectedMime ?? clientMime;
    if (!mime || !ALLOWED_MIME.has(mime)) {
      throw new BadRequestException(
        `Unsupported file type (detected=${detectedMime ?? 'unknown'}, client=${clientMime ?? 'unknown'})`,
      );
    }
    // Spoofing: client claims an allowed type, but bytes are a disallowed type.
    if (clientMime && ALLOWED_MIME.has(clientMime) && detectedMime && !ALLOWED_MIME.has(detectedMime)) {
      throw new BadRequestException(
        `MIME type mismatch (magic-byte check): claimed ${clientMime}, detected ${detectedMime}`,
      );
    }
    const ext =
      detected?.ext ??
      (mime === 'application/pdf'
        ? 'pdf'
        : mime === 'image/png'
          ? 'png'
          : mime === 'image/webp'
            ? 'webp'
            : 'jpg');
    const checksumSha256 = createHash('sha256').update(file.buffer).digest('hex');
    const key = `drivers/${driverId}/${docType}/${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`;
    await this.storage.putObject({
      key,
      body: file.buffer,
      contentType: mime,
    });
    return {
      storageKey: key,
      mimeType: mime,
      sizeBytes: file.size,
      checksumSha256,
      originalFilename: file.originalname?.slice(0, 255) || null,
      ext,
    };
  }

  /**
   * Create a new document version atomically.
   * Never overwrites prior storage objects or DB rows.
   */
  async createVersion(params: {
    driverId: string;
    docType: DriverDocType;
    stored: StoredUpload;
    vehicleId?: string | null;
    uploadSource: DocumentUploadSource;
    sourceReference?: string | null;
    adminNote?: string | null;
    documentNumber?: string | null;
    issueDate?: Date | null;
    expiresAt?: Date | null;
    issuingJurisdiction?: string | null;
    customLabel?: string | null;
    uploadedById?: string | null;
    uploadedByType: 'DRIVER' | 'ADMIN' | 'SYSTEM';
    replaceDocumentId?: string | null;
    allowReplaceApproved?: boolean;
    reason?: string | null;
  }) {
    const {
      driverId,
      docType,
      stored,
      vehicleId,
      uploadSource,
      uploadedByType,
      uploadedById,
      replaceDocumentId,
      allowReplaceApproved,
    } = params;

    return this.prisma.$transaction(async (tx) => {
      let previous: {
        id: string;
        documentGroupId: string;
        versionNumber: number;
        status: DocumentReviewStatus;
        lifecycleStatus: DocumentLifecycleStatus;
        docType: string;
      } | null = null;

      if (replaceDocumentId) {
        previous = await tx.driverDocument.findFirst({
          where: { id: replaceDocumentId, driverId },
          select: {
            id: true,
            documentGroupId: true,
            versionNumber: true,
            status: true,
            lifecycleStatus: true,
            docType: true,
          },
        });
        if (!previous) throw new NotFoundException('Document to replace not found');
        if (previous.docType !== docType) {
          throw new BadRequestException('docType must match the document being replaced');
        }
        if (previous.lifecycleStatus !== DocumentLifecycleStatus.CURRENT) {
          throw new BadRequestException(
            'Only the CURRENT version can be replaced. Restore or select the current version.',
          );
        }
      } else if (SINGLE_ACTIVE_DOC_TYPES.includes(docType)) {
        previous = await tx.driverDocument.findFirst({
          where: {
            driverId,
            docType,
            lifecycleStatus: DocumentLifecycleStatus.CURRENT,
          },
          orderBy: { versionNumber: 'desc' },
          select: {
            id: true,
            documentGroupId: true,
            versionNumber: true,
            status: true,
            lifecycleStatus: true,
            docType: true,
          },
        });
        if (
          previous?.status === DocumentReviewStatus.APPROVED &&
          !allowReplaceApproved
        ) {
          throw new BadRequestException(
            `${docType} already approved; use admin replace with permission to create a new version`,
          );
        }
      } else if (docType === 'vehicle_photo') {
        if (!vehicleId) {
          throw new BadRequestException(
            'vehicleId is required for vehicle_photo uploads',
          );
        }
        // Lock the vehicle row so concurrent uploads cannot both pass the count check.
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "Vehicle"
          WHERE id = ${vehicleId} AND "driverId" = ${driverId}
          FOR UPDATE
        `;
        if (!locked.length) {
          throw new BadRequestException('Invalid vehicleId');
        }
        const count = await tx.driverDocument.count({
          where: {
            driverId,
            vehicleId,
            docType: 'vehicle_photo',
            lifecycleStatus: DocumentLifecycleStatus.CURRENT,
            status: {
              in: [
                DocumentReviewStatus.PENDING,
                DocumentReviewStatus.APPROVED,
                DocumentReviewStatus.NEEDS_RESUBMISSION,
              ],
            },
            softDeletedAt: null,
          },
        });
        if (count >= MAX_VEHICLE_PHOTOS && !replaceDocumentId) {
          throw new ConflictException({
            message: `Maximum ${MAX_VEHICLE_PHOTOS} vehicle photos allowed for this vehicle`,
            code: 'VEHICLE_PHOTO_LIMIT',
            max: MAX_VEHICLE_PHOTOS,
          });
        }
      }

      if (previous) {
        await tx.driverDocument.update({
          where: { id: previous.id },
          data: {
            lifecycleStatus: DocumentLifecycleStatus.SUPERSEDED,
          },
        });
      }

      const groupId = previous?.documentGroupId ?? randomBytes(12).toString('hex');
      const versionNumber = (previous?.versionNumber ?? 0) + 1;

      const created = await tx.driverDocument.create({
        data: {
          driverId,
          vehicleId: vehicleId ?? undefined,
          documentGroupId: previous ? previous.documentGroupId : groupId,
          docType,
          customLabel: params.customLabel ?? undefined,
          versionNumber,
          lifecycleStatus: DocumentLifecycleStatus.CURRENT,
          previousVersionId: previous?.id,
          storageKey: stored.storageKey,
          originalFilename: stored.originalFilename,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          checksumSha256: stored.checksumSha256,
          status: DocumentReviewStatus.PENDING,
          documentNumber: params.documentNumber ?? undefined,
          issueDate: params.issueDate ?? undefined,
          expiresAt: params.expiresAt ?? undefined,
          issuingJurisdiction: params.issuingJurisdiction ?? undefined,
          uploadSource,
          sourceReference: params.sourceReference ?? undefined,
          adminNote: params.adminNote ?? undefined,
          uploadedById: uploadedById ?? undefined,
          uploadedByType,
        },
      });

      // First version: documentGroupId points to self for stable grouping
      if (!previous) {
        await tx.driverDocument.update({
          where: { id: created.id },
          data: { documentGroupId: created.id },
        });
        created.documentGroupId = created.id;
      }

      await tx.driverProfile.update({
        where: { id: driverId },
        data: { updatedAt: new Date() },
      });

      return { created, previous, reason: params.reason ?? null };
    });
  }

  async adminUpload(
    actor: AuthUser,
    driverId: string,
    file: Express.Multer.File | undefined,
    dto: AdminUploadDocumentDto,
    ip?: string,
  ) {
    this.assertPerm(actor, 'kyc.document.upload', 'kyc.document.replace', 'kyc.approve');
    if (dto.replaceDocumentId) {
      this.assertPerm(actor, 'kyc.document.replace', 'kyc.approve', 'kyc.override');
    }
    if (!file) throw new BadRequestException('File is required');
    if (!DRIVER_DOC_TYPES.includes(dto.docType as DriverDocType)) {
      throw new BadRequestException(`Invalid docType: ${dto.docType}`);
    }
    const source = (dto.uploadSource ?? 'ADMIN_PORTAL') as DocumentUploadSource;
    if (!DOCUMENT_UPLOAD_SOURCES.includes(source)) {
      throw new BadRequestException('Invalid uploadSource');
    }
    if (source !== 'ADMIN_PORTAL' && !dto.sourceReference?.trim() && !dto.adminNote?.trim()) {
      // Encourage provenance for external sources
      if (!dto.reason?.trim()) {
        throw new BadRequestException(
          'Provide sourceReference, adminNote, or reason when uploading from an external source',
        );
      }
    }

    const driver = await this.requireDriver(driverId);
    this.assertFresh(driver.updatedAt, dto.expectedUpdatedAt);

    if (dto.docType === 'vehicle_photo' && !dto.vehicleId?.trim()) {
      throw new BadRequestException(
        'vehicleId is required for vehicle_photo uploads',
      );
    }

    if (dto.vehicleId) {
      const vehicle = await this.prisma.vehicle.findFirst({
        where: { id: dto.vehicleId, driverId },
      });
      if (!vehicle) throw new BadRequestException('Invalid vehicleId');
    }

    const stored = await this.validateAndStore({
      driverId,
      docType: dto.docType,
      file,
    });

    let result;
    try {
      result = await this.createVersion({
        driverId,
        docType: dto.docType as DriverDocType,
        stored,
        vehicleId: dto.vehicleId,
        uploadSource: source,
        sourceReference: dto.sourceReference?.trim() || null,
        adminNote: dto.adminNote?.trim() || null,
        documentNumber: dto.documentNumber?.trim() || null,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        issuingJurisdiction: dto.issuingJurisdiction?.trim() || null,
        customLabel: dto.customLabel?.trim() || null,
        uploadedById: actor.id,
        uploadedByType: 'ADMIN',
        replaceDocumentId: dto.replaceDocumentId,
        allowReplaceApproved: true,
        reason: dto.reason?.trim() || null,
      });
    } catch (err) {
      // Best-effort orphan cleanup if DB fails after storage put
      try {
        // Storage has no delete yet — leave key; audit orphan for ops
        await this.audit(
          actor.id,
          'admin.kyc.document.upload_orphan',
          'DriverDocument',
          undefined,
          ip,
          { storageKey: stored.storageKey, error: String(err) },
        );
      } catch {
        /* ignore */
      }
      throw err;
    }

    const action = result.previous
      ? 'KYC_DOCUMENT_VERSION_CREATED'
      : 'KYC_DOCUMENT_UPLOADED';
    await this.audit(actor.id, action, 'DriverDocument', result.created.id, ip, {
      driverId,
      documentId: result.created.id,
      previousVersionId: result.previous?.id ?? null,
      docType: dto.docType,
      versionNumber: result.created.versionNumber,
      uploadSource: source,
      sourceReference: dto.sourceReference ?? null,
      reason: dto.reason ?? null,
      checksumSha256: stored.checksumSha256,
    }, dto.reason ?? null);

    if (result.previous) {
      await this.audit(
        actor.id,
        'KYC_DOCUMENT_REPLACED',
        'DriverDocument',
        result.previous.id,
        ip,
        {
          driverId,
          newDocumentId: result.created.id,
          previousVersion: result.previous.versionNumber,
          newVersion: result.created.versionNumber,
        },
        dto.reason ?? null,
      );
    }

    // Re-open review if previously action-required / rejected
    if (
      driver.approvalStatus === DriverApprovalStatus.REJECTED ||
      driver.approvalStatus === DriverApprovalStatus.ACTION_REQUIRED
    ) {
      await this.prisma.driverProfile.update({
        where: { id: driverId },
        data: {
          approvalStatus:
            driver.approvalStatus === DriverApprovalStatus.REJECTED
              ? DriverApprovalStatus.PENDING_KYC
              : DriverApprovalStatus.IN_REVIEW,
        },
      });
    }

    return this.serializeDoc(result.created);
  }

  async listVersions(actor: AuthUser, driverId: string, documentId: string) {
    this.assertPerm(actor, 'kyc.history.view', 'kyc.view', 'kyc.document.view');
    const doc = await this.prisma.driverDocument.findFirst({
      where: { id: documentId, driverId },
    });
    if (!doc) throw new NotFoundException('Document not found');
    const versions = await this.prisma.driverDocument.findMany({
      where: { driverId, documentGroupId: doc.documentGroupId },
      orderBy: { versionNumber: 'desc' },
    });
    const withUrls = await Promise.all(
      versions.map(async (v) => {
        let url: string | undefined;
        try {
          url = await this.storage.getSignedGetUrl(v.storageKey);
        } catch {
          url = undefined;
        }
        return { ...this.serializeDoc(v), url };
      }),
    );
    return { documentGroupId: doc.documentGroupId, versions: withUrls };
  }

  async getVersion(
    actor: AuthUser,
    driverId: string,
    documentId: string,
    versionId: string,
  ) {
    this.assertPerm(actor, 'kyc.history.view', 'kyc.view', 'kyc.document.view');
    const base = await this.prisma.driverDocument.findFirst({
      where: { id: documentId, driverId },
    });
    if (!base) throw new NotFoundException('Document not found');
    const version = await this.prisma.driverDocument.findFirst({
      where: {
        id: versionId,
        driverId,
        documentGroupId: base.documentGroupId,
      },
    });
    if (!version) throw new NotFoundException('Version not found');
    let url: string | undefined;
    try {
      url = await this.storage.getSignedGetUrl(version.storageKey);
    } catch {
      url = undefined;
    }
    return {
      ...this.serializeDoc(version),
      url,
      historical: version.lifecycleStatus !== DocumentLifecycleStatus.CURRENT,
    };
  }

  async editMetadata(
    actor: AuthUser,
    driverId: string,
    documentId: string,
    dto: EditDocumentMetadataDto,
    ip?: string,
  ) {
    this.assertPerm(actor, 'kyc.document.edit', 'kyc.edit', 'kyc.approve');
    const driver = await this.requireDriver(driverId);
    this.assertFresh(driver.updatedAt, dto.expectedUpdatedAt);
    const doc = await this.prisma.driverDocument.findFirst({
      where: { id: documentId, driverId },
    });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.lifecycleStatus !== DocumentLifecycleStatus.CURRENT) {
      throw new BadRequestException(
        'Historical versions are read-only. Restore as current or edit the current version.',
      );
    }

    const before = {
      documentNumber: doc.documentNumber,
      issueDate: doc.issueDate,
      expiresAt: doc.expiresAt,
      issuingJurisdiction: doc.issuingJurisdiction,
      customLabel: doc.customLabel,
      adminNote: doc.adminNote,
      sourceReference: doc.sourceReference,
    };

    const data: Prisma.DriverDocumentUpdateInput = {};
    if (dto.documentNumber !== undefined) data.documentNumber = dto.documentNumber;
    if (dto.issueDate !== undefined) {
      data.issueDate = dto.issueDate ? new Date(dto.issueDate) : null;
    }
    if (dto.expiresAt !== undefined) {
      data.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    }
    if (dto.issuingJurisdiction !== undefined) {
      data.issuingJurisdiction = dto.issuingJurisdiction;
    }
    if (dto.customLabel !== undefined) data.customLabel = dto.customLabel;
    if (dto.adminNote !== undefined) data.adminNote = dto.adminNote;
    if (dto.sourceReference !== undefined) data.sourceReference = dto.sourceReference;

    const updated = await this.prisma.driverDocument.update({
      where: { id: documentId },
      data,
    });
    await this.prisma.driverProfile.update({
      where: { id: driverId },
      data: { updatedAt: new Date() },
    });

    const after = {
      documentNumber: updated.documentNumber,
      issueDate: updated.issueDate,
      expiresAt: updated.expiresAt,
      issuingJurisdiction: updated.issuingJurisdiction,
      customLabel: updated.customLabel,
      adminNote: updated.adminNote,
      sourceReference: updated.sourceReference,
    };

    await this.audit(
      actor.id,
      'KYC_METADATA_CHANGED',
      'DriverDocument',
      documentId,
      ip,
      { driverId, before, after },
      dto.reason,
      before,
      after,
    );
    return this.serializeDoc(updated);
  }

  async archive(
    actor: AuthUser,
    driverId: string,
    documentId: string,
    dto: DocumentActionDto,
    ip?: string,
  ) {
    this.assertPerm(actor, 'kyc.document.archive', 'kyc.approve');
    return this.setLifecycle(
      actor,
      driverId,
      documentId,
      DocumentLifecycleStatus.ARCHIVED,
      dto,
      ip,
      'KYC_DOCUMENT_ARCHIVED',
    );
  }

  async softDelete(
    actor: AuthUser,
    driverId: string,
    documentId: string,
    dto: DocumentActionDto,
    ip?: string,
  ) {
    this.assertPerm(actor, 'kyc.document.delete', 'kyc.override');
    return this.setLifecycle(
      actor,
      driverId,
      documentId,
      DocumentLifecycleStatus.SOFT_DELETED,
      dto,
      ip,
      'KYC_DOCUMENT_SOFT_DELETED',
    );
  }

  async restore(
    actor: AuthUser,
    driverId: string,
    documentId: string,
    dto: RestoreDocumentDto,
    ip?: string,
  ) {
    this.assertPerm(actor, 'kyc.document.restore', 'kyc.approve', 'kyc.override');
    const driver = await this.requireDriver(driverId);
    this.assertFresh(driver.updatedAt, dto.expectedUpdatedAt);
    const doc = await this.prisma.driverDocument.findFirst({
      where: { id: documentId, driverId },
    });
    if (!doc) throw new NotFoundException('Document not found');
    if (
      doc.lifecycleStatus !== DocumentLifecycleStatus.ARCHIVED &&
      doc.lifecycleStatus !== DocumentLifecycleStatus.SOFT_DELETED &&
      doc.lifecycleStatus !== DocumentLifecycleStatus.SUPERSEDED
    ) {
      throw new BadRequestException('Document is not in a restorable state');
    }

    const makeCurrent = dto.makeCurrent !== false;
    const result = await this.prisma.$transaction(async (tx) => {
      if (makeCurrent) {
        const current = await tx.driverDocument.findFirst({
          where: {
            driverId,
            documentGroupId: doc.documentGroupId,
            lifecycleStatus: DocumentLifecycleStatus.CURRENT,
          },
        });
        if (current && current.id !== doc.id) {
          await tx.driverDocument.update({
            where: { id: current.id },
            data: { lifecycleStatus: DocumentLifecycleStatus.SUPERSEDED },
          });
        }
      }
      return tx.driverDocument.update({
        where: { id: documentId },
        data: {
          lifecycleStatus: makeCurrent
            ? DocumentLifecycleStatus.CURRENT
            : DocumentLifecycleStatus.SUPERSEDED,
          softDeletedAt: null,
          softDeletedById: null,
          archivedAt: null,
          archivedById: null,
        },
      });
    });

    await this.audit(
      actor.id,
      'KYC_DOCUMENT_RESTORED',
      'DriverDocument',
      documentId,
      ip,
      {
        driverId,
        makeCurrent,
        previousLifecycle: doc.lifecycleStatus,
        newLifecycle: result.lifecycleStatus,
      },
      dto.reason ?? 'Restored',
    );
    return this.serializeDoc(result);
  }

  async overrideStatus(
    actor: AuthUser,
    driverId: string,
    documentId: string,
    dto: OverrideDocumentDto,
    ip?: string,
  ) {
    this.assertPerm(actor, 'kyc.override');
    const driver = await this.requireDriver(driverId);
    this.assertFresh(driver.updatedAt, dto.expectedUpdatedAt);
    const doc = await this.prisma.driverDocument.findFirst({
      where: { id: documentId, driverId },
    });
    if (!doc) throw new NotFoundException('Document not found');

    const updated = await this.prisma.driverDocument.update({
      where: { id: documentId },
      data: {
        status: dto.status as DocumentReviewStatus,
        rejectionReason: dto.status === 'REJECTED' ? dto.reason : null,
        adminNote: dto.note?.trim() || doc.adminNote,
        reviewedAt: new Date(),
        reviewedById: actor.id,
      },
    });

    await this.audit(
      actor.id,
      'KYC_OVERRIDE_USED',
      'DriverDocument',
      documentId,
      ip,
      {
        driverId,
        previousStatus: doc.status,
        newStatus: updated.status,
        note: dto.note ?? null,
        kind: 'document_status',
      },
      dto.reason,
      { status: doc.status },
      { status: updated.status },
    );
    return this.serializeDoc(updated);
  }

  serializeDoc(doc: {
    id: string;
    driverId: string;
    vehicleId: string | null;
    documentGroupId?: string;
    docType: string;
    customLabel?: string | null;
    versionNumber?: number;
    lifecycleStatus?: DocumentLifecycleStatus;
    previousVersionId?: string | null;
    storageKey?: string;
    originalFilename?: string | null;
    mimeType: string;
    sizeBytes: number;
    checksumSha256?: string | null;
    status: DocumentReviewStatus;
    rejectionReason: string | null;
    resubmissionReason?: string | null;
    customerMessage?: string | null;
    documentNumber?: string | null;
    issueDate?: Date | null;
    expiresAt: Date | null;
    issuingJurisdiction?: string | null;
    uploadSource?: string | null;
    sourceReference?: string | null;
    adminNote?: string | null;
    uploadedById?: string | null;
    uploadedByType?: string | null;
    reviewedAt: Date | null;
    reviewedById: string | null;
    softDeletedAt?: Date | null;
    archivedAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const label =
      doc.customLabel ||
      DOC_TYPE_LABELS[doc.docType as DriverDocType] ||
      doc.docType;
    return {
      id: doc.id,
      driverId: doc.driverId,
      vehicleId: doc.vehicleId,
      documentGroupId: doc.documentGroupId ?? doc.id,
      docType: doc.docType,
      customLabel: doc.customLabel ?? null,
      label,
      versionNumber: doc.versionNumber ?? 1,
      lifecycleStatus: doc.lifecycleStatus ?? DocumentLifecycleStatus.CURRENT,
      previousVersionId: doc.previousVersionId ?? null,
      originalFilename: doc.originalFilename ?? null,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      checksumSha256: doc.checksumSha256 ?? null,
      status: doc.status,
      rejectionReason: doc.rejectionReason,
      resubmissionReason: doc.resubmissionReason ?? null,
      customerMessage: doc.customerMessage ?? null,
      documentNumber: doc.documentNumber ?? null,
      issueDate: doc.issueDate ?? null,
      expiresAt: doc.expiresAt,
      expiryLabel: expiryLabel(doc.expiresAt),
      issuingJurisdiction: doc.issuingJurisdiction ?? null,
      uploadSource: doc.uploadSource ?? 'DRIVER_APP',
      sourceReference: doc.sourceReference ?? null,
      adminNote: doc.adminNote ?? null,
      uploadedById: doc.uploadedById ?? null,
      uploadedByType: doc.uploadedByType ?? 'DRIVER',
      reviewedAt: doc.reviewedAt,
      reviewedById: doc.reviewedById,
      softDeletedAt: doc.softDeletedAt ?? null,
      archivedAt: doc.archivedAt ?? null,
      isCurrent: (doc.lifecycleStatus ?? DocumentLifecycleStatus.CURRENT) === DocumentLifecycleStatus.CURRENT,
      isHistorical:
        (doc.lifecycleStatus ?? DocumentLifecycleStatus.CURRENT) !==
        DocumentLifecycleStatus.CURRENT,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  private async setLifecycle(
    actor: AuthUser,
    driverId: string,
    documentId: string,
    next: DocumentLifecycleStatus,
    dto: DocumentActionDto,
    ip: string | undefined,
    action: string,
  ) {
    const driver = await this.requireDriver(driverId);
    this.assertFresh(driver.updatedAt, dto.expectedUpdatedAt);
    const doc = await this.prisma.driverDocument.findFirst({
      where: { id: documentId, driverId },
    });
    if (!doc) throw new NotFoundException('Document not found');

    const data: Prisma.DriverDocumentUpdateInput = {
      lifecycleStatus: next,
    };
    if (next === DocumentLifecycleStatus.ARCHIVED) {
      data.archivedAt = new Date();
      data.archivedById = actor.id;
    }
    if (next === DocumentLifecycleStatus.SOFT_DELETED) {
      data.softDeletedAt = new Date();
      data.softDeletedById = actor.id;
    }

    // If archiving/deleting CURRENT, leave group without CURRENT — admin must restore/upload
    const updated = await this.prisma.driverDocument.update({
      where: { id: documentId },
      data,
    });
    await this.audit(actor.id, action, 'DriverDocument', documentId, ip, {
      driverId,
      previousLifecycle: doc.lifecycleStatus,
      newLifecycle: next,
      note: dto.note ?? null,
    }, dto.reason);
    return this.serializeDoc(updated);
  }

  private async requireDriver(driverId: string) {
    const driver = await this.prisma.driverProfile.findUnique({
      where: { id: driverId },
    });
    if (!driver) throw new NotFoundException('Driver not found');
    return driver;
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
          'This document or case changed after you opened it. Refresh before making a decision.',
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

  private async audit(
    actorId: string | undefined,
    action: string,
    resource?: string,
    resourceId?: string,
    ip?: string,
    meta?: Record<string, unknown>,
    reason?: string | null,
    before?: unknown,
    after?: unknown,
  ) {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          action,
          resource,
          resourceId,
          ip,
          reason: reason ?? undefined,
          before: before === undefined ? undefined : (before as Prisma.InputJsonValue),
          after: after === undefined ? undefined : (after as Prisma.InputJsonValue),
          meta: (meta ?? {}) as Prisma.InputJsonValue,
        },
      });
    } catch {
      // Prefer not to fail the primary write, but log silently
    }
  }
}
