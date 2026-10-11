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

  it('places never sends locationBias even when lat/lng are supplied', async () => {
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
    expect(capturedBody!.locationBias).toBeUndefined();
    expect(capturedBody!.includedRegionCodes).toEqual(['ca']);
  });

  it('places uses Canada-only region codes', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    global.fetch = jest.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('places:autocomplete')) {
        capturedBody = JSON.parse(init?.body as string);
        return { ok: true, json: async () => ({ suggestions: [] }) };
      }
      if (url.includes('maps/api/geocode/json')) {
        return {
          ok: true,
          json: async () => ({ status: 'ZERO_RESULTS', results: [] }),
        };
      }
      return { ok: false };
    }) as never;

    await provider.places('Toronto', 5);
    expect(capturedBody!.includedRegionCodes).toEqual(['ca']);
    expect(capturedBody!.includedRegionCodes).not.toContain('us');
  });

  it('places geocode supplement uses country:CA and no bounds', async () => {
    const geocodeUrls: string[] = [];
    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('places:autocomplete')) {
        return { ok: true, json: async () => ({ suggestions: [] }) };
      }
      if (url.includes('maps/api/geocode/json')) {
        geocodeUrls.push(url);
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

    const res = await provider.places('4523 16a St SW', 5, {
      lat: 43.65,
      lng: -79.38,
    });

    expect(res.length).toBeGreaterThanOrEqual(1);
    expect(res[0].label).toBe('4523 16a St SW');
    expect(res[0].placeId).toBe('place-4523');
    expect(geocodeUrls.length).toBeGreaterThan(0);
    expect(geocodeUrls[0]).toContain('components=country%3ACA');
    expect(geocodeUrls[0]).not.toContain('bounds=');
  });

  it('country-scoped geocode does not fall back to Photon on ZERO_RESULTS', async () => {
    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('maps/api/geocode/json')) {
        return {
          ok: true,
          json: async () => ({ status: 'ZERO_RESULTS', results: [] }),
        };
      }
      if (url.includes('photon.komoot.io')) {
        throw new Error('Photon must not be called for country-scoped geocode');
      }
      return { ok: false };
    }) as never;

    const res = await provider.geocode('35 mast', { country: 'CA' });
    expect(res).toEqual([]);
    expect(
      (global.fetch as jest.Mock).mock.calls.some((c) =>
        String(c[0]).includes('photon.komoot.io'),
      ),
    ).toBe(false);
  });

  it('places merges geocode street hit when Autocomplete fills the list', async () => {
    const filler = Array.from({ length: 8 }, (_, i) => ({
      placePrediction: {
        placeId: `filler-${i}`,
        structuredFormat: {
          mainText: { text: `Unrelated Place ${i}` },
          secondaryText: { text: 'Toronto, ON, Canada' },
        },
      },
    }));

    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('places:autocomplete')) {
        return {
          ok: true,
          json: async () => ({ suggestions: filler }),
        };
      }
      if (url.includes('maps/api/geocode/json')) {
        return {
          ok: true,
          json: async () => ({
            status: 'OK',
            results: [
              {
                formatted_address:
                  '35 Masters Dr SE, Calgary, AB T3M 2T7, Canada',
                place_id: 'place-masters',
                geometry: {
                  location: { lat: 50.9012, lng: -113.9567 },
                },
              },
            ],
          }),
        };
      }
      return { ok: false };
    }) as never;

    const res = await provider.places('35 Masters Dr SE', 8);
    const masters = res.find(
      (r) =>
        r.placeId === 'place-masters' ||
        r.label.toLowerCase().includes('masters'),
    );
    expect(masters).toBeDefined();
    expect(masters!.label).toContain('35 Masters');
    // Exact street match should rank at or near the top
    expect(res[0].placeId).toBe('place-masters');
  });

  it('places does not call Photon when country-scoped Google geocode fails', async () => {
    const photonUrls: string[] = [];
    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('places:autocomplete')) {
        return { ok: true, json: async () => ({ suggestions: [] }) };
      }
      if (url.includes('places:searchText')) {
        return { ok: true, json: async () => ({ places: [] }) };
      }
      if (url.includes('maps/api/geocode/json')) {
        return {
          ok: true,
          json: async () => ({ status: 'REQUEST_DENIED', results: [] }),
        };
      }
      if (url.includes('photon.komoot.io')) {
        photonUrls.push(url);
        return { ok: true, json: async () => ({ features: [] }) };
      }
      return { ok: false };
    }) as never;

    const res = await provider.places('35 Masters Dr SE Calgary', 5);
    expect(photonUrls).toEqual([]);
    expect(res).toEqual([]);
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

  it('places Text Search uses regionCode CA and no locationBias for address queries', async () => {
    let textBody: Record<string, unknown> | null = null;
    global.fetch = jest.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('places:autocomplete')) {
        return { ok: true, json: async () => ({ suggestions: [] }) };
      }
      if (url.includes('places:searchText')) {
        textBody = JSON.parse(init?.body as string);
        return {
          ok: true,
          json: async () => ({
            places: [
              {
                id: 'places/text-masters-drive',
                formattedAddress: 'Masters Drive SE, Calgary, AB T3M 0T2, Canada',
                displayName: { text: 'Masters Drive SE' },
                location: { latitude: 50.8947, longitude: -113.9101 },
              },
            ],
          }),
        };
      }
      if (url.includes('maps/api/geocode/json')) {
        return {
          ok: true,
          json: async () => ({ status: 'ZERO_RESULTS', results: [] }),
        };
      }
      return { ok: false };
    }) as never;

    const res = await provider.places('35 Masters Dr SE Calgary', 5);
    expect(textBody).not.toBeNull();
    expect(textBody!.regionCode).toBe('CA');
    expect(textBody!.locationBias).toBeUndefined();
    expect(textBody!.locationRestriction).toBeUndefined();
    expect(res.some((r) => r.label.includes('Masters Drive'))).toBe(true);
  });

  it('places geocodes Drive abbreviation variant for Dr queries', async () => {
    const geocodeAddresses: string[] = [];
    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('places:autocomplete')) {
        return { ok: true, json: async () => ({ suggestions: [] }) };
      }
      if (url.includes('places:searchText')) {
        return { ok: true, json: async () => ({ places: [] }) };
      }
      if (url.includes('maps/api/geocode/json')) {
        const u = new URL(url);
        geocodeAddresses.push(u.searchParams.get('address') || '');
        const addr = (u.searchParams.get('address') || '').toLowerCase();
        if (addr.includes('drive')) {
          return {
            ok: true,
            json: async () => ({
              status: 'OK',
              results: [
                {
                  formatted_address:
                    'Masters Drive SE, Calgary, Alberta, T3M 0T2, Canada',
                  place_id: 'place-masters-drive',
                  geometry: {
                    location: { lat: 50.8947, lng: -113.9101 },
                  },
                },
              ],
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            status: 'OK',
            results: [
              {
                formatted_address:
                  '35 Masters Manor SE, Calgary, Alberta, T3M 0T2, Canada',
                place_id: 'place-manor',
                geometry: {
                  location: { lat: 50.8961, lng: -113.9098 },
                },
              },
            ],
          }),
        };
      }
      return { ok: false };
    }) as never;

    const res = await provider.places('35 Masters Dr SE', 8);
    expect(geocodeAddresses.some((a) => /drive/i.test(a))).toBe(true);
    expect(res[0].label.toLowerCase()).toContain('drive');
  });

  it('places ranks Masters Drive above Manor when query uses Dr', async () => {
    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('places:autocomplete')) {
        return { ok: true, json: async () => ({ suggestions: [] }) };
      }
      if (url.includes('places:searchText')) {
        return { ok: true, json: async () => ({ places: [] }) };
      }
      if (url.includes('maps/api/geocode/json')) {
        return {
          ok: true,
          json: async () => ({
            status: 'OK',
            results: [
              {
                formatted_address:
                  '35 Masters Manor SE, Calgary, Alberta, T3M 0T2, Canada',
                place_id: 'place-manor',
                geometry: {
                  location: { lat: 50.8961, lng: -113.9098 },
                },
              },
              {
                formatted_address:
                  'Masters Drive SE, Calgary, Alberta, T3M 0T2, Canada',
                place_id: 'place-drive',
                geometry: {
                  location: { lat: 50.8947, lng: -113.9101 },
                },
              },
            ],
          }),
        };
      }
      return { ok: false };
    }) as never;

    const res = await provider.places('35 Masters Dr SE Calgary', 8);
    expect(res[0].placeId).toBe('place-drive');
  });

  it('places ranks matching postal code above non-matching', async () => {
    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('places:autocomplete')) {
        return { ok: true, json: async () => ({ suggestions: [] }) };
      }
      if (url.includes('places:searchText')) {
        return { ok: true, json: async () => ({ places: [] }) };
      }
      if (url.includes('maps/api/geocode/json')) {
        return {
          ok: true,
          json: async () => ({
            status: 'OK',
            results: [
              {
                formatted_address:
                  '35 Masters Manor SE, Calgary, Alberta, T3M 0T2, Canada',
                place_id: 'place-manor',
                geometry: {
                  location: { lat: 50.8961, lng: -113.9098 },
                },
              },
              {
                formatted_address:
                  '35 Masters Dr SE, Calgary, Alberta, T3M 2T7, Canada',
                place_id: 'place-exact',
                geometry: {
                  location: { lat: 50.9, lng: -113.95 },
                },
              },
            ],
          }),
        };
      }
      return { ok: false };
    }) as never;

    const res = await provider.places(
      '35 Masters Dr SE, Calgary, AB T3M 2T7, Canada',
      8,
    );
    expect(res[0].placeId).toBe('place-exact');
  });
});

describe('GoogleMapsProvider (route)', () => {
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

  it('sends departure_time and prefers duration_in_traffic for ETA', async () => {
    const before = Math.floor(Date.now() / 1000);
    let capturedUrl = '';
    // Encoded polyline for two points (enough to decode non-empty geometry)
    const overview = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
    global.fetch = jest.fn().mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.includes('maps/api/directions/json')) {
        capturedUrl = url;
        return {
          ok: true,
          json: async () => ({
            status: 'OK',
            routes: [
              {
                summary: 'AB-201 S',
                overview_polyline: { points: overview },
                legs: [
                  {
                    distance: { value: 38100 },
                    duration: { value: 1860 },
                    duration_in_traffic: { value: 2100 },
                  },
                ],
              },
              {
                summary: 'Hwy 2 S',
                overview_polyline: { points: overview },
                legs: [
                  {
                    distance: { value: 45500 },
                    duration: { value: 2100 },
                    duration_in_traffic: { value: 2280 },
                  },
                ],
              },
            ],
          }),
        };
      }
      return { ok: false };
    }) as never;

    const result = await provider.route(
      { lat: 51.1314, lng: -114.0103 },
      { lat: 50.9013, lng: -113.9558 },
    );

    const after = Math.floor(Date.now() / 1000);
    const u = new URL(capturedUrl);
    expect(u.searchParams.get('mode')).toBe('driving');
    expect(u.searchParams.get('alternatives')).toBe('true');
    const dep = Number(u.searchParams.get('departure_time'));
    expect(dep).toBeGreaterThanOrEqual(before);
    expect(dep).toBeLessThanOrEqual(after);

    expect(result.provider).toBe('google');
    expect(result.distanceKm).toBe(38.1);
    // 2100s traffic → 35 min (not static 1860s → 31 min)
    expect(result.durationMin).toBe(35);
    expect(result.routes).toHaveLength(2);
    expect(result.routes![0].durationMin).toBe(35);
    expect(result.routes![1].distanceKm).toBe(45.5);
    expect(result.routes![1].durationMin).toBe(38);
  });

  it('falls back to static duration when duration_in_traffic is absent', async () => {
    const overview = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
    global.fetch = jest.fn().mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.includes('maps/api/directions/json')) {
        return {
          ok: true,
          json: async () => ({
            status: 'OK',
            routes: [
              {
                summary: 'AB-201 S',
                overview_polyline: { points: overview },
                legs: [
                  {
                    distance: { value: 36500 },
                    duration: { value: 1920 },
                  },
                ],
              },
            ],
          }),
        };
      }
      return { ok: false };
    }) as never;

    const result = await provider.route(
      { lat: 51.13, lng: -114.01 },
      { lat: 50.9, lng: -113.96 },
    );

    expect(result.provider).toBe('google');
    expect(result.distanceKm).toBe(36.5);
    expect(result.durationMin).toBe(32);
  });
});
