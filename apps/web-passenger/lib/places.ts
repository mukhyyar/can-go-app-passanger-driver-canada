import type { Place } from './types';

type PhotonFeature = {
  properties?: Record<string, unknown>;
  geometry?: { coordinates?: unknown };
};

export async function searchPlaces(query: string, limit = 8): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q', q);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('lang', 'en');
  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Place search failed (${res.status})`);
  const body = (await res.json()) as { features?: PhotonFeature[] };
  const out: Place[] = [];
  for (const f of body.features ?? []) {
    const props = f.properties;
    const coords = f.geometry?.coordinates;
    if (!props || !Array.isArray(coords) || coords.length < 2) continue;
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const label = labelFrom(props);
    if (!label) continue;
    const osmType = String(props.osm_type ?? '');
    const osmId = String(props.osm_id ?? '');
    out.push({
      id: osmId ? `osm-${osmType}${osmId}` : `geo-${lat}-${lng}`,
      label,
      subtitle: subtitleFrom(props),
      lat,
      lng,
    });
  }
  return out;
}

function labelFrom(props: Record<string, unknown>): string {
  const name = str(props.name);
  const street = [str(props.housenumber), str(props.street)].filter(Boolean).join(' ');
  const locality = str(props.city) || str(props.town) || str(props.village) || str(props.county);
  const country = str(props.country);
  const parts = [name || street, locality, country].filter(Boolean);
  return [...new Set(parts)].join(', ');
}

function subtitleFrom(props: Record<string, unknown>): string | undefined {
  const bits = [str(props.osm_value), str(props.city) || str(props.country)].filter(Boolean);
  return bits.length ? bits.join(' · ') : undefined;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}
