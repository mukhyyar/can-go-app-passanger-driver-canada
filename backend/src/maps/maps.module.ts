import { Global, Module } from '@nestjs/common';
import { MAPS_PROVIDER } from './maps-provider.interface';
import { GoogleMapsProvider } from './google-maps.provider';
import { MapsController } from './maps.controller';

@Global()
@Module({
  controllers: [MapsController],
  providers: [
    GoogleMapsProvider,
    {
      provide: MAPS_PROVIDER,
      useExisting: GoogleMapsProvider,
    },
  ],
  exports: [MAPS_PROVIDER],
})
export class MapsModule {}
