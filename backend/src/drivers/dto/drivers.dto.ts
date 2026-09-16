import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  DRIVER_DOC_TYPES,
  KYC_REJECT_REASONS,
  RESUBMISSION_REASONS,
} from '../documents.constants';

export class UploadDocumentMetaDto {
  @IsIn([...DRIVER_DOC_TYPES])
  docType!: (typeof DRIVER_DOC_TYPES)[number];

  @IsOptional()
  @IsString()
  vehicleId?: string;

  /** ISO date for license / registration expiry when applicable */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}/)
  expiresAt?: string;
}

export class ReviewDocumentDto {
  @IsIn(['APPROVED', 'REJECTED'])
  status!: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  rejectionReason?: string;

  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;
}

export class RejectKycDto {
  @IsString()
  @MinLength(3)
  reason!: string;

  @IsOptional()
  @IsIn([...KYC_REJECT_REASONS])
  reasonCode?: (typeof KYC_REJECT_REASONS)[number];

  @IsOptional()
  @IsString()
  internalNote?: string;

  @IsOptional()
  @IsString()
  customerMessage?: string;

  @IsOptional()
  @IsBoolean()
  confirmed?: boolean;

  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;
}

export class RequestResubmissionDto {
  @IsIn([...RESUBMISSION_REASONS])
  reason!: (typeof RESUBMISSION_REASONS)[number];

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  customerMessage?: string;

  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;
}

export class RequestChangesItemDto {
  @IsString()
  documentId!: string;

  @IsIn([...RESUBMISSION_REASONS])
  reason!: (typeof RESUBMISSION_REASONS)[number];

  @IsOptional()
  @IsString()
  customerMessage?: string;
}

export class RequestChangesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RequestChangesItemDto)
  documents!: RequestChangesItemDto[];

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;
}

export class ApproveKycDto {
  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsBoolean()
  override?: boolean;

  @IsOptional()
  @IsString()
  overrideReason?: string;

  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;
}

export class AssignKycDto {
  @IsOptional()
  @IsString()
  adminId?: string;

  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;
}

export class BulkAssignKycDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  driverIds!: string[];
}

export class AddKycNoteDto {
  @IsString()
  @MinLength(1)
  body!: string;

  @IsOptional()
  @IsBoolean()
  customerFacing?: boolean;
}

export class CreateVehicleDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  plate!: string;

  @IsString()
  @MinLength(1)
  vehicleClass!: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  passengerSeats?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  luggagePlaces?: number;

  @IsOptional()
  @IsObject()
  amenities?: Record<string, unknown>;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  autocancelBefore?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  autocancelAfter?: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateVehicleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  plate?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  vehicleClass?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  year?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  passengerSeats?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  luggagePlaces?: number | null;

  @IsOptional()
  @IsObject()
  amenities?: Record<string, unknown>;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  autocancelBefore?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  autocancelAfter?: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Optimistic concurrency — ISO timestamp from last vehicle fetch. */
  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;
}

export class UpdateDriverProfileDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  legalName?: string;

  @IsOptional()
  @IsBoolean()
  isIndividual?: boolean;

  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @IsOptional()
  @IsString()
  taxpayerId?: string;

  @IsOptional()
  @IsString()
  addressLine1?: string;

  @IsOptional()
  @IsString()
  addressLine2?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  province?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  baseLocation?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  baseLatitude?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  baseLongitude?: number | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

  /** Only accepted when referredByCode is currently empty. */
  @IsOptional()
  @IsString()
  referralCode?: string;
}

export class SetAvailabilityDto {
  @IsBoolean()
  enabled!: boolean;
}

export class UpdatePaymentDetailsDto {
  @IsOptional()
  @IsString()
  billingPeriod?: string;

  @IsOptional()
  @IsString()
  outpaymentCurrency?: string;

  @IsOptional()
  @IsString()
  bankCountry?: string;

  @IsOptional()
  @IsString()
  payoutMethod?: string;

  @IsOptional()
  @IsString()
  accountHolderName?: string;

  /** Last 4 digits or masked value only — never full account numbers. */
  @IsOptional()
  @IsString()
  accountMask?: string;
}

export class UpsertZoneDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsIn(['circle', 'polygon'])
  zoneType!: 'circle' | 'polygon';

  /** GeoJSON geometry/Feature, or circle { center:[lng,lat], radiusKm } */
  @IsObject()
  geoJson!: Record<string, unknown>;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  radiusKm?: number;
}
