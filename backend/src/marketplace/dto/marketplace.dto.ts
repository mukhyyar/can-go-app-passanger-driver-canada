import {

  IsArray,

  IsIn,

  IsInt,

  IsNumber,

  IsOptional,

  IsString,

  Matches,

  Max,

  Min,

  MinLength,

  ValidateIf,

} from 'class-validator';

import { Type } from 'class-transformer';



/** Phase 3 expands beyond RIDE + PER_HOUR. */

export const MARKETPLACE_SERVICE_TYPES = [

  'RIDE',

  'PER_HOUR',

  'DELIVERY',

  'CAR_RENTAL',

  'EXPERIENCES',

] as const;



const POINT_TO_POINT = ['RIDE', 'DELIVERY'] as const;



export class PricingQuoteDto {

  @IsIn([...MARKETPLACE_SERVICE_TYPES])

  serviceType!: (typeof MARKETPLACE_SERVICE_TYPES)[number];



  @IsNumber()

  @Type(() => Number)

  fromLat!: number;



  @IsNumber()

  @Type(() => Number)

  fromLng!: number;



  @ValidateIf((o: PricingQuoteDto) =>

    (POINT_TO_POINT as readonly string[]).includes(o.serviceType),

  )

  @IsNumber()

  @Type(() => Number)

  toLat?: number;



  @ValidateIf((o: PricingQuoteDto) =>

    (POINT_TO_POINT as readonly string[]).includes(o.serviceType),

  )

  @IsNumber()

  @Type(() => Number)

  toLng?: number;



  @IsOptional()

  @IsString()

  vehicleClass?: string;



  @IsOptional()

  @IsString()

  currency?: string;



  /** Hours for PER_HOUR; days for CAR_RENTAL when days omitted */

  @IsOptional()

  @Type(() => Number)

  @IsNumber()

  @Min(1)

  @Max(720)

  hours?: number;



  /** Rental duration in days */

  @IsOptional()

  @Type(() => Number)

  @IsNumber()

  @Min(1)

  @Max(90)

  days?: number;



  @IsOptional()

  @IsString()

  catalogItemId?: string;



  @IsOptional()

  vip?: boolean;

}



export class CreateRideDto {

  @IsIn([...MARKETPLACE_SERVICE_TYPES])

  serviceType!: (typeof MARKETPLACE_SERVICE_TYPES)[number];



  @IsString()

  @MinLength(1)

  fromLabel!: string;



  @IsOptional()

  @IsString()

  toLabel?: string;



  @IsNumber()

  @Type(() => Number)

  fromLat!: number;



  @IsNumber()

  @Type(() => Number)

  fromLng!: number;



  @ValidateIf((o: CreateRideDto) =>

    (POINT_TO_POINT as readonly string[]).includes(o.serviceType),

  )

  @IsNumber()

  @Type(() => Number)

  toLat?: number;



  @ValidateIf((o: CreateRideDto) =>

    (POINT_TO_POINT as readonly string[]).includes(o.serviceType),

  )

  @IsNumber()

  @Type(() => Number)

  toLng?: number;



  @IsString()

  @Matches(/^\d{4}-\d{2}-\d{2}T/)

  pickupAt!: string;



  @IsArray()

  @IsString({ each: true })

  vehicleClassIds!: string[];



  @IsOptional()

  @Type(() => Number)

  @IsInt()

  @Min(1)

  @Max(20)

  adults?: number;



  @IsOptional()

  childSeatsJson?: Record<string, unknown>;



  @IsOptional()

  @IsString()

  flight?: string;



  @IsOptional()

  @IsString()

  signage?: string;



  @IsOptional()

  @IsString()

  comment?: string;



  @IsOptional()

  @IsString()

  promoCode?: string;



  @IsOptional()

  @IsString()

  currency?: string;



  @IsOptional()

  @Type(() => Number)

  @IsNumber()

  @Min(1)

  @Max(720)

  hours?: number;



  @IsOptional()

  @Type(() => Number)

  @IsNumber()

  @Min(1)

  @Max(90)

  days?: number;



  @IsOptional()

  @IsString()

  catalogItemId?: string;

}



export class CreateOfferDto {

  @Type(() => Number)

  @IsNumber()

  @Min(1)

  bidAmount!: number;



  @IsOptional()

  @IsString()

  currency?: string;



  @IsOptional()

  @IsString()

  vehicleId?: string;

}



export class CreatePaymentIntentDto {

  @IsString()

  rideId!: string;



  @IsOptional()

  @IsString()

  idempotencyKey?: string;

}



export class SelectOfferDto {

  @IsString()

  offerId!: string;

}


