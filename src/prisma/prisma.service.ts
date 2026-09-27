import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    this.$on('warn' as never, (e: { message: string }) => this.logger.warn(e.message));
    this.$on('error' as never, (e: { message: string }) => this.logger.error(e.message));
    await this.$connect();
    this.logger.log('Connected to PostgreSQL');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Round-trip latency to the database in ms (throws if unreachable). */
  async ping(): Promise<number> {
    const started = performance.now();
    await this.$queryRaw`SELECT 1`;
    return Math.round(performance.now() - started);
  }
}
