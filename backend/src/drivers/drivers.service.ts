import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DocumentReviewStatus,
  DriverApprovalStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { KycOpsService } from './kyc-ops.service';
import {
  ALLOWED_MIME,
  DRIVER_DOC_TYPES,
  MAX_UPLOAD_BYTES,
  MAX_VEHICLE_PHOTOS,
  REQUIRED_DOC_TYPES,
  type DriverDocType,
} from './documents.constants';
import type {
  CreateVehicleDto,
  RejectKycDto,
  ReviewDocumentDto,
  UpsertZoneDto,
} from './dto/drivers.dto';

// file-type@16 CommonJS
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FileType = require('file-type') as {
  fromBuffer: (
    buf: Buffer,
  ) => Promise<{ ext: string; mime: string } | undefined>;
};

@Injectable()
export class DriversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly kycOps: KycOpsService,
  ) {}

  private async requireDriverProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { driverProfile: true },
    });
    if (!user || user.role !== UserRole.DRIVER || !user.driverProfile) {
      throw new ForbiddenException('Driver profile required');
    }
    if (user.isSuspended) {
      throw new ForbiddenException('Account suspended');
    }
    return user.driverProfile;
  }

  async listMyDocuments(userId: string) {
    const driver = await this.requireDriverProfile(userId);
    const docs = await this.prisma.driverDocument.findMany({
      where: { driverId: driver.id },
      orderBy: { createdAt: 'desc' },
    });
    return {
      driverId: driver.id,
      approvalStatus: driver.approvalStatus,
      isActivated: driver.isActivated,
      requiredDocTypes: REQUIRED_DOC_TYPES,
      maxVehiclePhotos: MAX_VEHICLE_PHOTOS,
      documents: docs.map((d) => this.serializeDoc(d)),
      checklist: await this.buildChecklist(driver.id),
    };
  }

  async getDocumentSignedUrl(userId: string, documentId: string) {
    const driver = await this.requireDriverProfile(userId);
    const doc = await this.prisma.driverDocument.findFirst({
      where: { id: documentId, driverId: driver.id },
    });
    if (!doc) throw new NotFoundException('Document not found');
    const url = await this.storage.getSignedGetUrl(doc.storageKey);
    return { ...this.serializeDoc(doc), url, expiresInSeconds: 900 };
  }

  async uploadDocument(
    userId: string,
    file: Express.Multer.File | undefined,
    meta: { docType: string; vehicleId?: string; expiresAt?: string },
    ip?: string,
  ) {
    const driver = await this.requireDriverProfile(userId);
    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required');
    }
    if (!DRIVER_DOC_TYPES.includes(meta.docType as DriverDocType)) {
      throw new BadRequestException(`Invalid docType: ${meta.docType}`);
    }
    const docType = meta.docType as DriverDocType;

    if (file.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException(
        `File too large (max ${MAX_UPLOAD_BYTES} bytes)`,
      );
    }

    const detected = await FileType.fromBuffer(file.buffer);
    const mime = detected?.mime ?? file.mimetype;
    if (!mime || !ALLOWED_MIME.has(mime)) {
      throw new BadRequestException(
        `Unsupported file type (detected=${mime ?? 'unknown'})`,
      );
    }
    // Reject MIME spoofing when magic bytes disagree with client claim
    if (
      file.mimetype &&
      ALLOWED_MIME.has(file.mimetype) &&
      detected?.mime &&
      file.mimetype !== detected.mime
    ) {
      throw new BadRequestException('MIME type mismatch (magic-byte check)');
    }

    if (docType === 'vehicle_photo') {
      const count = await this.prisma.driverDocument.count({
        where: {
          driverId: driver.id,
          docType: 'vehicle_photo',
          status: {
            in: [DocumentReviewStatus.PENDING, DocumentReviewStatus.APPROVED],
          },
        },
      });
      if (count >= MAX_VEHICLE_PHOTOS) {
        throw new BadRequestException(
          `Maximum ${MAX_VEHICLE_PHOTOS} vehicle photos allowed`,
        );
      }
    } else {
      // One active (non-rejected) doc per type; replace pending by superseding
      const existing = await this.prisma.driverDocument.findFirst({
        where: {
          driverId: driver.id,
          docType,
          status: {
            in: [DocumentReviewStatus.PENDING, DocumentReviewStatus.APPROVED],
          },
        },
      });
      if (existing?.status === DocumentReviewStatus.APPROVED) {
        throw new BadRequestException(
          `${docType} already approved; contact support to replace`,
        );
      }
      if (existing?.status === DocumentReviewStatus.PENDING) {
        await this.prisma.driverDocument.update({
          where: { id: existing.id },
          data: {
            status: DocumentReviewStatus.REJECTED,
            rejectionReason: 'Superseded by new upload',
            reviewedAt: new Date(),
          },
        });
      } else {
        const resubmit = await this.prisma.driverDocument.findFirst({
          where: {
            driverId: driver.id,
            docType,
            status: DocumentReviewStatus.NEEDS_RESUBMISSION,
          },
        });
        if (resubmit) {
          await this.prisma.driverDocument.update({
            where: { id: resubmit.id },
            data: {
              status: DocumentReviewStatus.REJECTED,
              rejectionReason: 'Superseded by new upload',
              reviewedAt: new Date(),
            },
          });
        }
      }
    }

    if (meta.vehicleId) {
      const vehicle = await this.prisma.vehicle.findFirst({
        where: { id: meta.vehicleId, driverId: driver.id },
      });
      if (!vehicle) throw new BadRequestException('Invalid vehicleId');
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
    const key = `drivers/${driver.id}/${docType}/${Date.now()}-${cryptoRandom()}.${ext}`;
    await this.storage.putObject({
      key,
      body: file.buffer,
      contentType: mime,
    });

    const doc = await this.prisma.driverDocument.create({
      data: {
        driverId: driver.id,
        vehicleId: meta.vehicleId,
        docType,
        storageKey: key,
        mimeType: mime,
        sizeBytes: file.size,
        status: DocumentReviewStatus.PENDING,
        expiresAt: meta.expiresAt ? new Date(meta.expiresAt) : undefined,
      },
    });

    if (driver.approvalStatus === DriverApprovalStatus.REJECTED) {
      await this.prisma.driverProfile.update({
        where: { id: driver.id },
        data: { approvalStatus: DriverApprovalStatus.PENDING_KYC },
      });
    }

    await this.audit(userId, 'driver.document.upload', 'DriverDocument', doc.id, ip);
    await this.kycOps.afterDriverUpload(driver.id);
    return this.serializeDoc(doc);
  }

  async reuploadRejected(
    userId: string,
    documentId: string,
    file: Express.Multer.File | undefined,
    ip?: string,
  ) {
    const driver = await this.requireDriverProfile(userId);
    const prev = await this.prisma.driverDocument.findFirst({
      where: { id: documentId, driverId: driver.id },
    });
    if (!prev) throw new NotFoundException('Document not found');
    if (
      prev.status !== DocumentReviewStatus.REJECTED &&
      prev.status !== DocumentReviewStatus.NEEDS_RESUBMISSION
    ) {
      throw new BadRequestException(
        'Only rejected or resubmission-requested documents can be re-uploaded',
      );
    }
    return this.uploadDocument(
      userId,
      file,
      {
        docType: prev.docType,
        vehicleId: prev.vehicleId ?? undefined,
        expiresAt: prev.expiresAt?.toISOString(),
      },
      ip,
    );
  }

  async createVehicle(userId: string, dto: CreateVehicleDto) {
    const driver = await this.requireDriverProfile(userId);
    const vehicle = await this.prisma.vehicle.create({
      data: {
        driverId: driver.id,
        name: dto.name,
        plate: dto.plate,
        vehicleClass: dto.vehicleClass,
      },
    });
    return vehicle;
  }

  async listVehicles(userId: string) {
    const driver = await this.requireDriverProfile(userId);
    return this.prisma.vehicle.findMany({
      where: { driverId: driver.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listZones(userId: string) {
    const driver = await this.requireDriverProfile(userId);
    return this.prisma.operatingZone.findMany({
      where: { driverId: driver.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async upsertZone(userId: string, dto: UpsertZoneDto, zoneId?: string) {
    const driver = await this.requireDriverProfile(userId);
    this.validateZoneGeo(dto);

    let zone;
    if (zoneId) {
      const existing = await this.prisma.operatingZone.findFirst({
        where: { id: zoneId, driverId: driver.id },
      });
      if (!existing) throw new NotFoundException('Zone not found');
      zone = await this.prisma.operatingZone.update({
        where: { id: zoneId },
        data: {
          name: dto.name,
          zoneType: dto.zoneType,
          geoJson: dto.geoJson as Prisma.InputJsonValue,
          radiusKm: dto.radiusKm ?? null,
        },
      });
    } else {
      zone = await this.prisma.operatingZone.create({
        data: {
          driverId: driver.id,
          name: dto.name,
          zoneType: dto.zoneType,
          geoJson: dto.geoJson as Prisma.InputJsonValue,
          radiusKm: dto.radiusKm ?? null,
        },
      });
    }

    await this.syncZoneGeom(zone.id, dto);
    await this.audit(userId, zoneId ? 'driver.zone.update' : 'driver.zone.create', 'OperatingZone', zone.id);
    return zone;
  }

  async deleteZone(userId: string, zoneId: string) {
    const driver = await this.requireDriverProfile(userId);
    const existing = await this.prisma.operatingZone.findFirst({
      where: { id: zoneId, driverId: driver.id },
    });
    if (!existing) throw new NotFoundException('Zone not found');
    await this.prisma.operatingZone.delete({ where: { id: zoneId } });
    await this.audit(userId, 'driver.zone.delete', 'OperatingZone', zoneId);
    return { ok: true };
  }

  // --- Admin ---

  async adminListKycQueue(status?: string) {
    const where =
      status &&
      Object.values(DriverApprovalStatus).includes(
        status as DriverApprovalStatus,
      )
        ? { approvalStatus: status as DriverApprovalStatus }
        : { approvalStatus: DriverApprovalStatus.PENDING_KYC };

    const drivers = await this.prisma.driverProfile.findMany({
      where,
      include: {
        user: { select: { id: true, email: true, phoneE164: true } },
        documents: { orderBy: { createdAt: 'desc' } },
        vehicles: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });

    return drivers.map((d) => ({
      id: d.id,
      userId: d.userId,
      fullName: d.fullName,
      approvalStatus: d.approvalStatus,
      isActivated: d.isActivated,
      user: d.user,
      vehicles: d.vehicles,
      documents: d.documents.map((doc) => this.serializeDoc(doc)),
    }));
  }

  async adminGetDriverDocuments(driverId: string) {
    const driver = await this.prisma.driverProfile.findUnique({
      where: { id: driverId },
      include: {
        user: { select: { id: true, email: true, phoneE164: true } },
        documents: { orderBy: { createdAt: 'desc' } },
        vehicles: true,
        operatingZones: true,
      },
    });
    if (!driver) throw new NotFoundException('Driver not found');

    const withUrls = await Promise.all(
      driver.documents.map(async (doc) => ({
        ...this.serializeDoc(doc),
        url: await this.storage.getSignedGetUrl(doc.storageKey),
      })),
    );

    return {
      ...driver,
      documents: withUrls,
      checklist: await this.buildChecklist(driver.id),
    };
  }

  async adminReviewDocument(
    adminUserId: string,
    documentId: string,
    dto: ReviewDocumentDto,
    ip?: string,
  ) {
    if (dto.status === 'REJECTED' && !dto.rejectionReason?.trim()) {
      throw new BadRequestException('rejectionReason is required when rejecting');
    }
    const doc = await this.prisma.driverDocument.findUnique({
      where: { id: documentId },
    });
    if (!doc) throw new NotFoundException('Document not found');

    const updated = await this.prisma.driverDocument.update({
      where: { id: documentId },
      data: {
        status: dto.status as DocumentReviewStatus,
        rejectionReason:
          dto.status === 'REJECTED' ? dto.rejectionReason!.trim() : null,
        reviewedAt: new Date(),
        reviewedById: adminUserId,
      },
    });

    await this.audit(
      adminUserId,
      `admin.document.${dto.status.toLowerCase()}`,
      'DriverDocument',
      documentId,
      ip,
    );
    return this.serializeDoc(updated);
  }

  async adminActivateDriver(adminUserId: string, driverId: string, ip?: string) {
    const driver = await this.prisma.driverProfile.findUnique({
      where: { id: driverId },
    });
    if (!driver) throw new NotFoundException('Driver not found');

    const checklist = await this.buildChecklist(driverId);
    if (!checklist.readyForActivation) {
      throw new BadRequestException({
        message:
          'Required documents + at least 1 vehicle photo must be approved',
        checklist,
      });
    }

    const updated = await this.prisma.driverProfile.update({
      where: { id: driverId },
      data: {
        isActivated: true,
        approvalStatus: DriverApprovalStatus.APPROVED,
      },
    });

    await this.audit(adminUserId, 'admin.driver.activate', 'DriverProfile', driverId, ip);
    return {
      id: updated.id,
      approvalStatus: updated.approvalStatus,
      isActivated: updated.isActivated,
    };
  }

  async adminRejectKyc(
    adminUserId: string,
    driverId: string,
    dto: RejectKycDto,
    ip?: string,
  ) {
    const driver = await this.prisma.driverProfile.findUnique({
      where: { id: driverId },
    });
    if (!driver) throw new NotFoundException('Driver not found');

    const updated = await this.prisma.driverProfile.update({
      where: { id: driverId },
      data: {
        isActivated: false,
        approvalStatus: DriverApprovalStatus.REJECTED,
      },
    });

    await this.audit(
      adminUserId,
      'admin.driver.reject_kyc',
      'DriverProfile',
      driverId,
      ip,
      { reason: dto.reason ?? null },
    );
    return {
      id: updated.id,
      approvalStatus: updated.approvalStatus,
      isActivated: updated.isActivated,
      reason: dto.reason ?? null,
    };
  }

  async adminDeactivateDriver(adminUserId: string, driverId: string, ip?: string) {
    const driver = await this.prisma.driverProfile.findUnique({
      where: { id: driverId },
    });
    if (!driver) throw new NotFoundException('Driver not found');
    const updated = await this.prisma.driverProfile.update({
      where: { id: driverId },
      data: { isActivated: false },
    });
    await this.audit(adminUserId, 'admin.driver.deactivate', 'DriverProfile', driverId, ip);
    return {
      id: updated.id,
      approvalStatus: updated.approvalStatus,
      isActivated: updated.isActivated,
    };
  }

  // --- helpers ---

  private async buildChecklist(driverId: string) {
    const docs = await this.prisma.driverDocument.findMany({
      where: { driverId },
    });
    const approved = new Set(
      docs
        .filter((d) => d.status === DocumentReviewStatus.APPROVED)
        .map((d) => d.docType),
    );
    const required = REQUIRED_DOC_TYPES.map((t) => ({
      docType: t,
      approved: approved.has(t),
    }));
    const vehiclePhotos = docs.filter(
      (d) =>
        d.docType === 'vehicle_photo' &&
        d.status === DocumentReviewStatus.APPROVED,
    ).length;
    return {
      required,
      requiredComplete: required.every((r) => r.approved),
      vehiclePhotosApproved: vehiclePhotos,
      vehiclePhotosRequiredMin: 1,
      readyForActivation:
        required.every((r) => r.approved) && vehiclePhotos >= 1,
    };
  }

  private validateZoneGeo(dto: UpsertZoneDto) {
    if (!dto.geoJson || typeof dto.geoJson !== 'object') {
      throw new BadRequestException('geoJson is required');
    }
    if (dto.zoneType === 'circle') {
      const g = dto.geoJson as {
        type?: string;
        center?: number[];
        radiusKm?: number;
      };
      const center = g.center;
      const radius = dto.radiusKm ?? g.radiusKm;
      if (!center || center.length !== 2 || !radius || radius <= 0) {
        throw new BadRequestException(
          'circle zones require center:[lng,lat] and radiusKm',
        );
      }
    } else if (dto.zoneType === 'polygon') {
      const g = dto.geoJson as { type?: string; coordinates?: unknown };
      const geom = g.type === 'Feature' ? (dto.geoJson as { geometry?: { type?: string } }).geometry : g;
      if (!geom || (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon')) {
        throw new BadRequestException(
          'polygon zones require GeoJSON Polygon/MultiPolygon',
        );
      }
    }
  }

  private async syncZoneGeom(zoneId: string, dto: UpsertZoneDto) {
    try {
      if (dto.zoneType === 'circle') {
        const g = dto.geoJson as { center: number[]; radiusKm?: number };
        const [lng, lat] = g.center;
        const radiusKm = dto.radiusKm ?? g.radiusKm!;
        const meters = radiusKm * 1000;
        await this.prisma.$executeRawUnsafe(
          `UPDATE "OperatingZone"
           SET geom = ST_Transform(
             ST_Buffer(
               ST_Transform(ST_SetSRID(ST_MakePoint($1, $2), 4326), 3857),
               $3
             ),
             4326
           )
           WHERE id = $4`,
          lng,
          lat,
          meters,
          zoneId,
        );
      } else {
        const raw =
          (dto.geoJson as { type?: string }).type === 'Feature'
            ? JSON.stringify((dto.geoJson as { geometry: unknown }).geometry)
            : JSON.stringify(dto.geoJson);
        await this.prisma.$executeRawUnsafe(
          `UPDATE "OperatingZone"
           SET geom = ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)
           WHERE id = $2`,
          raw,
          zoneId,
        );
      }
    } catch (err) {
      // Column may not exist until SQL migration applied; non-fatal for JSON path.
      // eslint-disable-next-line no-console
      console.warn(
        '[DriversService] PostGIS geom sync skipped/failed:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  private serializeDoc(doc: {
    id: string;
    driverId: string;
    vehicleId: string | null;
    docType: string;
    mimeType: string;
    sizeBytes: number;
    status: DocumentReviewStatus;
    rejectionReason: string | null;
    resubmissionReason?: string | null;
    customerMessage?: string | null;
    expiresAt: Date | null;
    reviewedAt: Date | null;
    reviewedById: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: doc.id,
      driverId: doc.driverId,
      vehicleId: doc.vehicleId,
      docType: doc.docType,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      status: doc.status,
      rejectionReason: doc.rejectionReason,
      resubmissionReason: doc.resubmissionReason ?? null,
      customerMessage: doc.customerMessage ?? null,
      expiresAt: doc.expiresAt,
      reviewedAt: doc.reviewedAt,
      reviewedById: doc.reviewedById,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
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
          meta: (meta ?? {}) as Prisma.InputJsonValue,
        },
      });
    } catch {
      // non-fatal
    }
  }
}

function cryptoRandom() {
  return Math.random().toString(36).slice(2, 10);
}
