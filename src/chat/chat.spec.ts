import { BadGatewayException, ForbiddenException } from '@nestjs/common';
import { AiProviderType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AnthropicAdapter } from '../providers/adapters/anthropic.adapter';
import { GeminiAdapter } from '../providers/adapters/gemini.adapter';
import { OpenAiAdapter } from '../providers/adapters/openai.adapter';
import { ProviderAdapterRegistry } from '../providers/adapters/provider-adapter.registry';
import { ProviderRequestError } from '../providers/adapters/provider-http';
import { ProvidersService } from '../providers/providers.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { UsageService } from '../subscriptions/usage.service';
import { ChatService } from './chat.service';

const conn = { apiKey: 'test-key' };
const request = {
  model: 'm1',
  maxOutputTokens: 100,
  messages: [
    { role: 'system' as const, content: 'Be brief.' },
    { role: 'user' as const, content: 'Hi' },
    { role: 'assistant' as const, content: 'Hello!' },
    { role: 'user' as const, content: 'How are you?' },
  ],
};

function mockFetch(responseBody: unknown) {
  return jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(new Response(JSON.stringify(responseBody), { status: 200 }));
}
const sentBody = (spy: jest.SpyInstance) =>
  JSON.parse((spy.mock.calls[0] as [string, RequestInit])[1].body as string) as Record<
    string,
    unknown
  >;

describe('Vendor adapters (smoke)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('OpenAI: sends messages as-is and reads choices[0]', async () => {
    const spy = mockFetch({
      choices: [{ message: { content: 'Fine, thanks' } }],
      usage: { prompt_tokens: 12, completion_tokens: 3 },
    });
    const res = await new OpenAiAdapter().chat(conn, request);

    expect(sentBody(spy)).toMatchObject({ model: 'm1', messages: request.messages });
    expect(res).toEqual({ content: 'Fine, thanks', promptTokens: 12, completionTokens: 3 });
  });

  it('Anthropic: moves the system prompt to its own field', async () => {
    const spy = mockFetch({
      content: [{ type: 'text', text: 'Fine' }],
      usage: { input_tokens: 10, output_tokens: 1 },
    });
    const res = await new AnthropicAdapter().chat(conn, request);

    const body = sentBody(spy);
    expect(body.system).toBe('Be brief.');
    expect((body.messages as { role: string }[]).map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'user',
    ]);
    expect(res.content).toBe('Fine');
  });

  it('Gemini: uses the "model" role and systemInstruction', async () => {
    const spy = mockFetch({
      candidates: [{ content: { parts: [{ text: 'Fine' }] } }],
      usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 1 },
    });
    const res = await new GeminiAdapter().chat(conn, request);

    const body = sentBody(spy);
    expect((body.contents as { role: string }[]).map((c) => c.role)).toEqual([
      'user',
      'model',
      'user',
    ]);
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'Be brief.' }] });
    expect(res).toEqual({ content: 'Fine', promptTokens: 9, completionTokens: 1 });
  });
});

/** A fetch Response whose body arrives in the given raw chunks (to test split SSE events). */
function streamedResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(encoder.encode(c)));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

describe('Streaming adapters (smoke)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('OpenAI: reassembles SSE events split across network chunks and reads usage', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        streamedResponse([
          'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\ndata: {"choi',
          'ces":[{"delta":{"content":"lo"}}]}\n',
          '\ndata: {"choices":[],"usage":{"prompt_tokens":7,"completion_tokens":2}}\n\ndata: [DONE]\n\n',
        ]),
      );
    const events = [];
    for await (const e of new OpenAiAdapter().chatStream(
      conn,
      request,
      new AbortController().signal,
    )) {
      events.push(e);
    }
    expect(events).toEqual([
      { type: 'text', text: 'Hel' },
      { type: 'text', text: 'lo' },
      { type: 'usage', promptTokens: 7, completionTokens: 2 },
    ]);
  });

  it('Anthropic: turns text_delta events into text and collects both token counts', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        streamedResponse([
          'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":9}}}\n\n',
          'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}\n\n',
          'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":1}}\n\n',
          'event: message_stop\ndata: {"type":"message_stop"}\n\n',
        ]),
      );
    const events = [];
    for await (const e of new AnthropicAdapter().chatStream(
      conn,
      request,
      new AbortController().signal,
    )) {
      events.push(e);
    }
    expect(events).toEqual([
      { type: 'usage', promptTokens: 9 },
      { type: 'text', text: 'Hi' },
      { type: 'usage', completionTokens: 1 },
    ]);
  });

  it('a vendor error before streaming starts becomes a readable ProviderRequestError', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401 }),
      );
    const iterate = async () => {
      for await (const e of new GeminiAdapter().chatStream(
        conn,
        request,
        new AbortController().signal,
      )) {
        void e;
      }
    };
    await expect(iterate()).rejects.toMatchObject({
      status: 401,
      summary: 'Invalid or unauthorized API key (HTTP 401)',
    });
  });
});

describe('ChatService (smoke)', () => {
  const provider = {
    id: 'p1',
    name: 'OpenAI',
    type: AiProviderType.OPENAI,
    models: ['m1'],
    defaultModel: 'm1',
    maxOutputTokens: 100,
  };

  function makeService(adapter: object, allowStreaming = true) {
    const saved: Record<string, unknown>[] = [];
    const tx = {
      conversation: {
        create: jest.fn().mockResolvedValue({ id: 'c1' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'c1',
          title: 'Hello',
          provider: { id: 'p1', name: 'OpenAI' },
          model: 'm1',
          _count: { messages: 2 },
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
      message: {
        create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          saved.push(data);
          return Promise.resolve({ id: `m${saved.length}`, ...data });
        }),
      },
      usageRecord: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
      message: { findMany: jest.fn() },
    };
    const usage = {
      assertWithinLimit: jest.fn(),
      getUsage: jest.fn().mockResolvedValue({ chat: { limit: 500, used: 1, remaining: 499 } }),
    };
    const providers = {
      resolveForChat: jest.fn().mockResolvedValue(provider),
      connectionOf: jest.fn().mockReturnValue(conn),
    };
    const subscriptions = {
      getCurrent: jest.fn().mockResolvedValue({ plan: { allowStreaming } }),
    };
    const service = new ChatService(
      prisma as unknown as PrismaService,
      providers as unknown as ProvidersService,
      { get: () => adapter } as unknown as ProviderAdapterRegistry,
      usage as unknown as UsageService,
      subscriptions as unknown as SubscriptionsService,
    );
    return { service, prisma, saved, tx };
  }

  it('returns 502 and saves nothing when the AI provider fails', async () => {
    const failing = {
      chat: jest
        .fn()
        .mockRejectedValue(
          new ProviderRequestError(
            'full vendor detail',
            401,
            'Invalid or unauthorized API key (HTTP 401)',
          ),
        ),
    };
    const { service, prisma } = makeService(failing);

    const call = service.sendMessage('u1', { message: 'Hello' });

    await expect(call).rejects.toBeInstanceOf(BadGatewayException);
    await expect(call).rejects.toThrow(
      'AI provider "OpenAI" failed: Invalid or unauthorized API key (HTTP 401)',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('streaming is refused (403) on plans without it', async () => {
    const { service } = makeService({}, false);
    await expect(service.prepareStream('u1', { message: 'Hello' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('streams text to the caller, then saves the full reply with token usage', async () => {
    const adapter = {
      *chatStream() {
        yield { type: 'usage', promptTokens: 5 };
        yield { type: 'text', text: 'Hello ' };
        yield { type: 'text', text: 'world' };
        yield { type: 'usage', completionTokens: 2 };
      },
    };
    const { service, saved, tx } = makeService(adapter);
    const chunks: string[] = [];

    const chat = await service.prepareStream('u1', { message: 'Hi' });
    const res = await service.streamReply(chat, new AbortController().signal, (t) =>
      chunks.push(t),
    );

    expect(chunks).toEqual(['Hello ', 'world']);
    expect(saved[1]).toMatchObject({
      content: 'Hello world',
      promptTokens: 5,
      completionTokens: 2,
    });
    expect(tx.usageRecord.create).toHaveBeenCalled();
    expect(res.usage.remaining).toBe(499);
  });

  it('a stream that fails midway returns 502 and saves nothing', async () => {
    const adapter = {
      *chatStream() {
        yield { type: 'text', text: 'partial' };
        throw new ProviderRequestError(
          'connection reset',
          undefined,
          'Could not reach the AI provider',
        );
      },
    };
    const { service, prisma } = makeService(adapter);
    const chat = await service.prepareStream('u1', { message: 'Hi' });

    await expect(
      service.streamReply(chat, new AbortController().signal, () => undefined),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
