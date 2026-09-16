import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import configuration from './config/configuration';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { FirebaseModule } from './firebase/firebase.module';
import { ProvidersModule } from './providers/providers.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuthModule } from './auth/auth.module';
import { ImpersonationReadOnlyInterceptor } from './auth/guards/impersonation-readonly.interceptor';
import { StorageModule } from './storage/storage.module';
import { DriversModule } from './drivers/drivers.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { TrackingModule } from './tracking/tracking.module';
import { TripsModule } from './trips/trips.module';
import { RatingsModule } from './ratings/ratings.module';
import { ChatModule } from './chat/chat.module';
import { CmsModule } from './cms/cms.module';
import { ExpansionModule } from './expansion/expansion.module';
import { MapsModule } from './maps/maps.module';
import { AdminModule } from './admin/admin.module';
import { WalletModule } from './wallet/wallet.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
      load: [configuration],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 120,
      },
    ]),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        transport:
          process.env.NODE_ENV === 'local' ||
          process.env.NODE_ENV === 'development'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'password',
            'passwordHash',
            'code',
            'otp',
            'totpCode',
            'newPassword',
            'refreshToken',
          ],
          remove: true,
        },
      },
    }),
    PrismaModule,
    HealthModule,
    FirebaseModule,
    ProvidersModule,
    MapsModule,
    AuthModule,
    NotificationsModule,
    StorageModule,
    DriversModule,
    MarketplaceModule,
    TrackingModule,
    TripsModule,
    RatingsModule,
    ChatModule,
    CmsModule,
    ExpansionModule,
    AdminModule,
    WalletModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ImpersonationReadOnlyInterceptor,
    },
  ],
})
export class AppModule {}
