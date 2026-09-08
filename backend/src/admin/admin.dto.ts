import { Type } from 'class-transformer';
import {
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
