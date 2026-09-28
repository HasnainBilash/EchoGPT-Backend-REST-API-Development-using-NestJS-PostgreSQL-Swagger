import { Injectable } from '@nestjs/common';
import { AiProviderType } from '@prisma/client';
import { AiProviderAdapter, ProviderConnection } from './ai-provider.adapter';
import { requestJson, trimSlash } from './provider-http';

export const ANTHROPIC_VERSION = '2023-06-01';

@Injectable()
export class AnthropicAdapter implements AiProviderAdapter {
  readonly type = AiProviderType.ANTHROPIC;

  async checkHealth({ apiKey, baseUrl }: ProviderConnection): Promise<void> {
    await requestJson(`${this.base(baseUrl)}/models?limit=1`, {
      headers: { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION },
    });
  }

  private base(baseUrl?: string | null) {
    return trimSlash(baseUrl || 'https://api.anthropic.com/v1');
  }
}
