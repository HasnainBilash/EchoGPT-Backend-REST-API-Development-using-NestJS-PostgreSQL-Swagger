import { Injectable } from '@nestjs/common';
import { AiProviderType } from '@prisma/client';
import {
  AiProviderAdapter,
  ChatRequest,
  ChatResult,
  ChatStreamEvent,
  ProviderConnection,
} from './ai-provider.adapter';
import {
  CHAT_TIMEOUT_MS,
  ProviderRequestError,
  readSseData,
  requestJson,
  requestStream,
  trimSlash,
} from './provider-http';

export const ANTHROPIC_VERSION = '2023-06-01';

interface AnthropicMessageResponse {
  content?: { type: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

/** The streaming events we use; others (ping, content_block_start/stop…) are ignored. */
interface AnthropicStreamEvent {
  type: string;
  message?: { usage?: { input_tokens?: number } };
  delta?: { type?: string; text?: string };
  usage?: { output_tokens?: number };
  error?: { message?: string };
}

@Injectable()
export class AnthropicAdapter implements AiProviderAdapter {
  readonly type = AiProviderType.ANTHROPIC;

  async checkHealth({ apiKey, baseUrl }: ProviderConnection): Promise<void> {
    await requestJson(`${this.base(baseUrl)}/models?limit=1`, {
      headers: this.headers(apiKey),
    });
  }

  async chat({ apiKey, baseUrl }: ProviderConnection, req: ChatRequest): Promise<ChatResult> {
    const res = await requestJson<AnthropicMessageResponse>(
      `${this.base(baseUrl)}/messages`,
      {
        method: 'POST',
        headers: { ...this.headers(apiKey), 'Content-Type': 'application/json' },
        body: JSON.stringify(this.body(req)),
      },
      CHAT_TIMEOUT_MS,
    );

    const content = (res.content ?? [])
      .filter((block) => block.type === 'text' && block.text)
      .map((block) => block.text)
      .join('');
    if (!content) {
      throw new ProviderRequestError('Provider returned an empty reply');
    }
    return {
      content,
      promptTokens: res.usage?.input_tokens ?? 0,
      completionTokens: res.usage?.output_tokens ?? 0,
    };
  }

  async *chatStream(
    { apiKey, baseUrl }: ProviderConnection,
    req: ChatRequest,
    signal: AbortSignal,
  ): AsyncGenerator<ChatStreamEvent> {
    const res = await requestStream(
      `${this.base(baseUrl)}/messages`,
      {
        method: 'POST',
        headers: { ...this.headers(apiKey), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...this.body(req), stream: true }),
      },
      signal,
    );

    for await (const data of readSseData(res)) {
      const event = JSON.parse(data) as AnthropicStreamEvent;
      switch (event.type) {
        case 'message_start':
          yield { type: 'usage', promptTokens: event.message?.usage?.input_tokens };
          break;
        case 'content_block_delta':
          if (event.delta?.type === 'text_delta' && event.delta.text) {
            yield { type: 'text', text: event.delta.text };
          }
          break;
        case 'message_delta':
          yield { type: 'usage', completionTokens: event.usage?.output_tokens };
          break;
        case 'message_stop':
          return;
        case 'error':
          throw new ProviderRequestError(
            `Provider error during streaming: ${event.error?.message ?? 'unknown'}`,
            undefined,
            'Provider error during streaming',
          );
      }
    }
  }

  /** Anthropic takes the system prompt as a separate field, not as a message. */
  private body(req: ChatRequest) {
    const system = req.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const messages = req.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));
    return {
      model: req.model,
      max_tokens: req.maxOutputTokens,
      messages,
      ...(system ? { system } : {}),
    };
  }

  private headers(apiKey: string) {
    return { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION };
  }

  private base(baseUrl?: string | null) {
    return trimSlash(baseUrl || 'https://api.anthropic.com/v1');
  }
}
