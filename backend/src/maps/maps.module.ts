import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MAPS_PROVIDER } from './maps-provider.interface';
import { PhotonMapsProvider } from './photon-maps.provider';
import { GoogleMapsProvider } from './google-maps.provider';
import { MapsController } from './maps.controller';

@Global()
@Module({
  controllers: [MapsController],
  providers: [
    PhotonMapsProvider,
    GoogleMapsProvider,
    {
      provide: MAPS_PROVIDER,
      useFactory: (
        config: ConfigService,
        photon: PhotonMapsProvider,
        google: GoogleMapsProvider,
      ) => {
        const name = (config.get<string>('maps.provider') ?? 'photon').toLowerCase();
        if (name === 'google') return google;
        return photon;
      },
      inject: [ConfigService, PhotonMapsProvider, GoogleMapsProvider],
    },
  ],
  exports: [MAPS_PROVIDER],
})
export class MapsModule {}
