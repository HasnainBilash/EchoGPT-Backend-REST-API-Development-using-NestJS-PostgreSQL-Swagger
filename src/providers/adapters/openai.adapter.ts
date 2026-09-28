import { Injectable } from '@nestjs/common';
import { AiProviderType } from '@prisma/client';
import { AiProviderAdapter, ProviderConnection } from './ai-provider.adapter';
import { requestJson, trimSlash } from './provider-http';

@Injectable()
export class OpenAiAdapter implements AiProviderAdapter {
  readonly type = AiProviderType.OPENAI;

  async checkHealth({ apiKey, baseUrl }: ProviderConnection): Promise<void> {
    await requestJson(`${this.base(baseUrl)}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  }

  private base(baseUrl?: string | null) {
    return trimSlash(baseUrl || 'https://api.openai.com/v1');
  }
}
