import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import {
  DOCUMENT_UPLOAD_SOURCES,
  DRIVER_DOC_TYPES,
  KYC_FLAG_TYPES,
} from '../documents.constants';

export class AdminUploadDocumentDto {
  @IsIn([...DRIVER_DOC_TYPES])
  docType!: (typeof DRIVER_DOC_TYPES)[number];

  @IsOptional()
  @IsString()
  customLabel?: string;

  @IsOptional()
  @IsString()
  vehicleId?: string;

  @IsOptional()
  @IsIn([...DOCUMENT_UPLOAD_SOURCES])
  uploadSource?: (typeof DOCUMENT_UPLOAD_SOURCES)[number];

  @IsOptional()
  @IsString()
  sourceReference?: string;

  @IsOptional()
  @IsString()
  adminNote?: string;

  @IsOptional()
  @IsString()
  documentNumber?: string;

  @IsOptional()
  @IsISO8601()
  issueDate?: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  issuingJurisdiction?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  /** When set, creates a new version of this document group. */
  @IsOptional()
  @IsString()
  replaceDocumentId?: string;

  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;
}

export class EditDocumentMetadataDto {
  @IsOptional()
  @IsString()
  documentNumber?: string;

  @IsOptional()
  @IsISO8601()
  issueDate?: string | null;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string | null;

  @IsOptional()
  @IsString()
  issuingJurisdiction?: string;

  @IsOptional()
  @IsString()
  customLabel?: string;

  @IsOptional()
  @IsString()
  adminNote?: string;

  @IsOptional()
  @IsString()
  sourceReference?: string;

  @IsString()
  @MinLength(3)
  reason!: string;

  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;
}

export class DocumentActionDto {
  @IsString()
  @MinLength(3)
  reason!: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;
}

export class RestoreDocumentDto {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsBoolean()
  makeCurrent?: boolean;

  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;
}

export class EditApplicantDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  legalName?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phoneE164?: string;

  @IsOptional()
  @IsISO8601()
  dateOfBirth?: string | null;

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
  @IsString()
  licenceNumber?: string;

  @IsOptional()
  @IsString()
  licenceJurisdiction?: string;

  @IsOptional()
  @IsISO8601()
  licenceIssueDate?: string | null;

  @IsOptional()
  @IsISO8601()
  licenceExpiryDate?: string | null;

  @IsString()
  @MinLength(3)
  reason!: string;

  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;
}

export class ReopenKycDto {
  @IsString()
  @MinLength(3)
  reason!: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;
}

export class ResetKycDto {
  @IsString()
  @MinLength(8)
  reason!: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;
}

export class SuspendDriverDto {
  @IsString()
  @MinLength(3)
  reason!: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;
}

export class ActivateDriverDto {
  @IsOptional()
  @IsBoolean()
  override?: boolean;

  @IsOptional()
  @IsString()
  overrideReason?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;
}

export class AddKycFlagDto {
  @IsIn([...KYC_FLAG_TYPES])
  flagType!: (typeof KYC_FLAG_TYPES)[number];

  @IsString()
  @MinLength(3)
  reason!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class ClearKycFlagDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class OverrideDocumentDto {
  @IsIn(['APPROVED', 'REJECTED', 'PENDING'])
  status!: 'APPROVED' | 'REJECTED' | 'PENDING';

  @IsString()
  @MinLength(8)
  reason!: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;
}

export class BulkDownloadDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  documentIds?: string[];

  @IsOptional()
  @IsBoolean()
  includeHistory?: boolean;
}
