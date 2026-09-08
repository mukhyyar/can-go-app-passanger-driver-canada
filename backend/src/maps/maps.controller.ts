import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
} from '@nestjs/common';
import { IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
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
  constructor(@Inject(MAPS_PROVIDER) private readonly maps: MapsProvider) {}

  @Get('provider')
  provider() {
    return { provider: this.maps.name };
  }

  @Get('geocode')
  geocode(@Query('q') q: string) {
    return this.maps.geocode(q || '');
  }

  @Get('reverse')
  reverse(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
  ) {
    return this.maps.reverseGeocode(Number(lat), Number(lng));
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
