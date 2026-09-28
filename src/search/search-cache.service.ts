import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { SearchResultItem } from './duckduckgo.client';

/**
 * Shared cache of search-engine results (not AI summaries), keyed by engine + normalized query,
 * so repeated searches by any user skip the external call until the entry expires.
 * TTL 0 turns caching off.
 */
@Injectable()
export class SearchCacheService {
  private readonly ttlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.ttlMs = config.get('search', { infer: true }).cacheTtlSeconds * 1000;
  }

  get enabled(): boolean {
    return this.ttlMs > 0;
  }

  async get(engine: string, normalizedQuery: string): Promise<SearchResultItem[] | null> {
    if (!this.enabled) return null;
    const cacheKey = this.key(engine, normalizedQuery);
    const row = await this.prisma.searchCache.findUnique({ where: { cacheKey } });
    if (!row || row.expiresAt <= new Date()) return null;

    await this.prisma.searchCache.update({
      where: { cacheKey },
      data: { hitCount: { increment: 1 } },
    });
    return row.results as unknown as SearchResultItem[];
  }

  async set(
    engine: string,
    query: string,
    normalizedQuery: string,
    results: SearchResultItem[],
  ): Promise<void> {
    if (!this.enabled) return;
    const cacheKey = this.key(engine, normalizedQuery);
    const expiresAt = new Date(Date.now() + this.ttlMs);
    const json = results as unknown as Prisma.InputJsonValue;
    await this.prisma.searchCache.upsert({
      where: { cacheKey },
      create: { cacheKey, query, engine, results: json, expiresAt },
      update: { results: json, expiresAt, hitCount: 0 },
    });
    // Housekeeping: drop other expired entries (indexed on expires_at). Failure is harmless.
    this.prisma.searchCache
      .deleteMany({ where: { expiresAt: { lt: new Date() } } })
      .catch(() => undefined);
  }

  private key(engine: string, normalizedQuery: string): string {
    return createHash('sha256').update(`${engine}:${normalizedQuery}`).digest('hex');
  }
}
