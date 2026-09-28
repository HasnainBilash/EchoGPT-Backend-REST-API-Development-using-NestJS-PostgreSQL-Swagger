import {
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AiProvider, Prisma, UsageType, WebSearch } from '@prisma/client';
import { PaginationQueryDto, pageMeta } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import { ProviderAdapterRegistry } from '../providers/adapters/provider-adapter.registry';
import { ProviderRequestError } from '../providers/adapters/provider-http';
import { ProvidersService } from '../providers/providers.service';
import { UsageService } from '../subscriptions/usage.service';
import { DuckDuckGoClient, SearchEngineError, SearchResultItem } from './duckduckgo.client';
import {
  RecentSearchDto,
  SearchDetailDto,
  SearchPageDto,
  SearchQueryDto,
  SearchResponseDto,
  SearchSummaryDto,
  SuggestionDto,
} from './dto/search.dto';

const MAX_SUGGESTIONS = 8;
const SUMMARY_MAX_TOKENS = 512;
const SUMMARY_SYSTEM_PROMPT =
  'You summarize web search results. Answer the query in 2-4 sentences using only the ' +
  'numbered results and cite them like [1]. If the results are not relevant, say so.';

const WITH_PROVIDER = {
  provider: { select: { id: true, name: true } },
} satisfies Prisma.WebSearchInclude;
type SearchRow = Prisma.WebSearchGetPayload<{ include: typeof WITH_PROVIDER }>;

export const normalizeQuery = (q: string) => q.trim().replace(/\s+/g, ' ').toLowerCase();

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: DuckDuckGoClient,
    private readonly providers: ProvidersService,
    private readonly adapters: ProviderAdapterRegistry,
    private readonly usage: UsageService,
  ) {}

  async search(userId: string, dto: SearchQueryDto): Promise<SearchResponseDto> {
    await this.usage.assertWithinLimit(userId, UsageType.SEARCH);
    const started = Date.now();

    // Resolve the summary provider first so a bad providerId fails fast, before any work.
    const wantSummary = dto.summarize !== false;
    let provider: AiProvider | null = null;
    let summaryError: string | null = null;
    if (wantSummary) {
      try {
        provider = await this.providers.resolveForChat(dto.providerId);
      } catch (err) {
        if (!(err instanceof ServiceUnavailableException) || dto.providerId) throw err;
        summaryError = 'No AI provider is available for summaries';
      }
    }

    let results: SearchResultItem[];
    try {
      results = await this.engine.search(dto.query);
    } catch (err) {
      if (err instanceof SearchEngineError) {
        // Nothing saved and no quota used when the engine is down.
        throw new BadGatewayException(err.message);
      }
      throw err;
    }

    let summary: string | null = null;
    if (provider) {
      try {
        summary = await this.summarize(provider, dto.query, results);
      } catch (err) {
        if (!(err instanceof ProviderRequestError)) throw err;
        this.logger.warn(`Search summary via "${provider.name}" failed: ${err.message}`);
        summaryError = `AI provider "${provider.name}" failed: ${err.summary}`;
      }
    }

    const saved = await this.prisma.$transaction(async (tx) => {
      const row = await tx.webSearch.create({
        data: {
          userId,
          query: dto.query,
          normalizedQuery: normalizeQuery(dto.query),
          engine: this.engine.engine,
          results: results as unknown as Prisma.InputJsonValue,
          resultCount: results.length,
          summary,
          providerId: summary ? provider!.id : null,
          latencyMs: Date.now() - started,
        },
        include: WITH_PROVIDER,
      });
      await tx.usageRecord.create({
        data: { userId, type: UsageType.SEARCH, providerId: summary ? provider!.id : null },
      });
      return row;
    });

    const usage = await this.usage.getUsage(userId);
    return { ...toDetail(saved), summaryError, usage: usage.search };
  }

  async history(userId: string, query: PaginationQueryDto): Promise<SearchPageDto> {
    const where = { userId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.webSearch.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.webSearch.count({ where }),
    ]);
    return { items: rows.map(toSummary), meta: pageMeta(query, total) };
  }

  async getOne(userId: string, id: string): Promise<SearchDetailDto> {
    const row = await this.prisma.webSearch.findFirst({
      where: { id, userId },
      include: WITH_PROVIDER,
    });
    if (!row) {
      throw new NotFoundException('Search not found');
    }
    return toDetail(row);
  }

  async deleteOne(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.webSearch.deleteMany({ where: { id, userId } });
    if (count === 0) {
      throw new NotFoundException('Search not found');
    }
  }

  async clearHistory(userId: string): Promise<number> {
    const { count } = await this.prisma.webSearch.deleteMany({ where: { userId } });
    return count;
  }

  /** Latest distinct queries (repeats of the same query collapse into one). */
  async recent(userId: string, limit: number): Promise<RecentSearchDto[]> {
    const rows = await this.prisma.webSearch.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit * 5,
      select: { query: true, normalizedQuery: true, createdAt: true },
    });
    const seen = new Set<string>();
    const recent: RecentSearchDto[] = [];
    for (const row of rows) {
      if (seen.has(row.normalizedQuery)) continue;
      seen.add(row.normalizedQuery);
      recent.push({ query: row.query, lastSearchedAt: row.createdAt });
      if (recent.length === limit) break;
    }
    return recent;
  }

  /** The user's own matching past queries first, then DuckDuckGo autocomplete. */
  async suggestions(userId: string, prefix: string): Promise<SuggestionDto[]> {
    const normalized = normalizeQuery(prefix);
    const [own, web] = await Promise.all([
      this.prisma.webSearch.findMany({
        where: { userId, normalizedQuery: { startsWith: normalized } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { query: true, normalizedQuery: true },
      }),
      this.engine.suggest(prefix),
    ]);

    const seen = new Set<string>();
    const out: SuggestionDto[] = [];
    const add = (text: string, source: SuggestionDto['source']) => {
      const key = normalizeQuery(text);
      if (!key || seen.has(key) || out.length >= MAX_SUGGESTIONS) return;
      seen.add(key);
      out.push({ text, source });
    };
    own.forEach((row) => add(row.query, 'history'));
    web.forEach((text) => add(text, 'web'));
    return out;
  }

  private async summarize(
    provider: AiProvider,
    query: string,
    results: SearchResultItem[],
  ): Promise<string> {
    const userPrompt = results.length
      ? `Query: ${query}\n\nResults:\n` +
        results.map((r, i) => `[${i + 1}] ${r.title} — ${r.snippet} (${r.url})`).join('\n')
      : `Query: ${query}\n\nThe web search returned no results. Answer briefly from general ` +
        'knowledge and say clearly that no web results were found.';

    const reply = await this.adapters
      .get(provider.type)
      .chat(this.providers.connectionOf(provider), {
        model: provider.defaultModel,
        maxOutputTokens: Math.min(provider.maxOutputTokens, SUMMARY_MAX_TOKENS),
        messages: [
          { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      });
    return reply.content;
  }
}

function toSummary(row: WebSearch): SearchSummaryDto {
  return {
    id: row.id,
    query: row.query,
    engine: row.engine,
    resultCount: row.resultCount,
    hasSummary: row.summary !== null,
    latencyMs: row.latencyMs,
    createdAt: row.createdAt,
  };
}

function toDetail(row: SearchRow): SearchDetailDto {
  return {
    ...toSummary(row),
    results: row.results as unknown as SearchResultItem[],
    summary: row.summary,
    provider: row.provider,
  };
}
