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
    fromPrice: 'from CA$22',
    kind: 'sedan',
    seats: 4,
    bags: 2,
    blurb: 'Everyday sedan for airport runs and city hops',
  },
  {
    id: 'comfort',
    name: 'Comfort',
    fromPrice: 'from CA$35',
    kind: 'sedan',
    seats: 4,
    bags: 2,
    blurb: 'Roomier sedan with extra ride comfort',
  },
  {
    id: 'premium',
    name: 'Premium',
    fromPrice: 'from CA$65',
    kind: 'sedan',
    seats: 4,
    bags: 2,
    blurb: 'Flagship sedan with extra space and finish',
  },
  {
    id: 'suv',
    name: 'SUV',
    fromPrice: 'from CA$55',
    kind: 'suv',
    seats: 6,
    bags: 4,
    blurb: 'High seating, extra luggage, all-weather presence',
  },
  {
    id: 'van',
    name: '7-Seater / Minivan',
    fromPrice: 'from CA$85',
    kind: 'van',
    seats: 8,
    bags: 6,
    blurb: 'Family and group transfers with room to spare',
  },
  {
    id: 'luxury',
    name: 'Luxury Vehicle',
    fromPrice: 'from CA$95',
    kind: 'sedan',
    seats: 4,
    bags: 3,
    blurb: 'Executive luxury vehicle for VIP transfers',
  },
  {
    id: 'suv_xl',
    name: 'SUV (XL)',
    fromPrice: 'from CA$75',
    kind: 'suv',
    seats: 8,
    bags: 4,
    blurb: 'Extra-large SUV for family trips and luggage',
  },
  {
    id: 'minibus',
    name: 'Mini bus',
    fromPrice: 'from CA$110',
    kind: 'minibus',
    seats: 25,
    bags: 10,
    blurb: 'Crews, tours, and larger parties',
  },
];

/** Book starts with no class selected — passenger chooses. */
export const DEFAULT_VEHICLE_IDS: string[] = [];

export function vehicleImage(id: string) {
  return `/vehicles/${id}.png`;
}
