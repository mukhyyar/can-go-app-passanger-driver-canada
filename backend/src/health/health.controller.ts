import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { FirebaseService } from '../firebase/firebase.service';
import { StorageService } from '../storage/storage.service';
import Redis from 'ioredis';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaService,
    private readonly firebase: FirebaseService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @HealthCheck()
  liveness() {
    return this.health.check([
      async (): Promise<HealthIndicatorResult> => ({
        api: { status: 'up', app: this.config.get<string>('appName') },
      }),
    ]);
  }

  @Get('ready')
  @HealthCheck()
  readiness() {
    return this.health.check([
      async (): Promise<HealthIndicatorResult> => {
        const dbOk = await this.prisma.isReady();
        return {
          database: {
            status: dbOk ? 'up' : 'down',
          },
        };
      },
      async (): Promise<HealthIndicatorResult> => {
        const url = this.config.get<string>('redisUrl') ?? 'redis://127.0.0.1:6379';
        const redis = new Redis(url, {
          maxRetriesPerRequest: 1,
          connectTimeout: 1500,
          lazyConnect: true,
        });
        try {
          await redis.connect();
          const pong = await redis.ping();
          await redis.quit();
          return { redis: { status: pong === 'PONG' ? 'up' : 'down' } };
        } catch (err) {
          try {
            redis.disconnect();
          } catch {
            /* ignore */
          }
          return {
            redis: {
              status: 'down',
              message: err instanceof Error ? err.message : 'unreachable',
            },
          };
        }
      },
      async (): Promise<HealthIndicatorResult> => ({
        firebase: {
          status: this.firebase.isConfigured() ? 'up' : 'down',
          projectId: this.firebase.projectId,
          mode: this.firebase.isConfigured() ? 'admin-sdk' : 'unconfigured',
        },
      }),
      async (): Promise<HealthIndicatorResult> => ({
        storage: {
          status: this.storage.isReady() ? 'up' : 'down',
          bucket: this.config.get<string>('s3.documentsBucket'),
        },
      }),
      async (): Promise<HealthIndicatorResult> => ({
        providers: {
          status: 'up',
          payment: this.config.get<string>('providers.payment'),
          payout: this.config.get<string>('providers.payout'),
          sms: this.config.get<string>('providers.sms'),
          otp: this.config.get<string>('providers.otp'),
        },
      }),
    ]);
  }
}
