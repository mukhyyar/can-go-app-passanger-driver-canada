import {

  IsArray,

  IsBoolean,

  IsIn,

  IsInt,

  IsNumber,

  IsOptional,

  IsString,

  Matches,

  Max,

  MaxLength,

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
  returnFlight?: string;

  @IsOptional()
  @IsString()
  signage?: string;



  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsBoolean()
  isRoundTrip?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T/)
  returnAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(240)
  pickupWaitMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(240)
  returnWaitMin?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredOptions?: string[];

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

/** Partial passenger edit while ride is still open for offers. */
export class UpdateRideDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  fromLabel?: string;

  @IsOptional()
  @IsString()
  toLabel?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  fromLat?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  fromLng?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  toLat?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  toLng?: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T/)
  pickupAt?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  vehicleClassIds?: string[];

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
  returnFlight?: string;

  @IsOptional()
  @IsString()
  signage?: string;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsBoolean()
  isRoundTrip?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T/)
  returnAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(240)
  pickupWaitMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(240)
  returnWaitMin?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredOptions?: string[];

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
  /**
   * Combined passenger-facing bid. Optional when outboundPrice is provided.
   * For round-trips prefer outboundPrice + returnPrice.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  bidAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  outboundPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  returnPrice?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  vehicleId?: string;

  /** Validity window in seconds — must be one of OFFER_VALIDITY_OPTIONS_SECONDS. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(60)
  validForSeconds?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedOptions?: string[];

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class UpdateOfferDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  outboundPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  returnPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  bidAmount?: number;

  @IsOptional()
  @IsString()
  vehicleId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(60)
  validForSeconds?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedOptions?: string[];

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class CreatePaymentIntentDto {
  @IsString()
  rideId!: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  /** FULL | PARTIAL — backend computes amounts; client must not send charge amounts. */
  @IsOptional()
  @IsIn(['FULL', 'PARTIAL'])
  paymentMode?: 'FULL' | 'PARTIAL';

  @IsOptional()
  @IsIn(['GOOGLE_PAY', 'APPLE_PAY', 'CARD'])
  paymentMethod?: 'GOOGLE_PAY' | 'APPLE_PAY' | 'CARD';

  @IsOptional()
  @IsString()
  termsVersion?: string;

  @IsOptional()
  @IsString()
  policyVersion?: string;

  @IsOptional()
  @IsBoolean()
  termsAccepted?: boolean;

  @IsOptional()
  @IsString()
  platform?: string;
}

export class SelectOfferDto {
  @IsString()
  offerId!: string;
}

export class PaymentQuoteDto {
  @IsString()
  rideId!: string;

  @IsString()
  offerId!: string;

  @IsOptional()
  @IsIn(['FULL', 'PARTIAL'])
  paymentMode?: 'FULL' | 'PARTIAL';

  @IsOptional()
  @IsString()
  platform?: string;
}

export class ValidateBookDto {
  @IsString()
  offerId!: string;
}

export const CHANGE_REQUEST_TYPES = [
  'FLIGHT_DELAY',
  'RESCHEDULE',
  'BILLING_HELP',
  'REFUND_REQUEST',
  'CURRENT_RIDE_HELP',
  'LOST_ITEM',
] as const;

export class CreateChangeRequestDto {
  @IsIn([...CHANGE_REQUEST_TYPES])
  type!: (typeof CHANGE_REQUEST_TYPES)[number];

  @IsOptional()
  @IsString()
  proposedPickupAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsOptional()
  @IsString()
  flightNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  contactPhone?: string;
}


