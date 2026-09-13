export type ServiceType = 'RIDE' | 'PER_HOUR' | 'DELIVERY';

export type Place = {
  id: string;
  label: string;
  subtitle?: string;
  lat: number;
  lng: number;
  placeId?: string;
};

export type Tokens = { accessToken: string; refreshToken: string | null };

export type AuthUser = {
  id: string;
  email?: string;
  fullName?: string | null;
  phoneE164?: string | null;
  role?: string;
  passenger?: { fullName?: string; isVip?: boolean } | null;
  driver?: { fullName?: string } | null;
  impersonation?: {
    enabled: boolean;
    by?: string;
    sessionId?: string;
    readOnly: boolean;
  };
};

export type ChildSeats = {
  infant: number;
  convertible: number;
  booster: number;
};

export type OfferPresentation = {
  vehicleDisplayName?: string;
  brand?: string;
  model?: string;
  year?: number | null;
  vehicleClass?: string;
  passengers?: number;
  baggage?: number;
  imageUrl?: string | null;
  amenities?: Array<{ key: string; label: string }>;
  languages?: string[];
  carrierId?: string;
  passengerTotal?: number;
  rating?: {
    overall?: number;
    count?: number;
    completedRides?: number;
    yearsWithPlatform?: number;
  };
  priceBreakdown?: {
    ridePrice?: number;
    marketplaceFee?: number;
    taxes?: number;
    total?: number;
    currency?: string;
    includesNote?: string;
  };
};

export type RideOffer = {
  id: string;
  status?: string;
  bidAmount?: number;
  currency?: string;
  vehicleClass?: string;
  vehicleId?: string | null;
  driverId?: string;
  priceSnapshot?: { passengerTotal?: number; bidAmount?: number };
  driver?: { fullName?: string | null; id?: string };
  vehicle?: { name?: string; vehicleClass?: string } | null;
  presentation?: OfferPresentation;
};

export type Ride = {
  id: string;
  status: string;
  serviceType?: string;
  fromLabel?: string;
  toLabel?: string | null;
  fromLat?: number;
  fromLng?: number;
  toLat?: number | null;
  toLng?: number | null;
  pickupAt?: string;
  returnAt?: string | null;
  isRoundTrip?: boolean;
  vehicleClassIds?: string[];
  adults?: number;
  flight?: string | null;
  signage?: string | null;
  comment?: string | null;
  currency?: string;
  canEdit?: boolean;
  canCancel?: boolean;
  requestExpiresAt?: string;
  paymentExpiresAt?: string;
  viewCount?: number;
  offerCount?: number;
  shortId?: string;
  offers?: RideOffer[];
  selectedOfferId?: string | null;
  priceSnapshot?: {
    distanceKm?: number;
    durationMin?: number;
    passengerTotal?: number;
  };
};

export type PaymentQuote = {
  paymentMode: 'FULL' | 'PARTIAL';
  totalAmount: number;
  totalCurrency: string;
  onlineAmount: number;
  onlineCurrency: string;
  cashAmount: number;
  cashCurrency: string;
  partialEnabled?: boolean;
};

export function friendlyRideStatus(status?: string): string {
  switch ((status ?? '').toUpperCase()) {
    case 'WAITING_FOR_OFFERS':
      return 'Please wait for offers';
    case 'OFFER_SELECTION':
      return 'Please choose offer and book';
    case 'PAYMENT_PENDING':
      return 'Payment pending';
    case 'BOOKED':
      return 'Booked';
    case 'COMPLETED':
      return 'Completed';
    default:
      if ((status ?? '').includes('CANCEL')) return 'Cancelled';
      return status?.replaceAll('_', ' ') ?? 'Unknown';
  }
}

export function formatMoney(amount?: number | null, currency = 'USD'): string {
  if (amount == null || Number.isNaN(amount)) return '—';
  const code = currency.toUpperCase();
  const prefix =
    code === 'CAD' ? 'CA$' : code === 'USD' ? 'US$' : code === 'EUR' ? '€' : `${code} `;
  const rounded = Math.round(amount * 100) / 100;
  const text =
    rounded === Math.floor(rounded)
      ? rounded.toLocaleString('en-US')
      : rounded.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
  return `${prefix}${text}`;
}
