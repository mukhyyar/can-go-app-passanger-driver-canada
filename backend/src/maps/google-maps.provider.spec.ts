jest.mock('@nestjs/config', () => ({
  ConfigService: class MockConfigService {
    get = jest.fn();
  },
}));

import { ConfigService } from '@nestjs/config';
import { GoogleMapsProvider } from './google-maps.provider';

describe('GoogleMapsProvider (places & placeDetails)', () => {
  let provider: GoogleMapsProvider;
  const originalFetch = global.fetch;

  beforeEach(() => {
    const config = {
      get: (key: string) => {
        if (key === 'maps.googleApiKey') return 'test-google-key';
        return undefined;
      },
    } as unknown as ConfigService;
    provider = new GoogleMapsProvider(config);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('places returns autocomplete predictions with non-Toronto bias when lat/lng supplied', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    global.fetch = jest.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('places:autocomplete')) {
        capturedBody = JSON.parse(init?.body as string);
        return {
          ok: true,
          json: async () => ({
            suggestions: [
              {
                placePrediction: {
                  placeId: 'place-calgary-airport',
                  text: { text: 'Calgary International Airport (YYC)' },
                  structuredFormat: {
                    mainText: { text: 'Calgary International Airport' },
                    secondaryText: { text: 'Calgary, AB, Canada' },
                  },
                },
              },
            ],
          }),
        };
      }
      return { ok: false };
    }) as never;

    const res = await provider.places('Calgary Airport', 5, {
      lat: 51.0486,
      lng: -114.0708,
    });

    expect(res).toHaveLength(1);
    expect(res[0].placeId).toBe('place-calgary-airport');
    expect(res[0].label).toBe('Calgary International Airport');
    expect(res[0].subtitle).toBe('Calgary, AB, Canada');

    expect(capturedBody).not.toBeNull();
    // Verify locationBias used the client's Calgary coordinates, not Toronto
    const biasCircle = (capturedBody as any)?.locationBias?.circle;
    expect(biasCircle?.center?.latitude).toBe(51.0486);
    expect(biasCircle?.center?.longitude).toBe(-114.0708);
  });

  it('places falls back to Geocoding when Autocomplete has no results', async () => {
    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('places:autocomplete')) {
        return {
          ok: true,
          json: async () => ({ suggestions: [] }),
        };
      }
      if (url.includes('maps/api/geocode/json')) {
        return {
          ok: true,
          json: async () => ({
            status: 'OK',
            results: [
              {
                formatted_address: '4523 16a St SW, Calgary, AB T2T 4L8, Canada',
                place_id: 'place-4523',
                geometry: {
                  location: { lat: 51.0134, lng: -114.0987 },
                },
              },
            ],
          }),
        };
      }
      return { ok: false };
    }) as never;

    const res = await provider.places('4523 16a St SW', 5);

    expect(res.length).toBeGreaterThanOrEqual(1);
    expect(res[0].label).toBe('4523 16a St SW');
    expect(res[0].lat).toBeCloseTo(51.0134);
    expect(res[0].lng).toBeCloseTo(-114.0987);
    expect(res[0].placeId).toBe('place-4523');
  });

  it('placeDetails resolves via Places API (New) when successful', async () => {
    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('places.googleapis.com/v1/places/')) {
        return {
          ok: true,
          json: async () => ({
            location: { latitude: 51.1215, longitude: -114.0076 },
            formattedAddress: '2000 Airport Rd NE, Calgary, AB T2E 6W5',
            displayName: { text: 'Calgary International Airport' },
          }),
        };
      }
      return { ok: false };
    }) as never;

    const detail = await provider.placeDetails('place-calgary-airport');

    expect(detail).not.toBeNull();
    expect(detail!.lat).toBeCloseTo(51.1215);
    expect(detail!.lng).toBeCloseTo(-114.0076);
    expect(detail!.label).toBe('Calgary International Airport');
  });

  it('placeDetails falls back to Geocoding API by place_id when Places API (New) returns 404', async () => {
    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('places.googleapis.com/v1/places/')) {
        // Places API (New) 404 for address place ID
        return { ok: false, status: 404 };
      }
      if (url.includes('maps/api/geocode/json') && url.includes('place_id=')) {
        return {
          ok: true,
          json: async () => ({
            status: 'OK',
            results: [
              {
                formatted_address: '100 8 Ave SW, Calgary, AB, Canada',
                place_id: 'address-place-id-123',
                geometry: {
                  location: { lat: 51.0456, lng: -114.0678 },
                },
              },
            ],
          }),
        };
      }
      return { ok: false };
    }) as never;

    const detail = await provider.placeDetails('address-place-id-123');

    expect(detail).not.toBeNull();
    expect(detail!.lat).toBeCloseTo(51.0456);
    expect(detail!.lng).toBeCloseTo(-114.0678);
    expect(detail!.label).toContain('100 8 Ave SW');
  });

  it('placeDetails falls back to Geocoding API by address label if place_id fails', async () => {
    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('places.googleapis.com/v1/places/')) {
        return { ok: false, status: 404 };
      }
      if (url.includes('place_id=')) {
        return { ok: true, json: async () => ({ status: 'ZERO_RESULTS' }) };
      }
      if (url.includes('address=')) {
        return {
          ok: true,
          json: async () => ({
            status: 'OK',
            results: [
              {
                formatted_address: 'Banff Springs Hotel, Banff, AB, Canada',
                geometry: {
                  location: { lat: 51.1646, lng: -115.5621 },
                },
              },
            ],
          }),
        };
      }
      return { ok: false };
    }) as never;

    const detail = await provider.placeDetails('synthetic-id-999', {
      label: 'Banff Springs Hotel, Banff, AB',
    });

    expect(detail).not.toBeNull();
    expect(detail!.lat).toBeCloseTo(51.1646);
    expect(detail!.lng).toBeCloseTo(-115.5621);
  });
});
