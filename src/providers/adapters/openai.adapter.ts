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

interface OpenAiUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
}

interface OpenAiChatResponse {
  choices?: { message?: { content?: string | null } }[];
  usage?: OpenAiUsage;
}

interface OpenAiStreamChunk {
  choices?: { delta?: { content?: string | null } }[];
  usage?: OpenAiUsage | null;
}

@Injectable()
export class OpenAiAdapter implements AiProviderAdapter {
  readonly type = AiProviderType.OPENAI;

  async checkHealth({ apiKey, baseUrl }: ProviderConnection): Promise<void> {
    await requestJson(`${this.base(baseUrl)}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  }

  async chat({ apiKey, baseUrl }: ProviderConnection, req: ChatRequest): Promise<ChatResult> {
    const res = await requestJson<OpenAiChatResponse>(
      `${this.base(baseUrl)}/chat/completions`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: req.model,
          messages: req.messages,
          max_completion_tokens: req.maxOutputTokens,
        }),
      },
      CHAT_TIMEOUT_MS,
    );

    const content = res.choices?.[0]?.message?.content;
    if (!content) {
      throw new ProviderRequestError('Provider returned an empty reply');
    }
    return {
      content,
      promptTokens: res.usage?.prompt_tokens ?? 0,
      completionTokens: res.usage?.completion_tokens ?? 0,
    };
  }

  async *chatStream(
    { apiKey, baseUrl }: ProviderConnection,
    req: ChatRequest,
    signal: AbortSignal,
  ): AsyncGenerator<ChatStreamEvent> {
    const res = await requestStream(
      `${this.base(baseUrl)}/chat/completions`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: req.model,
          messages: req.messages,
          max_completion_tokens: req.maxOutputTokens,
          stream: true,
          // Adds a final chunk with token usage.
          stream_options: { include_usage: true },
        }),
      },
      signal,
    );

    for await (const data of readSseData(res)) {
      if (data === '[DONE]') return;
      const chunk = JSON.parse(data) as OpenAiStreamChunk;
      const text = chunk.choices?.[0]?.delta?.content;
      if (text) yield { type: 'text', text };
      if (chunk.usage) {
        yield {
          type: 'usage',
          promptTokens: chunk.usage.prompt_tokens,
          completionTokens: chunk.usage.completion_tokens,
        };
      }
    }
  }

  private base(baseUrl?: string | null) {
    return trimSlash(baseUrl || 'https://api.openai.com/v1');
  }
}
