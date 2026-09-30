import {
  Injectable,
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

/** Default bias when client sends no GPS (Canada / GTA). */
const DEFAULT_BIAS = { lat: 43.65, lng: -79.38, radiusMeters: 50_000 };

/** Google Maps Geocoding + Directions + Places (New). */
@Injectable()
export class GoogleMapsProvider implements MapsProvider {
  readonly name = 'google';
  private readonly key: string | undefined;

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
    opts?: { lat?: number; lng?: number },
  ): Promise<GeocodeResult[]> {
    this.assertKey();
    const q = query.trim();
    if (!q) return [];
    const uri = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    uri.searchParams.set('address', q);
    uri.searchParams.set('key', this.key!);
    if (
      opts?.lat != null &&
      opts?.lng != null &&
      Number.isFinite(opts.lat) &&
      Number.isFinite(opts.lng)
    ) {
      const lat = opts.lat;
      const lng = opts.lng;
      uri.searchParams.set(
        'bounds',
        `${lat - 1.0},${lng - 1.0}|${lat + 1.0},${lng + 1.0}`,
      );
    }
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
      // Referrer-restricted keys / disabled APIs → open-data fallback.
      if (
        data.status &&
        data.status !== 'OK' &&
        data.status !== 'ZERO_RESULTS'
      ) {
        return this.geocodeViaPhoton(q);
      }
    } catch {
      return this.geocodeViaPhoton(q);
    }
    return this.geocodeViaPhoton(q);
  }

  /** Photon forward geocode — used when the Google server key is blocked. */
  private async geocodeViaPhoton(query: string): Promise<GeocodeResult[]> {
    try {
      const uri = new URL('https://photon.komoot.io/api/');
      uri.searchParams.set('q', query);
      uri.searchParams.set('limit', '8');
      uri.searchParams.set('lat', String(DEFAULT_BIAS.lat));
      uri.searchParams.set('lon', String(DEFAULT_BIAS.lng));
      const res = await fetch(uri);
      if (!res.ok) return [];
      const data = (await res.json()) as {
        features?: Array<{
          geometry?: { coordinates?: [number, number] };
          properties?: Record<string, unknown>;
        }>;
      };
      return (data.features ?? [])
        .map((f) => {
          const coords = f.geometry?.coordinates;
          const props = f.properties;
          if (!coords || !props) return null;
          const [lng, lat] = coords;
          const label = this.formatPhotonLabel(props);
          if (!label || !Number.isFinite(lat) || !Number.isFinite(lng)) {
            return null;
          }
          return {
            label,
            lat,
            lng,
            provider: 'photon',
          } satisfies GeocodeResult;
        })
        .filter((x): x is GeocodeResult => !!x)
        .slice(0, 8);
    } catch {
      return [];
    }
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
      // Fall through to Photon (common when server key has referer restrictions).
    }
    return this.reverseViaPhoton(lat, lng);
  }

  /** Open-data reverse geocode — works without a Google server key. */
  private async reverseViaPhoton(
    lat: number,
    lng: number,
  ): Promise<GeocodeResult | null> {
    try {
      const uri = new URL('https://photon.komoot.io/reverse');
      uri.searchParams.set('lat', String(lat));
      uri.searchParams.set('lon', String(lng));
      const res = await fetch(uri);
      if (!res.ok) return null;
      const data = (await res.json()) as {
        features?: Array<{
          properties?: Record<string, unknown>;
        }>;
      };
      const props = data.features?.[0]?.properties;
      if (!props) return null;
      const label = this.formatPhotonLabel(props);
      if (!label) return null;
      return { label, lat, lng, provider: 'photon' };
    } catch {
      return null;
    }
  }

  private formatPhotonLabel(props: Record<string, unknown>): string {
    const str = (k: string) => {
      const v = props[k];
      return typeof v === 'string' && v.trim() ? v.trim() : '';
    };
    const rawName = str('name');
    const house = str('housenumber');
    const street = str('street');
    const locality =
      str('city') || str('town') || str('village') || str('municipality');
    const state = str('state');
    const country = str('country');
    const postcode = str('postcode');
    const osmValue = str('osm_value').toLowerCase();

    // Skip noisy OSM infrastructure names (tunnels, motorways, etc.).
    const noisy =
      /tunnel|motorway|trunk|primary|secondary|tertiary|unclassified|service|footway|path|cycleway|rail|platform/i.test(
        `${rawName} ${osmValue}`,
      );
    const name =
      !noisy && rawName && rawName.toLowerCase() !== street.toLowerCase()
        ? rawName
        : '';

    const line1 = [house, street].filter(Boolean).join(' ').trim();
    const parts = [name, line1, locality, state, postcode, country].filter(
      Boolean,
    );
    return parts.join(', ');
  }

  /**
   * Places search: hybrid Places Autocomplete (New) + Google Geocoding.
   * Ensures addresses, intersections, postal codes, airports, and POIs are all suggested and resolved.
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
    const hasClientCoords =
      opts?.lat != null &&
      Number.isFinite(opts.lat) &&
      opts?.lng != null &&
      Number.isFinite(opts.lng);

    const suggestions: PlaceSuggestion[] = [];
    const seenPlaceIds = new Set<string>();
    const seenLabels = new Set<string>();

    const addSuggestion = (s: PlaceSuggestion) => {
      const placeKey = s.placeId?.trim().toLowerCase();
      const labelKey = s.label.trim().toLowerCase();
      if (placeKey && seenPlaceIds.has(placeKey)) return;
      if (seenLabels.has(labelKey)) return;
      if (placeKey) seenPlaceIds.add(placeKey);
      seenLabels.add(labelKey);
      suggestions.push(s);
    };

    // 1. Google Places Autocomplete (New)
    try {
      const body: Record<string, unknown> = {
        input: q,
        languageCode,
        includedRegionCodes: ['ca', 'us'],
      };
      if (hasClientCoords) {
        body.locationBias = {
          circle: {
            center: { latitude: opts!.lat!, longitude: opts!.lng! },
            radius: 120_000,
          },
        };
      }
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

        for (const p of preds) {
          if (!p.placeId) continue;
          const placeId = p.placeId;
          const label =
            p.structuredFormat?.mainText?.text ||
            p.text?.text ||
            placeId;
          const subtitle = p.structuredFormat?.secondaryText?.text;
          addSuggestion({
            id: `gplace-${placeId}`,
            label,
            subtitle,
            lat: 0,
            lng: 0,
            placeId,
            provider: this.name,
          });
          if (suggestions.length >= max) break;
        }
      }
    } catch {
      // Fall through to geocoding
    }

    // 2. Supplement or fallback with Google Geocoding API
    // Addresses with numbers, postal codes, or when autocomplete returns few/zero results
    const looksLikeAddress =
      /\d|[A-Za-z]\d[A-Za-z]|,|st|ave|rd|blvd|dr|way|cres|lane|highway|hwy/i.test(
        q,
      );
    if (suggestions.length < max || looksLikeAddress) {
      try {
        const remaining = max - suggestions.length;
        const geoPlaces = await this.geocodeAsPlaces(
          q,
          Math.max(remaining, 4),
          opts,
        );
        for (const gp of geoPlaces) {
          addSuggestion(gp);
          if (suggestions.length >= max) break;
        }
      } catch {
        // Fall through
      }
    }

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
    opts?: PlacesSearchOpts,
  ): Promise<PlaceSuggestion[]> {
    const geo = await this.geocode(q, opts);
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
              parsedRoutes.push({
                id: `route-${i}`,
                summary:
                  r.summary?.trim() ||
                  (i === 0 ? 'Fastest route' : `Alternative ${i + 1}`),
                distanceKm: leg?.distance
                  ? Math.round((leg.distance.value / 1000) * 10) / 10
                  : 0,
                durationMin: leg?.duration
                  ? Math.max(1, Math.round(leg.duration.value / 60))
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
      } catch (_) {
        // Fall back to OSRM on any Google error or rejection
      }
    }

    // Resilient fallback: OSRM driving engine
    return this.fallbackOsrmRoute(from, to);
  }

  private async fallbackOsrmRoute(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
  ): Promise<RouteResult> {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&alternatives=true`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const data = (await res.json()) as {
        code?: string;
        routes?: Array<{
          distance: number;
          duration: number;
          geometry?: { coordinates: [number, number][] };
          legs?: Array<{ summary?: string }>;
        }>;
      };

      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const parsedRoutes: RouteOption[] = data.routes
          .filter(
            (r) =>
              r.geometry?.coordinates && r.geometry.coordinates.length > 0,
          )
          .map((r, i) => {
            const leg = r.legs?.[0];
            const distKm = Math.round((r.distance / 1000) * 10) / 10;
            const durMin = Math.max(1, Math.round(r.duration / 60));
            const name =
              leg?.summary?.trim() ||
              (i === 0 ? 'Fastest route' : `Alternative ${i + 1}`);
            return {
              id: `osrm-${i}`,
              summary: name,
              distanceKm: distKm,
              durationMin: durMin,
              geometry: {
                type: 'LineString' as const,
                coordinates: r.geometry!.coordinates,
              },
              isFastest: i === 0,
            };
          });

        if (parsedRoutes.length > 0) {
          const primary = parsedRoutes[0];
          return {
            distanceKm: primary.distanceKm,
            durationMin: primary.durationMin,
            provider: 'osrm',
            geometry: primary.geometry,
            routes: parsedRoutes,
          };
        }
      }
    } catch (_) {
      // Fallback below
    }

    // Straight-line fallback
    return {
      distanceKm: 0,
      durationMin: 0,
      provider: 'fallback',
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
