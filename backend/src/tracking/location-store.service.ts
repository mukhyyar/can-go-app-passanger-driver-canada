import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export type LiveLocation = {
  driverId: string;
  rideId?: string;
  lat: number;
  lng: number;
  heading?: number;
  speedMps?: number;
  accuracyM?: number;
  recordedAt: string;
};

@Injectable()
export class LocationStoreService implements OnModuleDestroy {
  private readonly logger = new Logger(LocationStoreService.name);
  private redis: Redis | null = null;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('redisUrl') ?? 'redis://127.0.0.1:6379';
    try {
      this.redis = new Redis(url, {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        enableOfflineQueue: false,
      });
      void this.redis.connect().catch((err) => {
        this.logger.warn(
          `Redis connect failed: ${err instanceof Error ? err.message : err}`,
        );
        this.redis = null;
      });
    } catch (err) {
      this.logger.warn(
        `Redis init failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async onModuleDestroy() {
    if (this.redis) {
      try {
        await this.redis.quit();
      } catch {
        this.redis.disconnect();
      }
    }
  }

  async setCurrent(loc: LiveLocation) {
    if (!this.redis) return;
    const key = `driver:${loc.driverId}:loc`;
    try {
      await this.redis.set(key, JSON.stringify(loc), 'EX', 300);
      if (loc.rideId) {
        await this.redis.set(
          `ride:${loc.rideId}:driver_loc`,
          JSON.stringify(loc),
          'EX',
          300,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Redis set failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async getDriver(driverId: string): Promise<LiveLocation | null> {
    if (!this.redis) return null;
    try {
      const raw = await this.redis.get(`driver:${driverId}:loc`);
      return raw ? (JSON.parse(raw) as LiveLocation) : null;
    } catch {
      return null;
    }
  }

  async getRideDriver(rideId: string): Promise<LiveLocation | null> {
    if (!this.redis) return null;
    try {
      const raw = await this.redis.get(`ride:${rideId}:driver_loc`);
      return raw ? (JSON.parse(raw) as LiveLocation) : null;
    } catch {
      return null;
    }
  }
}
