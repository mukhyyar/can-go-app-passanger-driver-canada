import { Injectable } from '@nestjs/common';
import type {
  GeocodeResult,
  MapsProvider,
  RouteResult,
} from './maps-provider.interface';

/** Default open-data maps stack (Photon + OSRM) — no API key. */
@Injectable()
export class PhotonMapsProvider implements MapsProvider {
  readonly name = 'photon';

  async geocode(query: string): Promise<GeocodeResult[]> {
    const uri = new URL('https://photon.komoot.io/api/');
    uri.searchParams.set('q', query);
    uri.searchParams.set('limit', '8');
    const res = await fetch(uri);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      features?: Array<{
        geometry?: { coordinates?: number[] };
        properties?: { name?: string; city?: string; country?: string };
      }>;
    };
    return (data.features ?? [])
      .map((f) => {
        const [lng, lat] = f.geometry?.coordinates ?? [];
        if (lat == null || lng == null) return null;
        const label = [f.properties?.name, f.properties?.city, f.properties?.country]
          .filter(Boolean)
          .join(', ');
        return { label: label || query, lat, lng, provider: this.name };
      })
      .filter(Boolean) as GeocodeResult[];
  }

  async reverseGeocode(lat: number, lng: number): Promise<GeocodeResult | null> {
    const uri = new URL('https://photon.komoot.io/reverse');
    uri.searchParams.set('lat', String(lat));
    uri.searchParams.set('lon', String(lng));
    const res = await fetch(uri);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: Array<{
        properties?: { name?: string; city?: string; country?: string };
      }>;
    };
    const f = data.features?.[0];
    if (!f) return null;
    const label = [f.properties?.name, f.properties?.city, f.properties?.country]
      .filter(Boolean)
      .join(', ');
    return { label: label || `${lat},${lng}`, lat, lng, provider: this.name };
  }

  async route(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
  ): Promise<RouteResult> {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;
    const res = await fetch(url);
    if (!res.ok) {
      return { distanceKm: 0, durationMin: 0, provider: this.name };
    }
    const data = (await res.json()) as {
      routes?: Array<{ distance: number; duration: number }>;
    };
    const r = data.routes?.[0];
    return {
      distanceKm: r ? r.distance / 1000 : 0,
      durationMin: r ? r.duration / 60 : 0,
      provider: this.name,
    };
  }
}
