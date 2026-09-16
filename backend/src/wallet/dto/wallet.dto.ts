import { IsOptional, IsString } from 'class-validator';

export class WithdrawWalletDto {
  /** Decimal string preferred, e.g. "125.50" */
  @IsString()
  amount!: string;

  @IsOptional()
  @IsString()
  currency?: string;
}
