import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    // Soft-connect: Phase 0 boots even if Postgres is not yet running.
    try {
      await this.$connect();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        '[PrismaService] Database not reachable yet; health will report not-ready.',
        err instanceof Error ? err.message : err,
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async isReady(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
