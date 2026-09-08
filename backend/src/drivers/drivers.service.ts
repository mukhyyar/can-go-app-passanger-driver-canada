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
import { KycDocumentsService } from './kyc-documents.service';
import {
  DRIVER_DOC_TYPES,
  MAX_VEHICLE_PHOTOS,
  REQUIRED_DOC_TYPES,
  type DriverDocType,
} from './documents.constants';
import type {
  CreateVehicleDto,
  RejectKycDto,
  ReviewDocumentDto,
  UpdateDriverProfileDto,
  UpdatePaymentDetailsDto,
  UpdateVehicleDto,
  UpsertZoneDto,
} from './dto/drivers.dto';
import { DocumentLifecycleStatus } from '@prisma/client';

type PayoutSettings = {
  billingPeriod?: string;
  outpaymentCurrency?: string;
  bankCountry?: string;
  payoutMethod?: string;
  accountHolderName?: string;
  accountMask?: string;
  status?: string;
};

@Injectable()
export class DriversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly kycOps: KycOpsService,
    private readonly kycDocs: KycDocumentsService,
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
      where: {
        driverId: driver.id,
        lifecycleStatus: {
          in: [DocumentLifecycleStatus.CURRENT, DocumentLifecycleStatus.SUPERSEDED],
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    const current = docs.filter(
      (d) => d.lifecycleStatus === DocumentLifecycleStatus.CURRENT,
    );
    return {
      driverId: driver.id,
      approvalStatus: driver.approvalStatus,
      isActivated: driver.isActivated,
      requiredDocTypes: REQUIRED_DOC_TYPES,
      maxVehiclePhotos: MAX_VEHICLE_PHOTOS,
      documents: current.map((d) => this.kycDocs.serializeDoc(d)),
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
    return { ...this.kycDocs.serializeDoc(doc), url, expiresInSeconds: 900 };
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

    if (meta.vehicleId) {
      const vehicle = await this.prisma.vehicle.findFirst({
        where: { id: meta.vehicleId, driverId: driver.id },
      });
      if (!vehicle) throw new BadRequestException('Invalid vehicleId');
    }

    const current =
      docType === 'vehicle_photo'
        ? null
        : await this.prisma.driverDocument.findFirst({
            where: {
              driverId: driver.id,
              docType,
              lifecycleStatus: DocumentLifecycleStatus.CURRENT,
            },
            orderBy: { versionNumber: 'desc' },
          });

    const stored = await this.kycDocs.validateAndStore({
      driverId: driver.id,
      docType,
      file,
    });

    const { created } = await this.kycDocs.createVersion({
      driverId: driver.id,
      docType,
      stored,
      vehicleId: meta.vehicleId,
      uploadSource: 'DRIVER_APP',
      expiresAt: meta.expiresAt ? new Date(meta.expiresAt) : current?.expiresAt ?? null,
      uploadedById: userId,
      uploadedByType: 'DRIVER',
      replaceDocumentId: current?.id,
      allowReplaceApproved: false,
    });

    if (driver.approvalStatus === DriverApprovalStatus.REJECTED) {
      await this.prisma.driverProfile.update({
        where: { id: driver.id },
        data: { approvalStatus: DriverApprovalStatus.PENDING_KYC },
      });
    }

    await this.audit(userId, 'driver.document.upload', 'DriverDocument', created.id, ip, {
      versionNumber: created.versionNumber,
      previousVersionId: current?.id ?? null,
      checksumSha256: stored.checksumSha256,
    });
    await this.kycOps.afterDriverUpload(driver.id);
    return this.kycDocs.serializeDoc(created);
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

  async getMyProfile(userId: string) {
    const driver = await this.requireDriverProfile(userId);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, phoneE164: true },
    });
    const [zoneCount, vehicleCount, checklist] = await Promise.all([
      this.prisma.operatingZone.count({ where: { driverId: driver.id } }),
      this.prisma.vehicle.count({ where: { driverId: driver.id } }),
      this.buildChecklist(driver.id),
    ]);
    return {
      ...this.serializeProfile(driver, user),
      summaries: {
        zoneCount,
        vehicleCount,
        checklist,
      },
      accountStatus: await this.computeAccountStatus(
        driver.id,
        driver,
        checklist,
        { zoneCount, vehicleCount },
      ),
    };
  }

  async updateMyProfile(
    userId: string,
    dto: UpdateDriverProfileDto,
    ip?: string,
  ) {
    const driver = await this.requireDriverProfile(userId);
    const data: Prisma.DriverProfileUpdateInput = {};
    const changed: string[] = [];

    const setStr = (
      key: keyof Prisma.DriverProfileUpdateInput,
      value: string | undefined,
      field: string,
    ) => {
      if (value === undefined) return;
      (data as Record<string, unknown>)[key as string] = value.trim();
      changed.push(field);
    };

    setStr('fullName', dto.fullName, 'fullName');
    setStr('legalName', dto.legalName, 'legalName');
    setStr('registrationNumber', dto.registrationNumber, 'registrationNumber');
    setStr('taxpayerId', dto.taxpayerId, 'taxpayerId');
    setStr('addressLine1', dto.addressLine1, 'addressLine1');
    setStr('addressLine2', dto.addressLine2, 'addressLine2');
    setStr('city', dto.city, 'city');
    setStr('province', dto.province, 'province');
    setStr('postalCode', dto.postalCode, 'postalCode');
    setStr('country', dto.country, 'country');
    setStr('baseLocation', dto.baseLocation, 'baseLocation');

    if (dto.isIndividual !== undefined) {
      data.isIndividual = dto.isIndividual;
      changed.push('isIndividual');
    }
    if (dto.baseLatitude !== undefined) {
      data.baseLatitude = dto.baseLatitude;
      changed.push('baseLatitude');
    }
    if (dto.baseLongitude !== undefined) {
      data.baseLongitude = dto.baseLongitude;
      changed.push('baseLongitude');
    }
    if (dto.languages !== undefined) {
      if (dto.languages.length > 6) {
        throw new BadRequestException('Maximum 6 languages allowed');
      }
      const normalized = dto.languages.map((l) => l.trim().toUpperCase());
      data.languagesJson = normalized as Prisma.InputJsonValue;
      changed.push('languages');
    }
    if (dto.referralCode !== undefined) {
      const code = dto.referralCode.trim();
      if (driver.referredByCode && driver.referredByCode !== code) {
        throw new BadRequestException(
          'Referral code cannot be changed after it is set',
        );
      }
      if (!driver.referredByCode && code) {
        data.referredByCode = code;
        changed.push('referredByCode');
      }
    }

    if (changed.length === 0) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, phoneE164: true },
      });
      return this.serializeProfile(driver, user);
    }

    const before = {
      fullName: driver.fullName,
      legalName: driver.legalName,
      isIndividual: driver.isIndividual,
      baseLocation: driver.baseLocation,
    };

    const updated = await this.prisma.driverProfile.update({
      where: { id: driver.id },
      data,
    });

    await this.audit(
      userId,
      'DRIVER_PROFILE_UPDATED',
      'DriverProfile',
      driver.id,
      ip,
      { changed, before, source: 'DRIVER_APP' },
    );

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, phoneE164: true },
    });
    return this.serializeProfile(updated, user);
  }

  async getAccountStatus(userId: string) {
    const driver = await this.requireDriverProfile(userId);
    const [checklist, zoneCount, vehicleCount] = await Promise.all([
      this.buildChecklist(driver.id),
      this.prisma.operatingZone.count({ where: { driverId: driver.id } }),
      this.prisma.vehicle.count({ where: { driverId: driver.id } }),
    ]);
    return this.computeAccountStatus(driver.id, driver, checklist, {
      zoneCount,
      vehicleCount,
    });
  }

  async getPaymentDetails(userId: string) {
    const driver = await this.requireDriverProfile(userId);
    const payout = this.parsePayout(driver.payoutSettingsJson);
    return {
      paymentPeriod: '30 working days',
      billingPeriod: payout.billingPeriod ?? '3 days',
      outpaymentCurrency: payout.outpaymentCurrency ?? 'CAD',
      bankCountry: payout.bankCountry ?? 'Canada',
      payoutMethod: payout.payoutMethod ?? 'bank_transfer',
      accountHolderName: payout.accountHolderName ?? '',
      accountMask: payout.accountMask ?? '',
      status: payout.status ?? (payout.outpaymentCurrency ? 'CONFIGURED' : 'NOT_CONFIGURED'),
      commissionPct: 5,
    };
  }

  async updatePaymentDetails(
    userId: string,
    dto: UpdatePaymentDetailsDto,
    ip?: string,
  ) {
    const driver = await this.requireDriverProfile(userId);
    const current = this.parsePayout(driver.payoutSettingsJson);
    const next: PayoutSettings = {
      ...current,
      ...(dto.billingPeriod !== undefined
        ? { billingPeriod: dto.billingPeriod.trim() }
        : {}),
      ...(dto.outpaymentCurrency !== undefined
        ? { outpaymentCurrency: dto.outpaymentCurrency.trim().toUpperCase() }
        : {}),
      ...(dto.bankCountry !== undefined
        ? { bankCountry: dto.bankCountry.trim() }
        : {}),
      ...(dto.payoutMethod !== undefined
        ? { payoutMethod: dto.payoutMethod.trim() }
        : {}),
      ...(dto.accountHolderName !== undefined
        ? { accountHolderName: dto.accountHolderName.trim() }
        : {}),
      ...(dto.accountMask !== undefined
        ? { accountMask: dto.accountMask.trim() }
        : {}),
      status: 'PENDING',
    };

    await this.prisma.driverProfile.update({
      where: { id: driver.id },
      data: { payoutSettingsJson: next as Prisma.InputJsonValue },
    });

    await this.audit(
      userId,
      'PAYMENT_DETAILS_UPDATED',
      'DriverProfile',
      driver.id,
      ip,
      {
        source: 'DRIVER_APP',
        fields: Object.keys(dto),
        currency: next.outpaymentCurrency,
        bankCountry: next.bankCountry,
      },
    );

    return this.getPaymentDetails(userId);
  }

  async createVehicle(userId: string, dto: CreateVehicleDto, ip?: string) {
    const driver = await this.requireDriverProfile(userId);
    const plate = dto.plate.trim().toUpperCase();
    await this.assertPlateUnique(driver.id, plate);

    const makeDefault =
      dto.isDefault === true ||
      (await this.prisma.vehicle.count({ where: { driverId: driver.id } })) ===
        0;

    const vehicle = await this.prisma.$transaction(async (tx) => {
      if (makeDefault) {
        await tx.vehicle.updateMany({
          where: { driverId: driver.id, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.vehicle.create({
        data: {
          driverId: driver.id,
          name: dto.name.trim(),
          plate,
          vehicleClass: dto.vehicleClass.trim(),
          color: dto.color?.trim() ?? '',
          year: dto.year ?? null,
          passengerSeats: dto.passengerSeats ?? null,
          luggagePlaces: dto.luggagePlaces ?? null,
          amenitiesJson: (dto.amenities ?? {}) as Prisma.InputJsonValue,
          autocancelBefore: dto.autocancelBefore ?? 10,
          autocancelAfter: dto.autocancelAfter ?? 10,
          isActive: dto.isActive ?? true,
          isDefault: makeDefault,
        },
      });
    });

    await this.audit(
      userId,
      'VEHICLE_CREATED',
      'Vehicle',
      vehicle.id,
      ip,
      { source: 'DRIVER_APP', plate: vehicle.plate },
    );
    return this.serializeVehicle(vehicle);
  }

  async listVehicles(userId: string) {
    const driver = await this.requireDriverProfile(userId);
    const vehicles = await this.prisma.vehicle.findMany({
      where: { driverId: driver.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return vehicles.map((v) => this.serializeVehicle(v));
  }

  async getVehicle(userId: string, vehicleId: string) {
    const driver = await this.requireDriverProfile(userId);
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, driverId: driver.id },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    return this.serializeVehicle(vehicle);
  }

  async updateVehicle(
    userId: string,
    vehicleId: string,
    dto: UpdateVehicleDto,
    ip?: string,
  ) {
    const driver = await this.requireDriverProfile(userId);
    const existing = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, driverId: driver.id },
    });
    if (!existing) throw new NotFoundException('Vehicle not found');

    if (dto.plate !== undefined) {
      await this.assertPlateUnique(
        driver.id,
        dto.plate.trim().toUpperCase(),
        vehicleId,
      );
    }

    const sensitiveChanged =
      (dto.plate !== undefined &&
        dto.plate.trim().toUpperCase() !== existing.plate) ||
      (dto.name !== undefined && dto.name.trim() !== existing.name) ||
      (dto.vehicleClass !== undefined &&
        dto.vehicleClass.trim() !== existing.vehicleClass);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault === true) {
        await tx.vehicle.updateMany({
          where: { driverId: driver.id, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.vehicle.update({
        where: { id: vehicleId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.plate !== undefined
            ? { plate: dto.plate.trim().toUpperCase() }
            : {}),
          ...(dto.vehicleClass !== undefined
            ? { vehicleClass: dto.vehicleClass.trim() }
            : {}),
          ...(dto.color !== undefined ? { color: dto.color.trim() } : {}),
          ...(dto.year !== undefined ? { year: dto.year } : {}),
          ...(dto.passengerSeats !== undefined
            ? { passengerSeats: dto.passengerSeats }
            : {}),
          ...(dto.luggagePlaces !== undefined
            ? { luggagePlaces: dto.luggagePlaces }
            : {}),
          ...(dto.amenities !== undefined
            ? { amenitiesJson: dto.amenities as Prisma.InputJsonValue }
            : {}),
          ...(dto.autocancelBefore !== undefined
            ? { autocancelBefore: dto.autocancelBefore }
            : {}),
          ...(dto.autocancelAfter !== undefined
            ? { autocancelAfter: dto.autocancelAfter }
            : {}),
          ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });
    });

    if (sensitiveChanged) {
      // Identity change → any CURRENT vehicle_photos for this vehicle need re-review.
      await this.prisma.driverDocument.updateMany({
        where: {
          driverId: driver.id,
          vehicleId,
          docType: 'vehicle_photo',
          lifecycleStatus: DocumentLifecycleStatus.CURRENT,
          status: DocumentReviewStatus.APPROVED,
        },
        data: { status: DocumentReviewStatus.PENDING },
      });
    }

    await this.audit(
      userId,
      dto.isDefault === true ? 'VEHICLE_DEFAULT_CHANGED' : 'VEHICLE_UPDATED',
      'Vehicle',
      vehicleId,
      ip,
      {
        source: 'DRIVER_APP',
        sensitiveChanged,
        fields: Object.keys(dto),
      },
    );
    return this.serializeVehicle(updated);
  }

  async deleteVehicle(userId: string, vehicleId: string, ip?: string) {
    const driver = await this.requireDriverProfile(userId);
    const existing = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, driverId: driver.id },
    });
    if (!existing) throw new NotFoundException('Vehicle not found');

    await this.prisma.vehicle.delete({ where: { id: vehicleId } });

    if (existing.isDefault) {
      const next = await this.prisma.vehicle.findFirst({
        where: { driverId: driver.id },
        orderBy: { createdAt: 'asc' },
      });
      if (next) {
        await this.prisma.vehicle.update({
          where: { id: next.id },
          data: { isDefault: true },
        });
      }
    }

    await this.audit(userId, 'VEHICLE_DELETED', 'Vehicle', vehicleId, ip, {
      source: 'DRIVER_APP',
      plate: existing.plate,
    });
    return { ok: true };
  }

  async listZones(userId: string) {
    const driver = await this.requireDriverProfile(userId);
    return this.prisma.operatingZone.findMany({
      where: { driverId: driver.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async upsertZone(
    userId: string,
    dto: UpsertZoneDto,
    zoneId?: string,
    ip?: string,
  ) {
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
    await this.audit(
      userId,
      zoneId ? 'OPERATING_ZONE_UPDATED' : 'OPERATING_ZONE_CREATED',
      'OperatingZone',
      zone.id,
      ip,
      { source: 'DRIVER_APP' },
    );
    return zone;
  }

  async deleteZone(userId: string, zoneId: string, ip?: string) {
    const driver = await this.requireDriverProfile(userId);
    const existing = await this.prisma.operatingZone.findFirst({
      where: { id: zoneId, driverId: driver.id },
    });
    if (!existing) throw new NotFoundException('Zone not found');
    await this.prisma.operatingZone.delete({ where: { id: zoneId } });
    await this.audit(
      userId,
      'OPERATING_ZONE_DELETED',
      'OperatingZone',
      zoneId,
      ip,
      { source: 'DRIVER_APP' },
    );
    return { ok: true };
  }

  private serializeProfile(
    driver: {
      id: string;
      fullName: string;
      legalName: string;
      isIndividual: boolean;
      approvalStatus: DriverApprovalStatus;
      isActivated: boolean;
      baseLocation: string;
      baseLatitude: number | null;
      baseLongitude: number | null;
      referredByCode: string | null;
      addressLine1: string;
      addressLine2: string;
      city: string;
      province: string;
      postalCode: string;
      country: string;
      languagesJson: Prisma.JsonValue;
      registrationNumber: string;
      taxpayerId: string;
      payoutSettingsJson: Prisma.JsonValue;
      createdAt: Date;
      updatedAt: Date;
    },
    user?: { email: string | null; phoneE164: string | null } | null,
  ) {
    const languages = Array.isArray(driver.languagesJson)
      ? (driver.languagesJson as unknown[]).filter(
          (x): x is string => typeof x === 'string',
        )
      : [];
    const addressParts = [
      driver.addressLine1,
      driver.addressLine2,
      driver.city,
      driver.province,
      driver.postalCode,
      driver.country,
    ].filter((p) => p && p.trim());
    return {
      id: driver.id,
      fullName: driver.fullName,
      legalName: driver.legalName,
      isIndividual: driver.isIndividual,
      registrationNumber: driver.registrationNumber,
      taxpayerId: driver.taxpayerId,
      languages,
      referralCode: driver.referredByCode ?? '',
      referralImmutable: Boolean(driver.referredByCode),
      addressLine1: driver.addressLine1,
      addressLine2: driver.addressLine2,
      city: driver.city,
      province: driver.province,
      postalCode: driver.postalCode,
      country: driver.country,
      address: addressParts.join(', '),
      baseLocation: driver.baseLocation,
      baseLatitude: driver.baseLatitude,
      baseLongitude: driver.baseLongitude,
      email: user?.email ?? null,
      phoneE164: user?.phoneE164 ?? null,
      approvalStatus: driver.approvalStatus,
      isActivated: driver.isActivated,
      carrierType: driver.isIndividual ? 'INDIVIDUAL' : 'LEGAL_ENTITY',
      payout: this.parsePayout(driver.payoutSettingsJson),
      createdAt: driver.createdAt,
      updatedAt: driver.updatedAt,
    };
  }

  private serializeVehicle(v: {
    id: string;
    name: string;
    plate: string;
    vehicleClass: string;
    color: string;
    year: number | null;
    passengerSeats: number | null;
    luggagePlaces: number | null;
    amenitiesJson: Prisma.JsonValue;
    autocancelBefore: number;
    autocancelAfter: number;
    isActive: boolean;
    isDefault: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: v.id,
      name: v.name,
      plate: v.plate,
      vehicleClass: v.vehicleClass,
      color: v.color,
      year: v.year,
      passengerSeats: v.passengerSeats,
      luggagePlaces: v.luggagePlaces,
      amenitiesJson: v.amenitiesJson,
      amenities:
        v.amenitiesJson && typeof v.amenitiesJson === 'object'
          ? v.amenitiesJson
          : {},
      autocancelBefore: v.autocancelBefore,
      autocancelAfter: v.autocancelAfter,
      isActive: v.isActive,
      isDefault: v.isDefault,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
    };
  }

  private parsePayout(raw: Prisma.JsonValue): PayoutSettings {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return raw as PayoutSettings;
  }

  private async assertPlateUnique(
    driverId: string,
    plate: string,
    excludeId?: string,
  ) {
    const clash = await this.prisma.vehicle.findFirst({
      where: {
        driverId,
        plate,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
    });
    if (clash) {
      throw new BadRequestException(
        'A vehicle with this license plate already exists on your account',
      );
    }
  }

  private async computeAccountStatus(
    _driverId: string,
    driver: {
      approvalStatus: DriverApprovalStatus;
      isActivated: boolean;
      fullName: string;
      baseLatitude: number | null;
      baseLongitude: number | null;
      payoutSettingsJson: Prisma.JsonValue;
    },
    checklist: {
      requiredComplete: boolean;
      readyForActivation: boolean;
      required: { docType: string; approved: boolean }[];
      vehiclePhotosApproved: number;
    },
    counts: { zoneCount: number; vehicleCount: number },
  ) {
    if (driver.approvalStatus === DriverApprovalStatus.SUSPENDED) {
      return {
        state: 'SUSPENDED',
        label: 'Suspended',
        cta: null,
        checklist,
      };
    }
    if (driver.approvalStatus === DriverApprovalStatus.REJECTED) {
      return {
        state: 'REJECTED',
        label: 'Action required',
        cta: { label: 'Review documents', route: '/onboarding/documents' },
        checklist,
      };
    }
    if (driver.isActivated) {
      return {
        state: 'ACTIVE',
        label: 'Activated partner',
        cta: null,
        checklist,
      };
    }

    if (!driver.fullName?.trim()) {
      return {
        state: 'PROFILE_INCOMPLETE',
        label: 'Complete your profile',
        cta: { label: 'Carrier profile', route: '/onboarding/profile' },
        checklist,
      };
    }
    if (
      driver.baseLatitude == null ||
      driver.baseLongitude == null ||
      counts.zoneCount === 0
    ) {
      return {
        state: 'PROFILE_INCOMPLETE',
        label:
          counts.zoneCount === 0
            ? 'Add an operating zone'
            : 'Set base location',
        cta: { label: 'Operating zone', route: '/onboarding/zone' },
        checklist,
      };
    }

    const docs = await this.prisma.driverDocument.count({
      where: {
        driverId: _driverId,
        lifecycleStatus: DocumentLifecycleStatus.CURRENT,
      },
    });
    if (docs === 0) {
      return {
        state: 'DOCUMENTS_REQUIRED',
        label: 'Documents required',
        cta: { label: 'Documents', route: '/onboarding/documents' },
        checklist,
      };
    }
    if (!checklist.requiredComplete || checklist.vehiclePhotosApproved < 1) {
      return {
        state: 'DOCUMENTS_PENDING',
        label: 'Verification in progress',
        cta: { label: 'Documents', route: '/onboarding/documents' },
        checklist,
      };
    }

    if (counts.vehicleCount === 0) {
      return {
        state: 'VEHICLE_REQUIRED',
        label: 'Add a vehicle to continue',
        cta: { label: 'Vehicles', route: '/settings/vehicles' },
        checklist,
      };
    }

    const payout = this.parsePayout(driver.payoutSettingsJson);
    if (!payout.outpaymentCurrency) {
      return {
        state: 'PAYMENT_SETUP_REQUIRED',
        label: 'Set up payout details',
        cta: { label: 'Payment details', route: '/onboarding/payment' },
        checklist,
      };
    }

    if (
      driver.approvalStatus === DriverApprovalStatus.IN_REVIEW ||
      checklist.readyForActivation
    ) {
      return {
        state: 'UNDER_REVIEW',
        label: 'Under review',
        cta: null,
        checklist,
      };
    }

    return {
      state: 'DRAFT',
      label: 'Complete setup',
      cta: { label: 'Continue', route: '/onboarding/profile' },
      checklist,
    };
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
      documents: d.documents.map((doc) => this.kycDocs.serializeDoc(doc)),
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
        ...this.kycDocs.serializeDoc(doc),
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
    return this.kycDocs.serializeDoc(updated);
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
      where: {
        driverId,
        lifecycleStatus: DocumentLifecycleStatus.CURRENT,
      },
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
