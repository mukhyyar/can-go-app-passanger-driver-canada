import type { Place } from './types';
import { API_BASE } from './api';

/**
 * Browser-side Google Places (New) via the Maps JavaScript API `places` library.
 *
 * Website-only: this talks to Google directly with the HTTP-referrer restricted
 * browser key (same key the booking map preview uses), so suggestions match
 * Google Maps exactly (ranking, wording, bolded matches).
 *
 * Canada only (`includedRegionCodes: ['ca']`) and NO location bias of any kind —
 * a visitor booking from any country sees the same Canadian results.
 */

const PUBLIC_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
const REGION_CODES = ['ca'];
const LANGUAGE = 'en';

// ---- Minimal Maps JS typings (no @types/google.maps dependency) ----

type GLatLng = { lat: () => number; lng: () => number };

type GStringRange = { startOffset: number; endOffset: number };

type GFormattableText = { text: string; matches?: GStringRange[] | null };

type GPlace = {
  id?: string;
  location?: GLatLng | null;
  formattedAddress?: string | null;
  displayName?: string | null;
  fetchFields: (opts: { fields: string[] }) => Promise<unknown>;
};

type GPlacePrediction = {
  placeId: string;
  text?: GFormattableText | null;
  mainText?: GFormattableText | null;
  secondaryText?: GFormattableText | null;
  toPlace: () => GPlace;
};

type GAutocompleteSuggestion = { placePrediction?: GPlacePrediction | null };

type GAutocompleteSessionToken = object;

type GPlacesLibrary = {
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions: (req: {
      input: string;
      sessionToken?: GAutocompleteSessionToken;
      language?: string;
      region?: string;
      includedRegionCodes?: string[];
    }) => Promise<{ suggestions: GAutocompleteSuggestion[] }>;
  };
  AutocompleteSessionToken: new () => GAutocompleteSessionToken;
  Place: new (opts: {
    id: string;
    sessionToken?: GAutocompleteSessionToken;
    requestedLanguage?: string;
  }) => GPlace;
};

type MapsWindow = Window & {
  google?: { maps?: { importLibrary?: (name: string) => Promise<unknown> } };
  __cangoMapsJsPromise?: Promise<void>;
};

function win(): MapsWindow | null {
  return typeof window === 'undefined' ? null : (window as unknown as MapsWindow);
}

// ---- Key + script loading (shares the loader contract of map-preview.tsx) ----

let keyPromise: Promise<string> | null = null;

async function resolveBrowserKey(): Promise<string> {
  if (PUBLIC_MAPS_KEY.trim()) return PUBLIC_MAPS_KEY.trim();
  if (!keyPromise) {
    keyPromise = (async () => {
      try {
        const res = await fetch(`${API_BASE}/maps/browser-config`, {
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) return '';
        const body = (await res.json()) as { apiKey?: string | null };
        return typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
      } catch {
        return '';
      }
    })();
  }
  return keyPromise;
}

/** Same dedupe contract as `loadMapsJs` in components/map-preview.tsx. */
function loadMapsJs(apiKey: string): Promise<void> {
  const w = win();
  if (!w) return Promise.resolve();
  if (w.google?.maps) return Promise.resolve();
  if (w.__cangoMapsJsPromise) return w.__cangoMapsJsPromise;
  w.__cangoMapsJsPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(
      'script[data-cango-maps="1"]',
    ) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Maps JS failed')), {
        once: true,
      });
      return;
    }
    const s = document.createElement('script');
    s.dataset.cangoMaps = '1';
    s.async = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Maps JS failed to load'));
    document.head.appendChild(s);
  });
  return w.__cangoMapsJsPromise;
}

let placesLibPromise: Promise<GPlacesLibrary> | null = null;

/** Loads Maps JS (if needed) and imports the `places` library. Rejects when unavailable. */
function getPlacesLibrary(): Promise<GPlacesLibrary> {
  if (placesLibPromise) return placesLibPromise;
  placesLibPromise = (async () => {
    const w = win();
    if (!w) throw new Error('No window');
    const key = await resolveBrowserKey();
    if (!key) throw new Error('No browser Maps key');
    await loadMapsJs(key);
    const importLibrary = w.google?.maps?.importLibrary;
    if (!importLibrary) throw new Error('Maps JS importLibrary unavailable');
    const lib = (await importLibrary('places')) as Partial<GPlacesLibrary>;
    if (
      !lib?.AutocompleteSuggestion?.fetchAutocompleteSuggestions ||
      !lib.AutocompleteSessionToken ||
      !lib.Place
    ) {
      throw new Error('Places library incomplete');
    }
    return lib as GPlacesLibrary;
  })();
  // Allow a retry on a later call if this attempt failed (e.g. transient network).
  placesLibPromise.catch(() => {
    placesLibPromise = null;
  });
  return placesLibPromise;
}

// ---- Session tokens: string ids from newPlacesSessionToken() -> Google token objects ----

const sessionTokens = new Map<string, GAutocompleteSessionToken>();
const MAX_TOKENS = 50;

function tokenFor(lib: GPlacesLibrary, id?: string): GAutocompleteSessionToken | undefined {
  if (!id) return undefined;
  let tok = sessionTokens.get(id);
  if (!tok) {
    if (sessionTokens.size >= MAX_TOKENS) {
      const oldest = sessionTokens.keys().next().value;
      if (oldest !== undefined) sessionTokens.delete(oldest);
    }
    tok = new lib.AutocompleteSessionToken();
    sessionTokens.set(id, tok);
  }
  return tok;
}

// ---- Public API ----

function toHighlights(ft?: GFormattableText | null): Array<[number, number]> | undefined {
  const matches = ft?.matches;
  if (!matches || !matches.length) return undefined;
  const out: Array<[number, number]> = [];
  for (const m of matches) {
    const start = Number(m.startOffset ?? 0);
    const end = Number(m.endOffset ?? 0);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      out.push([start, end]);
    }
  }
  return out.length ? out : undefined;
}

/**
 * Google Places Autocomplete (New), Canada only, no location bias.
 * Throws when Maps JS / Places is unavailable so the caller can fall back.
 */
export async function googleAutocomplete(
  input: string,
  opts?: { sessionToken?: string; limit?: number },
): Promise<Place[]> {
  const q = input.trim();
  if (q.length < 2) return [];
  const lib = await getPlacesLibrary();
  const { suggestions } = await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input: q,
    sessionToken: tokenFor(lib, opts?.sessionToken),
    language: LANGUAGE,
    region: REGION_CODES[0],
    includedRegionCodes: REGION_CODES,
  });
  const limit = opts?.limit ?? 8;
  const out: Place[] = [];
  for (const s of suggestions ?? []) {
    const p = s.placePrediction;
    if (!p?.placeId) continue;
    const main = p.mainText?.text?.trim() || p.text?.text?.trim() || '';
    if (!main) continue;
    const secondary = p.secondaryText?.text?.trim() || undefined;
    out.push({
      id: `gplace-${p.placeId}`,
      label: main,
      subtitle: secondary,
      lat: 0,
      lng: 0,
      placeId: p.placeId,
      highlights: toHighlights(p.mainText ?? p.text),
    });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Resolve coordinates for a prediction via Place Details (Maps JS).
 * Passing the same session token closes the Autocomplete billing session.
 * Returns null when details are unavailable; throws when Maps JS itself is unavailable.
 */
export async function googlePlaceDetails(
  place: Place,
  opts?: { sessionToken?: string },
): Promise<Place | null> {
  const placeId = place.placeId?.trim();
  if (!placeId) return null;
  const lib = await getPlacesLibrary();
  const token = tokenFor(lib, opts?.sessionToken);
  const gp = new lib.Place({
    id: placeId,
    sessionToken: token,
    requestedLanguage: LANGUAGE,
  });
  try {
    await gp.fetchFields({ fields: ['location', 'formattedAddress', 'displayName'] });
  } finally {
    if (opts?.sessionToken) sessionTokens.delete(opts.sessionToken);
  }
  const lat = gp.location?.lat();
  const lng = gp.location?.lng();
  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    (lat === 0 && lng === 0)
  ) {
    return null;
  }
  const formatted = gp.formattedAddress?.trim() || undefined;
  const display = gp.displayName?.trim() || undefined;
  return {
    id: `gplace-${placeId}`,
    // Prefer the autocomplete main/secondary text the user clicked on.
    label: place.label || display || formatted || placeId,
    subtitle: place.subtitle ?? formatted,
    lat,
    lng,
    placeId,
  };
}
