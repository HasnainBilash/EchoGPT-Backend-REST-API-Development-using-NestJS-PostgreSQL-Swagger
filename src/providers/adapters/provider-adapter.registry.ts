import { Injectable } from '@nestjs/common';
import { AiProviderType } from '@prisma/client';
import { AiProviderAdapter } from './ai-provider.adapter';
import { AnthropicAdapter } from './anthropic.adapter';
import { GeminiAdapter } from './gemini.adapter';
import { OpenAiAdapter } from './openai.adapter';

/** Picks the adapter for a provider type. Adding a vendor = one adapter class + one line here. */
@Injectable()
export class ProviderAdapterRegistry {
  private readonly adapters: Record<AiProviderType, AiProviderAdapter>;

  constructor(openai: OpenAiAdapter, anthropic: AnthropicAdapter, gemini: GeminiAdapter) {
    this.adapters = {
      [AiProviderType.OPENAI]: openai,
      [AiProviderType.ANTHROPIC]: anthropic,
      [AiProviderType.GEMINI]: gemini,
    };
  }

  get(type: AiProviderType): AiProviderAdapter {
    return this.adapters[type];
  }
}
