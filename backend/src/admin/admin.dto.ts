import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class ImpersonateDto {
  @IsString()
  @MinLength(8)
  reason!: string;

  @IsOptional()
  @IsBoolean()
  readOnly?: boolean;
}

export class SuspendDto {
  @IsBoolean()
  isSuspended!: boolean;

  @IsString()
  @MinLength(4)
  reason!: string;
}

export class ResetPasswordDto {
  /** If omitted, a temporary password is generated and returned once. */
  @IsOptional()
  @IsString()
  @MinLength(8)
  newPassword?: string;

  @IsString()
  @MinLength(4)
  reason!: string;

  @IsOptional()
  @IsBoolean()
  revokeSessions?: boolean;
}

export class BulkSuspendDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  userIds!: string[];

  @IsBoolean()
  isSuspended!: boolean;

  @IsString()
  @MinLength(4)
  reason!: string;
}

export class UserNoteDto {
  @IsString()
  @MinLength(2)
  body!: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  priority?: string;
}

export class UserTagDto {
  @IsString()
  @MinLength(2)
  label!: string;
}

export class LoginLinkDto {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  expiresInMinutes?: number;

  @IsOptional()
  @IsBoolean()
  singleUse?: boolean;
}

export class UserArchiveDto {
  @IsString()
  @MinLength(4)
  reason!: string;

  @IsOptional()
  @IsBoolean()
  unarchive?: boolean;
}

export class UserAnonymizeDto {
  @IsString()
  @MinLength(4)
  reason!: string;

  @IsString()
  @MinLength(4)
  confirmName!: string;
}

export class UserDeleteDto {
  @IsString()
  @MinLength(4)
  reason!: string;

  @IsString()
  @MinLength(4)
  confirmName!: string;
}

export class RefundDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  amount?: number;

  @IsString()
  @MinLength(4)
  reason!: string;

  @IsOptional()
  @IsString()
  internalNote?: string;
}

export class FareRuleDto {
  @IsString()
  serviceType!: string;

  @IsOptional()
  @IsString()
  vehicleClass?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @Type(() => Number)
  @IsNumber()
  baseFare!: number;

  @Type(() => Number)
  @IsNumber()
  perKm!: number;

  @Type(() => Number)
  @IsNumber()
  perMinute!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  perHour?: number;

  @Type(() => Number)
  @IsNumber()
  minFare!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minBidMultiplier?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxBidMultiplier?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  platformCommissionPct?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  taxPct?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CaseCreateDto {
  @IsString()
  @MinLength(3)
  title!: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  passengerProfileId?: string;

  @IsOptional()
  @IsString()
  driverProfileId?: string;

  @IsOptional()
  @IsString()
  rideId?: string;

  @IsOptional()
  @IsString()
  paymentId?: string;
}

export class BroadcastDto {
  @IsString()
  channel!: string;

  @IsString()
  segment!: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  body!: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  templateKey?: string;
}
