import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreateRatingDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  stars!: number;

  /** Passenger→driver only; optional so drivers can rate with overall only. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  communicationStars?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  driverStars?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  vehicleStars?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  comment?: string;
}

export class ModerateRatingDto {
  @IsIn(['VISIBLE', 'HIDDEN', 'PENDING_REVIEW'])
  status!: 'VISIBLE' | 'HIDDEN' | 'PENDING_REVIEW';

  @IsOptional()
  @IsString()
  note?: string;
}
