import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  GeocodeResult,
  MapsProvider,
  PlaceSuggestion,
  PlacesSearchOpts,
  RouteOption,
  RouteResult,
} from './maps-provider.interface';
import { decodeGooglePolyline } from './polyline';

/** Slots reserved for geocode / text-search hits on address-like queries. */
const ADDRESS_GEOCODE_RESERVED = 3;

/** Canadian street-type abbreviation pairs (short ↔ long). */
const STREET_ABBREV_PAIRS: Array<[string, string]> = [
  ['dr', 'drive'],
  ['st', 'street'],
  ['ave', 'avenue'],
  ['rd', 'road'],
  ['blvd', 'boulevard'],
  ['cres', 'crescent'],
  ['cr', 'crescent'],
  ['mr', 'manor'],
  ['hwy', 'highway'],
  ['crt', 'court'],
  ['ct', 'court'],
  ['pl', 'place'],
  ['pkwy', 'parkway'],
  ['ter', 'terrace'],
  ['tr', 'trail'],
  ['gdn', 'garden'],
  ['gdns', 'gardens'],
];

/** Canonical street-type families for ranking (typed type vs result type). */
const STREET_TYPE_FAMILIES: string[][] = [
  ['dr', 'drive'],
  ['st', 'street'],
  ['ave', 'avenue'],
  ['rd', 'road'],
  ['blvd', 'boulevard'],
  ['cres', 'crescent', 'cr'],
  ['mr', 'manor'],
  ['hwy', 'highway'],
  ['crt', 'court', 'ct'],
  ['pl', 'place'],
  ['pkwy', 'parkway'],
  ['ter', 'terrace'],
  ['tr', 'trail'],
  ['way', 'way'],
  ['lane', 'ln'],
  ['green', 'green'],
  ['point', 'pt'],
  ['square', 'sq'],
  ['heights', 'hts'],
  ['rise', 'rise'],
  ['row', 'row'],
];

type GeocodeOpts = {
  lat?: number;
  lng?: number;
  /** ISO country code for Geocoding `components=country:XX` (e.g. CA). */
  country?: string;
};

/** Google Maps Geocoding + Directions + Places (New). */
@Injectable()
export class GoogleMapsProvider implements MapsProvider {
  readonly name = 'google';
  private readonly key: string | undefined;
  private readonly logger = new Logger(GoogleMapsProvider.name);

  constructor(config: ConfigService) {
    this.key = config.get<string>('maps.googleApiKey');
  }

  private assertKey() {
    if (!this.key) {
      throw new ServiceUnavailableException(
        'GOOGLE_MAPS_API_KEY is required for maps',
      );
    }
  }

  async geocode(
    query: string,
    opts?: GeocodeOpts,
  ): Promise<GeocodeResult[]> {
    this.assertKey();
    const q = query.trim();
    if (!q) return [];
    const uri = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    uri.searchParams.set('address', q);
    uri.searchParams.set('key', this.key!);
    const country = opts?.country?.trim().toUpperCase();
    if (country) {
      uri.searchParams.set('components', `country:${country}`);
    }
    // Viewport bounds are intentionally not applied for address search.
    // Legacy callers may still pass lat/lng; they are ignored for ranking.
    void opts?.lat;
    void opts?.lng;
    try {
      const res = await fetch(uri.toString());
      const data = (await res.json()) as {
        status?: string;
        results?: Array<{
          formatted_address: string;
          place_id?: string;
          geometry: { location: { lat: number; lng: number } };
        }>;
      };
      if (data.status === 'OK' && (data.results?.length ?? 0) > 0) {
        return (data.results ?? []).slice(0, 8).map((r) => ({
          label: r.formatted_address,
          lat: r.geometry.location.lat,
          lng: r.geometry.location.lng,
          placeId: r.place_id,
          provider: this.name,
        }));
      }
    } catch {
      // Google-only: no open-data fallback.
    }
    return [];
  }

  async reverseGeocode(lat: number, lng: number): Promise<GeocodeResult | null> {
    this.assertKey();
    try {
      const uri = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      uri.searchParams.set('latlng', `${lat},${lng}`);
      uri.searchParams.set('key', this.key!);
      const res = await fetch(uri);
      const data = (await res.json()) as {
        status?: string;
        results?: Array<{ formatted_address: string }>;
      };
      const r = data.results?.[0];
      if (r?.formatted_address) {
        return {
          label: r.formatted_address,
          lat,
          lng,
          provider: this.name,
        };
      }
    } catch {
      // Google-only: no open-data fallback.
    }
    return null;
  }

  private looksLikeAddressQuery(q: string): boolean {
    return /\d|[A-Za-z]\d[A-Za-z]|,|st|ave|rd|blvd|dr|way|cres|lane|highway|hwy|manor|mr/i.test(
      q,
    );
  }

  /**
   * Up to 2 query variants: original + one street-abbrev expand/collapse.
   * Example: "35 Masters Dr SE" → also "35 Masters Drive SE".
   */
  private addressQueryVariants(q: string): string[] {
    const original = q.trim();
    if (!original) return [];
    const variants = [original];
    const tokens = original.split(/(\s+|,\s*)/);
    let changed = false;
    const next = tokens.map((tok) => {
      if (!tok || /^\s+$/.test(tok) || tok.startsWith(',')) return tok;
      const bare = tok.replace(/\./g, '');
      const lower = bare.toLowerCase();
      for (const [short, long] of STREET_ABBREV_PAIRS) {
        if (lower === short) {
          changed = true;
          return long.replace(/\b\w/g, (c) => c.toUpperCase());
        }
        if (lower === long) {
          changed = true;
          return short.replace(/\b\w/g, (c) => c.toUpperCase());
        }
      }
      return tok;
    });
    if (changed) {
      const alt = next.join('').replace(/\s+/g, ' ').trim();
      if (alt && alt.toLowerCase() !== original.toLowerCase()) {
        variants.push(alt);
      }
    }
    return variants.slice(0, 2);
  }

  private detectStreetTypeFamily(text: string): string[] | null {
    const tokens = text
      .toLowerCase()
      .replace(/[.,]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    for (const tok of tokens) {
      for (const family of STREET_TYPE_FAMILIES) {
        if (family.includes(tok)) return family;
      }
    }
    return null;
  }

  /** Text relevance only — never distance-to-device. */
  private suggestionRelevance(q: string, s: PlaceSuggestion): number {
    const hay = `${s.label} ${s.subtitle ?? ''}`.toLowerCase();
    const query = q.toLowerCase().trim();
    let score = 0;
    if (hay.includes(query)) score += 100;
    const house = query.match(/^(\d+)\b/);
    if (house) {
      if (
        hay.startsWith(house[1]) ||
        new RegExp(`\\b${house[1]}\\b`).test(hay)
      ) {
        score += 50;
      }
    }
    const postal = query.match(/\b([a-z]\d[a-z])\s*(\d[a-z]\d)\b/i);
    if (postal) {
      const compact = `${postal[1]}${postal[2]}`.toLowerCase();
      if (hay.replace(/\s+/g, '').includes(compact)) score += 80;
    }
    const queryFamily = this.detectStreetTypeFamily(query);
    const resultFamily = this.detectStreetTypeFamily(hay);
    if (queryFamily && resultFamily) {
      const same = queryFamily.some((t) => resultFamily.includes(t));
      if (same) score += 70;
      else score -= 45;
    }
    for (const token of query.split(/[\s,]+/).filter((t) => t.length > 1)) {
      // Skip bare street-type tokens already handled above (avoids Marine DR false boost).
      if (queryFamily?.includes(token.toLowerCase())) continue;
      if (hay.includes(token.toLowerCase())) score += 10;
    }
    if (s.placeId) score += 3;
    if (s.lat !== 0 || s.lng !== 0) score += 5;
    return score;
  }

  private async textSearchAsPlaces(
    q: string,
    max: number,
    languageCode: string,
  ): Promise<PlaceSuggestion[]> {
    try {
      const res = await fetch(
        'https://places.googleapis.com/v1/places:searchText',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': this.key!,
            'X-Goog-FieldMask':
              'places.id,places.formattedAddress,places.location,places.displayName',
          },
          body: JSON.stringify({
            textQuery: q,
            languageCode,
            regionCode: 'CA',
            maxResultCount: Math.min(Math.max(max, 1), 8),
          }),
        },
      );
      if (!res.ok) {
        this.logger.warn(
          `Places Text Search HTTP ${res.status} (key/quota/API config)`,
        );
        return [];
      }
      const data = (await res.json()) as {
        places?: Array<{
          id?: string;
          formattedAddress?: string;
          displayName?: { text?: string };
          location?: { latitude?: number; longitude?: number };
        }>;
      };
      const out: PlaceSuggestion[] = [];
      for (const p of data.places ?? []) {
        const formatted = p.formattedAddress?.trim() || '';
        const display = p.displayName?.text?.trim() || '';
        const label =
          display && formatted && !formatted.toLowerCase().startsWith(display.toLowerCase())
            ? display
            : formatted.split(',')[0]?.trim() || display;
        if (!label) continue;
        const subtitle =
          formatted && label !== formatted
            ? formatted.includes(',')
              ? formatted.split(',').slice(1).join(',').trim()
              : formatted
            : undefined;
        const placeId = p.id?.replace(/^places\//, '') || undefined;
        const lat = p.location?.latitude ?? 0;
        const lng = p.location?.longitude ?? 0;
        out.push({
          id: placeId ? `gplace-${placeId}` : `text-${lat}-${lng}-${out.length}`,
          label,
          subtitle,
          lat,
          lng,
          placeId,
          provider: this.name,
        });
        if (out.length >= max) break;
      }
      return out;
    } catch {
      return [];
    }
  }

  /**
   * Places search: Autocomplete + Geocoding + Text Search (New).
   * Canada-wide, no GPS/viewport bias. Query-relevance ranking only.
   */
  async places(
    query: string,
    limit = 8,
    opts?: PlacesSearchOpts,
  ): Promise<PlaceSuggestion[]> {
    this.assertKey();
    const q = query.trim();
    if (q.length < 2) return [];
    const max = Math.min(Math.max(limit, 1), 12);
    const languageCode = opts?.languageCode?.trim() || 'en';
    // Client lat/lng intentionally ignored — no locationBias / bounds on search.
    void opts?.lat;
    void opts?.lng;

    const addressLike = this.looksLikeAddressQuery(q);
    const reserved = addressLike ? ADDRESS_GEOCODE_RESERVED : 0;
    const autoCap = Math.max(1, max - reserved);
    const variants = addressLike ? this.addressQueryVariants(q) : [q];

    const suggestions: PlaceSuggestion[] = [];
    const seenPlaceIds = new Set<string>();
    const seenLabels = new Set<string>();

    const addSuggestion = (s: PlaceSuggestion): boolean => {
      const placeKey = s.placeId?.trim().toLowerCase();
      const labelKey = s.label.trim().toLowerCase();
      if (placeKey && seenPlaceIds.has(placeKey)) return false;
      if (seenLabels.has(labelKey)) return false;
      if (placeKey) seenPlaceIds.add(placeKey);
      seenLabels.add(labelKey);
      suggestions.push(s);
      return true;
    };

    // 1. Google Places Autocomplete (New) — Canada only, no locationBias
    try {
      const body: Record<string, unknown> = {
        input: q,
        languageCode,
        includedRegionCodes: ['ca'],
      };
      const token = opts?.sessionToken?.trim();
      if (token) body.sessionToken = token;

      const autoRes = await fetch(
        'https://places.googleapis.com/v1/places:autocomplete',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': this.key!,
          },
          body: JSON.stringify(body),
        },
      );

      if (autoRes.ok) {
        const autoData = (await autoRes.json()) as {
          suggestions?: Array<{
            placePrediction?: {
              placeId?: string;
              text?: { text?: string };
              structuredFormat?: {
                mainText?: { text?: string };
                secondaryText?: { text?: string };
              };
            };
          }>;
        };
        const preds = (autoData.suggestions ?? [])
          .map((s) => s.placePrediction)
          .filter(Boolean) as Array<{
          placeId?: string;
          text?: { text?: string };
          structuredFormat?: {
            mainText?: { text?: string };
            secondaryText?: { text?: string };
          };
        }>;

        let autoCount = 0;
        for (const p of preds) {
          if (!p.placeId) continue;
          const placeId = p.placeId;
          const label =
            p.structuredFormat?.mainText?.text ||
            p.text?.text ||
            placeId;
          const subtitle = p.structuredFormat?.secondaryText?.text;
          if (
            addSuggestion({
              id: `gplace-${placeId}`,
              label,
              subtitle,
              lat: 0,
              lng: 0,
              placeId,
              provider: this.name,
            })
          ) {
            autoCount += 1;
          }
          if (autoCount >= autoCap) break;
        }
      } else {
        this.logger.warn(
          `Places Autocomplete HTTP ${autoRes.status} (key/quota/API config)`,
        );
      }
    } catch {
      // Fall through to geocoding / text search
    }

    // 2. Geocoding + Text Search on abbreviation variants (Canada only)
    if (suggestions.length < max || addressLike) {
      const perVariant = Math.max(
        max - suggestions.length,
        reserved,
        4,
      );
      for (const variant of variants) {
        try {
          const geoPlaces = await this.geocodeAsPlaces(variant, perVariant);
          for (const gp of geoPlaces) addSuggestion(gp);
        } catch {
          // continue
        }
        if (addressLike) {
          try {
            const textPlaces = await this.textSearchAsPlaces(
              variant,
              perVariant,
              languageCode,
            );
            for (const tp of textPlaces) addSuggestion(tp);
          } catch {
            // continue
          }
        }
      }
    }

    suggestions.sort(
      (a, b) =>
        this.suggestionRelevance(q, b) - this.suggestionRelevance(q, a),
    );
    return suggestions.slice(0, max);
  }

  /**
   * Resolve lat/lng (+ formatted address) for a selected place.
   * Multi-tier resolution:
   * 1) Places API (New) Place Details
   * 2) Geocoding API by place_id (100% Google place ID support)
   * 3) Geocoding API by address label fallback
   */
  async placeDetails(
    placeId: string,
    opts?: { sessionToken?: string; languageCode?: string; label?: string },
  ): Promise<PlaceSuggestion | null> {
    this.assertKey();
    const id = placeId.trim();
    if (!id) return null;
    const languageCode = opts?.languageCode?.trim() || 'en';
    const loc = await this.placeLocation(id, {
      sessionToken: opts?.sessionToken,
      languageCode,
      label: opts?.label,
    });
    if (!loc) return null;
    return {
      id: `gplace-${id}`,
      label: loc.displayName || loc.formattedAddress || id,
      subtitle: loc.formattedAddress,
      lat: loc.lat,
      lng: loc.lng,
      placeId: id,
      provider: this.name,
    };
  }

  private async placeLocation(
    placeId: string,
    opts?: { sessionToken?: string; languageCode?: string; label?: string },
  ): Promise<{
    lat: number;
    lng: number;
    formattedAddress?: string;
    displayName?: string;
  } | null> {
    // 1. Try Google Places (New) Place Details
    try {
      const uri = new URL(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
      );
      if (opts?.languageCode) {
        uri.searchParams.set('languageCode', opts.languageCode);
      }
      if (opts?.sessionToken?.trim()) {
        uri.searchParams.set('sessionToken', opts.sessionToken.trim());
      }
      const res = await fetch(uri.toString(), {
        headers: {
          'X-Goog-Api-Key': this.key!,
          'X-Goog-FieldMask': 'location,formattedAddress,displayName',
        },
      });
      if (res.ok) {
        const data = (await res.json()) as {
          location?: { latitude?: number; longitude?: number };
          formattedAddress?: string;
          displayName?: { text?: string };
        };
        const lat = data.location?.latitude;
        const lng = data.location?.longitude;
        if (lat != null && lng != null) {
          return {
            lat,
            lng,
            formattedAddress: data.formattedAddress,
            displayName: data.displayName?.text,
          };
        }
      }
    } catch {
      // Fall through to geocoding fallback
    }

    // 2. Fall back to Google Geocoding API by place_id (supports 100% of Google place IDs)
    try {
      const geoUri = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      geoUri.searchParams.set('place_id', placeId);
      geoUri.searchParams.set('key', this.key!);
      if (opts?.languageCode) {
        geoUri.searchParams.set('language', opts.languageCode);
      }
      const geoRes = await fetch(geoUri.toString());
      if (geoRes.ok) {
        const geoData = (await geoRes.json()) as {
          status?: string;
          results?: Array<{
            formatted_address: string;
            geometry: { location: { lat: number; lng: number } };
          }>;
        };
        if (
          geoData.status === 'OK' &&
          geoData.results &&
          geoData.results.length > 0
        ) {
          const r = geoData.results[0];
          return {
            lat: r.geometry.location.lat,
            lng: r.geometry.location.lng,
            formattedAddress: r.formatted_address,
            displayName: r.formatted_address,
          };
        }
      }
    } catch {
      // Fall through
    }

    // 3. Fall back to Google Geocoding API by address label if provided
    if (opts?.label?.trim()) {
      try {
        const geoUri = new URL('https://maps.googleapis.com/maps/api/geocode/json');
        geoUri.searchParams.set('address', opts.label.trim());
        geoUri.searchParams.set('key', this.key!);
        if (opts?.languageCode) {
          geoUri.searchParams.set('language', opts.languageCode);
        }
        const geoRes = await fetch(geoUri.toString());
        if (geoRes.ok) {
          const geoData = (await geoRes.json()) as {
            status?: string;
            results?: Array<{
              formatted_address: string;
              geometry: { location: { lat: number; lng: number } };
            }>;
          };
          if (
            geoData.status === 'OK' &&
            geoData.results &&
            geoData.results.length > 0
          ) {
            const r = geoData.results[0];
            return {
              lat: r.geometry.location.lat,
              lng: r.geometry.location.lng,
              formattedAddress: r.formatted_address,
              displayName: r.formatted_address,
            };
          }
        }
      } catch {
        // Fall through
      }
    }

    return null;
  }

  private async geocodeAsPlaces(
    q: string,
    max: number,
  ): Promise<PlaceSuggestion[]> {
    // Places supplement: Canada-only, no GPS/viewport bounds.
    const geo = await this.geocode(q, { country: 'CA' });
    return geo.slice(0, max).map((g, i) => {
      const parts = g.label.split(',');
      const title = parts[0]?.trim() || g.label;
      const subtitle = parts.slice(1).join(',').trim();
      return {
        id: g.placeId ? `gplace-${g.placeId}` : `geo-${g.lat}-${g.lng}-${i}`,
        label: title,
        subtitle: subtitle || undefined,
        lat: g.lat,
        lng: g.lng,
        placeId: g.placeId,
        provider: this.name,
      };
    });
  }

  async route(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
  ): Promise<RouteResult> {
    if (this.key) {
      try {
        const uri = new URL(
          'https://maps.googleapis.com/maps/api/directions/json',
        );
        uri.searchParams.set('origin', `${from.lat},${from.lng}`);
        uri.searchParams.set('destination', `${to.lat},${to.lng}`);
        uri.searchParams.set('mode', 'driving');
        uri.searchParams.set('alternatives', 'true');
        // Traffic-aware ETA (duration_in_traffic); distance remains road meters.
        uri.searchParams.set(
          'departure_time',
          String(Math.floor(Date.now() / 1000)),
        );
        uri.searchParams.set('key', this.key);
        const res = await fetch(uri);
        const data = (await res.json()) as {
          status?: string;
          routes?: Array<{
            summary?: string;
            overview_polyline?: { points?: string };
            legs?: Array<{
              distance?: { value: number };
              duration?: { value: number };
              duration_in_traffic?: { value: number };
            }>;
          }>;
        };
        if (data.routes && data.routes.length > 0) {
          const parsedRoutes: RouteOption[] = [];
          for (let i = 0; i < data.routes.length; i++) {
            const r = data.routes[i];
            const leg = r.legs?.[0];
            const encoded = r.overview_polyline?.points;
            const coords = encoded ? decodeGooglePolyline(encoded) : [];
            if (coords.length > 0) {
              const trafficSec = leg?.duration_in_traffic?.value;
              const durationSec =
                trafficSec != null && trafficSec > 0
                  ? trafficSec
                  : leg?.duration?.value;
              parsedRoutes.push({
                id: `route-${i}`,
                summary:
                  r.summary?.trim() ||
                  (i === 0 ? 'Fastest route' : `Alternative ${i + 1}`),
                distanceKm: leg?.distance
                  ? Math.round((leg.distance.value / 1000) * 10) / 10
                  : 0,
                durationMin: durationSec
                  ? Math.max(1, Math.round(durationSec / 60))
                  : 0,
                geometry: { type: 'LineString', coordinates: coords },
                overviewPolyline: encoded,
                isFastest: i === 0,
              });
            }
          }
          if (parsedRoutes.length > 0) {
            const primary = parsedRoutes[0];
            return {
              distanceKm: primary.distanceKm,
              durationMin: primary.durationMin,
              provider: 'google',
              geometry: primary.geometry,
              overviewPolyline: primary.overviewPolyline,
              routes: parsedRoutes,
            };
          }
        }
      } catch {
        // Google-only: no OSRM / open-routing fallback.
      }
    }

    return {
      distanceKm: 0,
      durationMin: 0,
      provider: 'google',
      geometry: {
        type: 'LineString',
        coordinates: [
          [from.lng, from.lat],
          [to.lng, to.lat],
        ],
      },
    };
  }
}
