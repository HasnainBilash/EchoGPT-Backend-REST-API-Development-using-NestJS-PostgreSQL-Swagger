import { BadGatewayException } from '@nestjs/common';
import { AiProviderType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AnthropicAdapter } from '../providers/adapters/anthropic.adapter';
import { GeminiAdapter } from '../providers/adapters/gemini.adapter';
import { OpenAiAdapter } from '../providers/adapters/openai.adapter';
import { ProviderAdapterRegistry } from '../providers/adapters/provider-adapter.registry';
import { ProviderRequestError } from '../providers/adapters/provider-http';
import { ProvidersService } from '../providers/providers.service';
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

describe('ChatService (smoke)', () => {
  it('returns 502 and saves nothing when the AI provider fails', async () => {
    const provider = {
      id: 'p1',
      name: 'OpenAI',
      type: AiProviderType.OPENAI,
      models: ['m1'],
      defaultModel: 'm1',
      maxOutputTokens: 100,
    };
    const prisma = { $transaction: jest.fn(), message: { findMany: jest.fn() } };
    const usage = { assertWithinLimit: jest.fn(), getUsage: jest.fn() };
    const providers = {
      resolveForChat: jest.fn().mockResolvedValue(provider),
      connectionOf: jest.fn().mockReturnValue(conn),
    };
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
    const service = new ChatService(
      prisma as unknown as PrismaService,
      providers as unknown as ProvidersService,
      { get: () => failing } as unknown as ProviderAdapterRegistry,
      usage as unknown as UsageService,
    );

    const call = service.sendMessage('u1', { message: 'Hello' });

    await expect(call).rejects.toBeInstanceOf(BadGatewayException);
    await expect(call).rejects.toThrow(
      'AI provider "OpenAI" failed: Invalid or unauthorized API key (HTTP 401)',
    );
    expect(usage.assertWithinLimit).toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
