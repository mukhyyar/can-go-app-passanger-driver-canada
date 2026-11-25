import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export enum FinancialSummaryType {
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY',
}

export class RequestFinancialSummaryDto {
  @IsEnum(FinancialSummaryType)
  type!: FinancialSummaryType;

  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  year!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;
}
