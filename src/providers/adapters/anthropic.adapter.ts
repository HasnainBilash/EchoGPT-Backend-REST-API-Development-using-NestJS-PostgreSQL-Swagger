import { Injectable } from '@nestjs/common';
import { AiProviderType } from '@prisma/client';
import {
  AiProviderAdapter,
  ChatRequest,
  ChatResult,
  ProviderConnection,
} from './ai-provider.adapter';
import { CHAT_TIMEOUT_MS, ProviderRequestError, requestJson, trimSlash } from './provider-http';

export const ANTHROPIC_VERSION = '2023-06-01';

interface AnthropicMessageResponse {
  content?: { type: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
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
    // Anthropic takes the system prompt as a separate field, not as a message.
    const system = req.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const messages = req.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));

    const res = await requestJson<AnthropicMessageResponse>(
      `${this.base(baseUrl)}/messages`,
      {
        method: 'POST',
        headers: { ...this.headers(apiKey), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: req.model,
          max_tokens: req.maxOutputTokens,
          messages,
          ...(system ? { system } : {}),
        }),
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

  private headers(apiKey: string) {
    return { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION };
  }

  private base(baseUrl?: string | null) {
    return trimSlash(baseUrl || 'https://api.anthropic.com/v1');
  }
}
