import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  GeocodeResult,
  MapsProvider,
  RouteResult,
} from './maps-provider.interface';

/** Optional Google Maps Geocoding + Directions (Phase 3). */
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
        'GOOGLE_MAPS_API_KEY required when MAPS_PROVIDER=google',
      );
    }
  }

  async geocode(query: string): Promise<GeocodeResult[]> {
    this.assertKey();
    const uri = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    uri.searchParams.set('address', query);
    uri.searchParams.set('key', this.key!);
    const res = await fetch(uri);
    const data = (await res.json()) as {
      results?: Array<{
        formatted_address: string;
        geometry: { location: { lat: number; lng: number } };
      }>;
    };
    return (data.results ?? []).slice(0, 8).map((r) => ({
      label: r.formatted_address,
      lat: r.geometry.location.lat,
      lng: r.geometry.location.lng,
      provider: this.name,
    }));
  }

  async reverseGeocode(lat: number, lng: number): Promise<GeocodeResult | null> {
    this.assertKey();
    const uri = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    uri.searchParams.set('latlng', `${lat},${lng}`);
    uri.searchParams.set('key', this.key!);
    const res = await fetch(uri);
    const data = (await res.json()) as {
      results?: Array<{ formatted_address: string }>;
    };
    const r = data.results?.[0];
    if (!r) return null;
    return { label: r.formatted_address, lat, lng, provider: this.name };
  }

  async route(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
  ): Promise<RouteResult> {
    this.assertKey();
    const uri = new URL(
      'https://maps.googleapis.com/maps/api/directions/json',
    );
    uri.searchParams.set('origin', `${from.lat},${from.lng}`);
    uri.searchParams.set('destination', `${to.lat},${to.lng}`);
    uri.searchParams.set('key', this.key!);
    const res = await fetch(uri);
    const data = (await res.json()) as {
      routes?: Array<{
        legs?: Array<{ distance?: { value: number }; duration?: { value: number } }>;
      }>;
    };
    const leg = data.routes?.[0]?.legs?.[0];
    return {
      distanceKm: leg?.distance ? leg.distance.value / 1000 : 0,
      durationMin: leg?.duration ? leg.duration.value / 60 : 0,
      provider: this.name,
    };
  }
}
