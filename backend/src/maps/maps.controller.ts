import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { MAPS_PROVIDER, type MapsProvider } from './maps-provider.interface';

class RouteDto {
  @Type(() => Number)
  @IsNumber()
  fromLat!: number;

  @Type(() => Number)
  @IsNumber()
  fromLng!: number;

  @Type(() => Number)
  @IsNumber()
  toLat!: number;

  @Type(() => Number)
  @IsNumber()
  toLng!: number;
}

@Controller('maps')
export class MapsController {
  constructor(
    @Inject(MAPS_PROVIDER) private readonly maps: MapsProvider,
    private readonly config: ConfigService,
  ) {}

  @Get('provider')
  provider() {
    return { provider: this.maps.name };
  }

  /**
   * Public browser Maps JS key (HTTP-referrer restricted).
   * Used by Flutter web map preview when --dart-define=GOOGLE_MAPS_API_KEY is unset.
   */
  @Get('browser-config')
  browserConfig() {
    const apiKey =
      this.config.get<string>('maps.googleBrowserApiKey')?.trim() || '';
    return {
      apiKey: apiKey || null,
      provider: this.maps.name,
    };
  }

  @Get('geocode')
  geocode(@Query('q') q: string) {
    return this.maps.geocode(q || '');
  }

  @Get('places')
  async places(
    @Query('q') q: string,
    @Query('limit') limit?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('sessionToken') sessionToken?: string,
    @Query('languageCode') languageCode?: string,
  ) {
    const n = limit ? Number(limit) : 8;
    const biasLat = lat != null && lat !== '' ? Number(lat) : undefined;
    const biasLng = lng != null && lng !== '' ? Number(lng) : undefined;
    const opts = {
      lat: biasLat != null && Number.isFinite(biasLat) ? biasLat : undefined,
      lng: biasLng != null && Number.isFinite(biasLng) ? biasLng : undefined,
      sessionToken: sessionToken?.trim() || undefined,
      languageCode: languageCode?.trim() || undefined,
    };
    if (this.maps.places) {
      return this.maps.places(q || '', Number.isFinite(n) ? n : 8, opts);
    }
    const geo = await this.maps.geocode(q || '');
    return geo.map((g, i) => ({
      id: `geo-${g.lat}-${g.lng}-${i}`,
      label: g.label,
      lat: g.lat,
      lng: g.lng,
      provider: g.provider,
    }));
  }

  @Get('place-details')
  async placeDetails(
    @Query('placeId') placeId: string,
    @Query('sessionToken') sessionToken?: string,
    @Query('languageCode') languageCode?: string,
  ) {
    if (!placeId?.trim()) {
      throw new NotFoundException('placeId required');
    }
    if (this.maps.placeDetails) {
      const detail = await this.maps.placeDetails(placeId.trim(), {
        sessionToken: sessionToken?.trim() || undefined,
        languageCode: languageCode?.trim() || undefined,
      });
      if (!detail) throw new NotFoundException('Place not found');
      return detail;
    }
    // Providers without place IDs: no-op
    throw new NotFoundException('Place details not supported by this provider');
  }

  @Get('reverse')
  async reverse(@Query('lat') lat: string, @Query('lng') lng: string) {
    const result = await this.maps.reverseGeocode(Number(lat), Number(lng));
    if (!result) {
      // Never return bare null — clients need a JSON object.
      return {
        label: '',
        lat: Number(lat),
        lng: Number(lng),
        provider: this.maps.name,
      };
    }
    return result;
  }

  @Post('route')
  route(@Body() dto: RouteDto) {
    if (!this.maps.route) {
      return { distanceKm: 0, durationMin: 0, provider: this.maps.name };
    }
    return this.maps.route(
      { lat: dto.fromLat, lng: dto.fromLng },
      { lat: dto.toLat, lng: dto.toLng },
    );
  }
}
