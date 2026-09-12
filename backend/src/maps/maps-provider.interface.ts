export type GeocodeResult = {
  label: string;
  lat: number;
  lng: number;
  provider: string;
};

export type PlaceSuggestion = {
  id: string;
  label: string;
  subtitle?: string;
  /** Present after place-details; may be 0 for autocomplete-only rows. */
  lat: number;
  lng: number;
  placeId?: string;
  provider: string;
};

export type PlacesSearchOpts = {
  lat?: number;
  lng?: number;
  sessionToken?: string;
  languageCode?: string;
};

export type RouteGeometry = {
  type: 'LineString';
  /** GeoJSON order: [lng, lat][] */
  coordinates: [number, number][];
};

export type RouteResult = {
  distanceKm: number;
  durationMin: number;
  provider: string;
  geometry?: RouteGeometry;
};

export interface MapsProvider {
  readonly name: string;
  geocode(query: string): Promise<GeocodeResult[]>;
  reverseGeocode(lat: number, lng: number): Promise<GeocodeResult | null>;
  places?(
    query: string,
    limit?: number,
    opts?: PlacesSearchOpts,
  ): Promise<PlaceSuggestion[]>;
  placeDetails?(
    placeId: string,
    opts?: { sessionToken?: string; languageCode?: string },
  ): Promise<PlaceSuggestion | null>;
  route?(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
  ): Promise<RouteResult>;
}

export const MAPS_PROVIDER = Symbol('MAPS_PROVIDER');
