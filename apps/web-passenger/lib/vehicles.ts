export type VehicleKind = 'sedan' | 'suv' | 'van' | 'minibus' | 'bus';

export type VehicleClass = {
  id: string;
  name: string;
  fromPrice: string;
  kind: VehicleKind;
  seats: number;
  bags: number;
  blurb: string;
};

export const VEHICLE_CLASSES: VehicleClass[] = [
  {
    id: 'economy',
    name: 'Economy',
    fromPrice: 'from US$22',
    kind: 'sedan',
    seats: 3,
    bags: 2,
    blurb: 'Everyday sedan for airport runs and city hops',
  },
  {
    id: 'comfort',
    name: 'Comfort',
    fromPrice: 'from US$35',
    kind: 'sedan',
    seats: 3,
    bags: 2,
    blurb: 'Roomier sedan with extra ride comfort',
  },
  {
    id: 'business',
    name: 'Business',
    fromPrice: 'from US$61',
    kind: 'sedan',
    seats: 3,
    bags: 3,
    blurb: 'Executive sedan for meetings and arrivals',
  },
  {
    id: 'premium',
    name: 'Premium',
    fromPrice: 'from US$95',
    kind: 'sedan',
    seats: 3,
    bags: 3,
    blurb: 'Flagship sedan with extra space and finish',
  },
  {
    id: 'vip',
    name: 'VIP',
    fromPrice: 'from US$140',
    kind: 'sedan',
    seats: 3,
    bags: 3,
    blurb: 'Top-tier chauffeur car for special occasions',
  },
  {
    id: 'suv',
    name: 'SUV',
    fromPrice: 'from US$75',
    kind: 'suv',
    seats: 5,
    bags: 4,
    blurb: 'High seating, extra luggage, all-weather presence',
  },
  {
    id: 'van',
    name: 'Van',
    fromPrice: 'from US$85',
    kind: 'van',
    seats: 7,
    bags: 6,
    blurb: 'Family and group transfers with room to spare',
  },
  {
    id: 'minibus',
    name: 'Minibus',
    fromPrice: 'from US$110',
    kind: 'minibus',
    seats: 12,
    bags: 10,
    blurb: 'Crews, tours, and larger parties',
  },
  {
    id: 'bus',
    name: 'Bus',
    fromPrice: 'from US$160',
    kind: 'bus',
    seats: 20,
    bags: 16,
    blurb: 'Coach transfers for events and groups',
  },
];

/** Book starts with no class selected — passenger chooses. */
export const DEFAULT_VEHICLE_IDS: string[] = [];

export function vehicleImage(id: string) {
  return `/vehicles/${id}.png`;
}
