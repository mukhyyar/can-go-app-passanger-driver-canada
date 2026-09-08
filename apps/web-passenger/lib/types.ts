export type ServiceType = 'RIDE' | 'PER_HOUR' | 'DELIVERY';

export type Place = {
  id: string;
  label: string;
  subtitle?: string;
  lat: number;
  lng: number;
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

export type ChildSeats = { infant: number; child: number; booster: number };

export type RideOffer = {
  id: string;
  status?: string;
  bidAmount?: number;
  currency?: string;
  vehicleClass?: string;
  priceSnapshot?: { passengerTotal?: number; bidAmount?: number };
  driver?: { fullName?: string | null };
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
  vehicleClassIds?: string[];
  adults?: number;
  requestExpiresAt?: string;
  offers?: RideOffer[];
  selectedOfferId?: string | null;
};
