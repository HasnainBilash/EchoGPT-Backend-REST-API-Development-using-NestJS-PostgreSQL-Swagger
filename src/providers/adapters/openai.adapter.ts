import { Injectable } from '@nestjs/common';
import { AiProviderType } from '@prisma/client';
import {
  AiProviderAdapter,
  ChatRequest,
  ChatResult,
  ProviderConnection,
} from './ai-provider.adapter';
import { CHAT_TIMEOUT_MS, ProviderRequestError, requestJson, trimSlash } from './provider-http';

interface OpenAiChatResponse {
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
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

  private base(baseUrl?: string | null) {
    return trimSlash(baseUrl || 'https://api.openai.com/v1');
  }
}
