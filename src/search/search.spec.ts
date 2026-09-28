import { AiProviderType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProviderAdapterRegistry } from '../providers/adapters/provider-adapter.registry';
import { ProviderRequestError } from '../providers/adapters/provider-http';
import { ProvidersService } from '../providers/providers.service';
import { UsageService } from '../subscriptions/usage.service';
import { DuckDuckGoClient } from './duckduckgo.client';
import { normalizeQuery, SearchService } from './search.service';

const ddgBody = {
  Heading: 'NestJS',
  AbstractText: 'NestJS is a Node.js framework.',
  AbstractURL: 'https://en.wikipedia.org/wiki/NestJS',
  AbstractSource: 'Wikipedia',
  Results: [],
  RelatedTopics: [
    { Text: 'Express - A web framework', FirstURL: 'https://duckduckgo.com/Express' },
    { Topics: [{ Text: 'Node.js - A JS runtime', FirstURL: 'https://duckduckgo.com/Node.js' }] },
    { Text: 'Duplicate', FirstURL: 'https://en.wikipedia.org/wiki/NestJS' },
  ],
};

describe('DuckDuckGoClient (smoke)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('turns an Instant Answer into clean, de-duplicated results (nested topics flattened)', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify(ddgBody)));

    const results = await new DuckDuckGoClient().search('nestjs');

    expect(results).toEqual([
      {
        title: 'NestJS',
        url: 'https://en.wikipedia.org/wiki/NestJS',
        snippet: 'NestJS is a Node.js framework.',
        source: 'Wikipedia',
      },
      {
        title: 'Express',
        url: 'https://duckduckgo.com/Express',
        snippet: 'A web framework',
        source: 'DuckDuckGo',
      },
      {
        title: 'Node.js',
        url: 'https://duckduckgo.com/Node.js',
        snippet: 'A JS runtime',
        source: 'DuckDuckGo',
      },
    ]);
  });

  it('treats an empty 200 body as "no results", not an outage', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 200 }));
    await expect(new DuckDuckGoClient().search('NestJS')).resolves.toEqual([]);
  });

  it('suggestions never throw — an autocomplete outage just returns []', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
    await expect(new DuckDuckGoClient().suggest('nest')).resolves.toEqual([]);
  });
});

describe('SearchService (smoke)', () => {
  it('still saves and returns the results when the AI summary fails', async () => {
    const saved: Record<string, unknown>[] = [];
    const tx = {
      webSearch: {
        create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          saved.push(data);
          return Promise.resolve({ id: 's1', createdAt: new Date(), provider: null, ...data });
        }),
      },
      usageRecord: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)) };
    const engine = {
      engine: 'duckduckgo',
      search: jest
        .fn()
        .mockResolvedValue([{ title: 'A', url: 'https://a', snippet: 's', source: 'x' }]),
    };
    const providers = {
      resolveForChat: jest.fn().mockResolvedValue({
        id: 'p1',
        name: 'OpenAI',
        type: AiProviderType.OPENAI,
        defaultModel: 'm',
        maxOutputTokens: 100,
      }),
      connectionOf: jest.fn(),
    };
    const adapters = {
      get: () => ({
        chat: jest
          .fn()
          .mockRejectedValue(new ProviderRequestError('detail', 401, 'Invalid key (HTTP 401)')),
      }),
    };
    const usage = {
      assertWithinLimit: jest.fn(),
      getUsage: jest.fn().mockResolvedValue({ search: { limit: 10, used: 1, remaining: 9 } }),
    };
    const service = new SearchService(
      prisma as unknown as PrismaService,
      engine as unknown as DuckDuckGoClient,
      providers as unknown as ProvidersService,
      adapters as unknown as ProviderAdapterRegistry,
      usage as unknown as UsageService,
    );

    const res = await service.search('u1', { query: '  NestJS   Framework ' });

    expect(res.resultCount).toBe(1);
    expect(res.summary).toBeNull();
    expect(res.summaryError).toBe('AI provider "OpenAI" failed: Invalid key (HTTP 401)');
    expect(saved[0]).toMatchObject({ normalizedQuery: 'nestjs framework', providerId: null });
    expect(tx.usageRecord.create).toHaveBeenCalled();
  });

  it('normalizes queries for history matching', () => {
    expect(normalizeQuery('  Hello   World ')).toBe('hello world');
  });
});
