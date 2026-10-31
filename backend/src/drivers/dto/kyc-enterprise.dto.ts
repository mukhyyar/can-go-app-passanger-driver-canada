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
  documentNumber?: string | null;

  @IsOptional()
  @IsISO8601()
  issueDate?: string | null;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string | null;

  @IsOptional()
  @IsString()
  issuingJurisdiction?: string | null;

  @IsOptional()
  @IsString()
  customLabel?: string | null;

  @IsOptional()
  @IsString()
  adminNote?: string | null;

  @IsOptional()
  @IsString()
  sourceReference?: string | null;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  reason?: string;

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
  fullName?: string | null;

  @IsOptional()
  @IsString()
  legalName?: string | null;

  @IsOptional()
  @IsString()
  email?: string | null;

  @IsOptional()
  @IsString()
  phoneE164?: string | null;

  @IsOptional()
  @IsISO8601()
  dateOfBirth?: string | null;

  @IsOptional()
  @IsString()
  addressLine1?: string | null;

  @IsOptional()
  @IsString()
  addressLine2?: string | null;

  @IsOptional()
  @IsString()
  city?: string | null;

  @IsOptional()
  @IsString()
  province?: string | null;

  @IsOptional()
  @IsString()
  postalCode?: string | null;

  @IsOptional()
  @IsString()
  country?: string | null;

  @IsOptional()
  @IsString()
  baseLocation?: string | null;

  @IsOptional()
  @IsString()
  licenceNumber?: string | null;

  @IsOptional()
  @IsString()
  licenceJurisdiction?: string | null;

  @IsOptional()
  @IsISO8601()
  licenceIssueDate?: string | null;

  @IsOptional()
  @IsISO8601()
  licenceExpiryDate?: string | null;

  @IsOptional()
  @IsString()
  reason?: string;

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
