import type { Place } from './types';
import { API_BASE } from './api';

type MapsPlace = {
  id?: string;
  label?: string;
  subtitle?: string;
  lat?: number;
  lng?: number;
  placeId?: string;
};

export type PlaceSearchOpts = {
  limit?: number;
  lat?: number;
  lng?: number;
  sessionToken?: string;
  languageCode?: string;
};

function mapPlace(p: MapsPlace): Place | null {
  const label = typeof p.label === 'string' ? p.label.trim() : '';
  if (!label) return null;
  const placeId =
    typeof p.placeId === 'string' && p.placeId.trim() ? p.placeId.trim() : undefined;
  const lat = Number(p.lat);
  const lng = Number(p.lng);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
  if (!hasCoords && !placeId) return null;
  return {
    id: (p.id || placeId || `geo-${lat}-${lng}`).toString(),
    label,
    subtitle: typeof p.subtitle === 'string' ? p.subtitle : undefined,
    lat: hasCoords ? lat : 0,
    lng: hasCoords ? lng : 0,
    placeId,
  };
}

/** UUID-like token for Google Places Autocomplete sessions. */
export function newPlacesSessionToken(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function searchPlaces(
  query: string,
  limitOrOpts: number | PlaceSearchOpts = 8,
): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const opts: PlaceSearchOpts =
    typeof limitOrOpts === 'number' ? { limit: limitOrOpts } : limitOrOpts;
  const limit = opts.limit ?? 8;
  const url = new URL(`${API_BASE}/maps/places`);
  url.searchParams.set('q', q);
  url.searchParams.set('limit', String(limit));
  if (opts.lat != null && opts.lng != null && Number.isFinite(opts.lat) && Number.isFinite(opts.lng)) {
    url.searchParams.set('lat', String(opts.lat));
    url.searchParams.set('lng', String(opts.lng));
  }
  if (opts.sessionToken) url.searchParams.set('sessionToken', opts.sessionToken);
  if (opts.languageCode) url.searchParams.set('languageCode', opts.languageCode);
  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Place search failed (${res.status})`);
  const body = (await res.json()) as MapsPlace[];
  if (!Array.isArray(body)) return [];
  const out: Place[] = [];
  for (const p of body) {
    const mapped = mapPlace(p);
    if (mapped) out.push(mapped);
  }
  return out;
}

export async function resolvePlaceDetails(
  place: Place,
  opts?: { sessionToken?: string },
): Promise<Place | null> {
  if (placeHasCoords(place)) return place;
  const placeId = place.placeId?.trim();
  if (!placeId) return null;
  const url = new URL(`${API_BASE}/maps/place-details`);
  url.searchParams.set('placeId', placeId);
  if (opts?.sessionToken) url.searchParams.set('sessionToken', opts.sessionToken);
  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  const body = (await res.json()) as MapsPlace;
  const mapped = mapPlace(body);
  if (!mapped || !placeHasCoords(mapped)) return null;
  // Prefer autocomplete main/secondary text when present.
  return {
    ...mapped,
    label: place.label || mapped.label,
    subtitle: place.subtitle ?? mapped.subtitle,
  };
}

export function placeHasCoords(p: Place): boolean {
  return Number.isFinite(p.lat) && Number.isFinite(p.lng) && (p.lat !== 0 || p.lng !== 0);
}

/** Search + resolve first hit (for hydrating book page from query labels). */
export async function searchAndResolvePlace(
  query: string,
  opts?: PlaceSearchOpts,
): Promise<Place | null> {
  const sessionToken = opts?.sessionToken ?? newPlacesSessionToken();
  const hits = await searchPlaces(query, { ...opts, limit: opts?.limit ?? 1, sessionToken });
  if (!hits.length) return null;
  return resolvePlaceDetails(hits[0], { sessionToken });
}
