import { Injectable } from '@nestjs/common';
import { AiProviderType } from '@prisma/client';
import { AiProviderAdapter, ProviderConnection } from './ai-provider.adapter';
import { requestJson, trimSlash } from './provider-http';

@Injectable()
export class GeminiAdapter implements AiProviderAdapter {
  readonly type = AiProviderType.GEMINI;

  async checkHealth({ apiKey, baseUrl }: ProviderConnection): Promise<void> {
    // Key goes in a header, not the query string, so it never lands in URL logs.
    await requestJson(`${this.base(baseUrl)}/models?pageSize=1`, {
      headers: { 'x-goog-api-key': apiKey },
    });
  }

  private base(baseUrl?: string | null) {
    return trimSlash(baseUrl || 'https://generativelanguage.googleapis.com/v1beta');
  }
}
