/** Demo fleet routes — Vaughan / VMC road network (OSM-aligned waypoints). */

export type FleetStatus = 'available' | 'trip' | 'pending';

export type LatLng = [number, number];

export type FleetRoute = {
  id: string;
  /** Ordered lat/lng points following real streets. */
  points: LatLng[];
  loop: boolean;
};

export type FleetVehicle = {
  id: string;
  code: string;
  model: string;
  driver: string;
  status: FleetStatus;
  routeId: string;
  /** Metres per second along route. 0 = parked. */
  speedMps: number;
  /** Phase offset 0–1 along route at t=0. */
  phase: number;
  /** Show trip polyline (red vehicles only). */
  showTripPath?: boolean;
  /** Optional fixed park position (overrides route motion). */
  parkedAt?: LatLng;
  parkedHeading?: number;
};

export type FleetPosition = {
  id: string;
  lat: number;
  lng: number;
  heading: number;
  speedKmh: number;
  status: FleetStatus;
};

/** Map camera — Vaughan Metropolitan Centre / Jane & Hwy 7. */
export const FLEET_MAP_CENTER: LatLng = [43.7995, -79.529];
export const FLEET_MAP_ZOOM = 14;

/**
 * Road-following loops assembled from OSM Jane St, Hwy 7, Portage,
 * Millway, Edgeley, Applewood, Creditstone, Interchange Way.
 */
export const DEMO_ROUTES: FleetRoute[] = [
  {
    id: 'jane-loop',
    loop: true,
    points: [
      [43.7882, -79.524],
      [43.7901, -79.5239],
      [43.7918, -79.524],
      [43.7935, -79.5244],
      [43.7942, -79.5246],
      [43.7953, -79.5247],
      [43.7965, -79.5249],
      [43.7979, -79.5252],
      [43.7989, -79.5255],
      [43.8004, -79.5258],
      [43.8018, -79.5261],
      [43.8027, -79.5263],
      [43.8037, -79.5265],
      [43.805, -79.5268],
      [43.8063, -79.5271],
      [43.8077, -79.5274],
      [43.809, -79.5277],
      [43.8094, -79.5278],
      // Applewood east → Edgeley south return
      [43.8093, -79.5309],
      [43.809, -79.5335],
      [43.808, -79.5364],
      [43.807, -79.536],
      [43.8051, -79.5355],
      [43.8033, -79.5351],
      [43.8014, -79.5345],
      [43.7997, -79.5338],
      [43.7981, -79.5331],
      [43.7969, -79.5327],
      [43.7958, -79.5322],
      [43.7948, -79.5318],
      // Interchange Way east → Jane
      [43.7926, -79.5309],
      [43.7915, -79.5288],
      [43.7905, -79.527],
      [43.7895, -79.525],
      [43.7895, -79.524],
      [43.7882, -79.524],
    ],
  },
  {
    id: 'hwy7-creditstone',
    loop: true,
    points: [
      [43.7923, -79.536],
      [43.7923, -79.5337],
      [43.7925, -79.5315],
      [43.793, -79.5285],
      [43.7936, -79.5265],
      [43.7942, -79.5246],
      [43.7946, -79.523],
      [43.7949, -79.5215],
      [43.7954, -79.5192],
      [43.7956, -79.5177],
      // Creditstone north
      [43.7968, -79.5181],
      [43.7982, -79.5184],
      [43.7999, -79.5188],
      [43.8017, -79.5192],
      [43.8032, -79.5196],
      [43.8048, -79.5197],
      [43.8063, -79.5197],
      [43.8079, -79.520],
      // west via Applewood to Edgeley, south to Hwy 7
      [43.809, -79.5278],
      [43.809, -79.5309],
      [43.8085, -79.5335],
      [43.808, -79.5364],
      [43.8064, -79.5359],
      [43.8042, -79.5354],
      [43.8021, -79.5348],
      [43.8002, -79.534],
      [43.7981, -79.5331],
      [43.7963, -79.5324],
      [43.7948, -79.5318],
      [43.7935, -79.5335],
      [43.7925, -79.535],
      [43.7923, -79.536],
    ],
  },
  {
    id: 'portage-millway',
    loop: true,
    points: [
      [43.7948, -79.5412],
      [43.7955, -79.5395],
      [43.7962, -79.5367],
      [43.7969, -79.5332],
      [43.7976, -79.5298],
      [43.7983, -79.5255],
      // Millway north
      [43.7995, -79.5272],
      [43.801, -79.528],
      [43.8025, -79.5286],
      [43.804, -79.5292],
      [43.8055, -79.5297],
      // Edgeley south-west then Portage return
      [43.8065, -79.5359],
      [43.805, -79.5355],
      [43.803, -79.5351],
      [43.801, -79.5343],
      [43.799, -79.5335],
      [43.7975, -79.5329],
      [43.7965, -79.535],
      [43.7958, -79.5381],
      [43.7948, -79.5412],
    ],
  },
  {
    id: 'trip-a',
    loop: true,
    points: [
      // Pickup near VMC / Millway
      [43.7942, -79.527],
      [43.7942, -79.5246],
      [43.7953, -79.5247],
      [43.7965, -79.5249],
      [43.7979, -79.5252],
      [43.7995, -79.5256],
      [43.801, -79.5259],
      [43.8027, -79.5263],
      [43.8045, -79.5267],
      [43.8063, -79.5271],
      [43.808, -79.5275],
      [43.8094, -79.5278],
      // Destination Applewood / Edgeley
      [43.8092, -79.530],
      [43.809, -79.5325],
      [43.8082, -79.5355],
      [43.807, -79.536],
      [43.8055, -79.5356],
      [43.8035, -79.5352],
      [43.8015, -79.5345],
      [43.7995, -79.5337],
      [43.7975, -79.5329],
      [43.7958, -79.5322],
      [43.7945, -79.5305],
      [43.7942, -79.5285],
      [43.7942, -79.527],
    ],
  },
  {
    id: 'trip-b',
    loop: true,
    points: [
      // Hwy 7 west → Jane → Creditstone corridor
      [43.7923, -79.535],
      [43.7925, -79.531],
      [43.7935, -79.527],
      [43.7942, -79.5246],
      [43.7948, -79.522],
      [43.7955, -79.5185],
      [43.7956, -79.5177],
      [43.7975, -79.5182],
      [43.7995, -79.5187],
      [43.8015, -79.5192],
      [43.8035, -79.5196],
      [43.8055, -79.5197],
      [43.8075, -79.52],
      [43.809, -79.5203],
      // return Jane south
      [43.8094, -79.5278],
      [43.807, -79.5273],
      [43.8045, -79.5267],
      [43.802, -79.5262],
      [43.7995, -79.5256],
      [43.797, -79.525],
      [43.7945, -79.5246],
      [43.793, -79.528],
      [43.7923, -79.532],
      [43.7923, -79.535],
    ],
  },
  {
    id: 'applewood-crawl',
    loop: true,
    points: [
      [43.7977, -79.537],
      [43.7994, -79.5377],
      [43.8015, -79.5381],
      [43.8036, -79.5386],
      [43.8056, -79.5391],
      [43.8072, -79.5394],
      [43.8078, -79.5375],
      [43.808, -79.5364],
      [43.8085, -79.5335],
      [43.809, -79.5309],
      [43.8094, -79.5278],
      [43.808, -79.5275],
      [43.806, -79.527],
      [43.804, -79.529],
      [43.802, -79.5348],
      [43.8, -79.5378],
      [43.7985, -79.5374],
      [43.7977, -79.537],
    ],
  },
];

export const DEMO_VEHICLES: FleetVehicle[] = [
  {
    id: 'v1',
    code: 'CNG-104',
    model: 'Toyota Camry',
    driver: 'A. Patel',
    status: 'available',
    routeId: 'jane-loop',
    speedMps: 11.5,
    phase: 0.05,
  },
  {
    id: 'v2',
    code: 'CNG-118',
    model: 'Honda Civic',
    driver: 'M. Chen',
    status: 'available',
    routeId: 'hwy7-creditstone',
    speedMps: 13.2,
    phase: 0.22,
  },
  {
    id: 'v3',
    code: 'CNG-221',
    model: 'Hyundai Elantra',
    driver: 'S. Khan',
    status: 'available',
    routeId: 'portage-millway',
    speedMps: 10.4,
    phase: 0.41,
  },
  {
    id: 'v4',
    code: 'CNG-307',
    model: 'Toyota Corolla',
    driver: 'J. Singh',
    status: 'available',
    routeId: 'jane-loop',
    speedMps: 9.8,
    phase: 0.63,
  },
  {
    id: 'v5',
    code: 'CNG-412',
    model: 'Kia Forte',
    driver: 'L. Nguyen',
    status: 'available',
    routeId: 'hwy7-creditstone',
    speedMps: 12.1,
    phase: 0.78,
  },
  {
    id: 'v6',
    code: 'CNG-508',
    model: 'Mazda 3',
    driver: 'R. Alvarez',
    status: 'trip',
    routeId: 'trip-a',
    speedMps: 12.8,
    phase: 0.12,
    showTripPath: true,
  },
  {
    id: 'v7',
    code: 'CNG-519',
    model: 'VW Jetta',
    driver: 'K. Okafor',
    status: 'trip',
    routeId: 'trip-b',
    speedMps: 11.2,
    phase: 0.55,
    showTripPath: true,
  },
  {
    id: 'v8',
    code: 'CNG-601',
    model: 'Nissan Sentra',
    driver: 'Pending KYC',
    status: 'pending',
    routeId: 'applewood-crawl',
    speedMps: 3.2,
    phase: 0.3,
  },
  {
    id: 'v9',
    code: 'CNG-614',
    model: 'Chevy Malibu',
    driver: 'Docs review',
    status: 'pending',
    routeId: 'portage-millway',
    speedMps: 0,
    phase: 0,
    parkedAt: [43.7984, -79.5332],
    parkedHeading: 28,
  },
  {
    id: 'v10',
    code: 'CNG-622',
    model: 'Ford Focus',
    driver: 'Awaiting ID',
    status: 'pending',
    routeId: 'applewood-crawl',
    speedMps: 0,
    phase: 0,
    parkedAt: [43.7952, -79.5385],
    parkedHeading: 195,
  },
  {
    id: 'v11',
    code: 'CNG-140',
    model: 'Toyota Prius',
    driver: 'D. Rossi',
    status: 'available',
    routeId: 'portage-millway',
    speedMps: 8.6,
    phase: 0.88,
  },
  {
    id: 'v12',
    code: 'CNG-155',
    model: 'Honda Accord',
    driver: 'E. Park',
    status: 'available',
    routeId: 'jane-loop',
    speedMps: 10.9,
    phase: 0.34,
  },
];

export const STATUS_COLORS: Record<FleetStatus, string> = {
  available: '#2ea44f',
  trip: '#b41b1d',
  pending: '#f59e0b',
};

export function statusLabel(status: FleetStatus): string {
  switch (status) {
    case 'available':
      return 'Available';
    case 'trip':
      return 'On trip';
    case 'pending':
      return 'Pending KYC';
  }
}

export function fleetCounts(vehicles: FleetVehicle[]) {
  return {
    total: vehicles.length,
    available: vehicles.filter((v) => v.status === 'available').length,
    trip: vehicles.filter((v) => v.status === 'trip').length,
    pending: vehicles.filter((v) => v.status === 'pending').length,
  };
}

export function routeById(id: string): FleetRoute | undefined {
  return DEMO_ROUTES.find((r) => r.id === id);
}
