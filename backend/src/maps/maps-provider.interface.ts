export type GeocodeResult = {
  label: string;
  lat: number;
  lng: number;
  provider: string;
};

export type RouteResult = {
  distanceKm: number;
  durationMin: number;
  provider: string;
  geometry?: unknown;
};

export interface MapsProvider {
  readonly name: string;
  geocode(query: string): Promise<GeocodeResult[]>;
  reverseGeocode(lat: number, lng: number): Promise<GeocodeResult | null>;
  route?(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
  ): Promise<RouteResult>;
}

export const MAPS_PROVIDER = Symbol('MAPS_PROVIDER');
