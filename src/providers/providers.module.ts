import { Module } from '@nestjs/common';
import { EncryptionService } from '../common/crypto/encryption.service';
import { AnthropicAdapter } from './adapters/anthropic.adapter';
import { GeminiAdapter } from './adapters/gemini.adapter';
import { OpenAiAdapter } from './adapters/openai.adapter';
import { ProviderAdapterRegistry } from './adapters/provider-adapter.registry';
import { AdminProvidersController } from './admin-providers.controller';
import { ProvidersController } from './providers.controller';
import { ProvidersService } from './providers.service';

@Module({
  controllers: [ProvidersController, AdminProvidersController],
  providers: [
    ProvidersService,
    EncryptionService,
    ProviderAdapterRegistry,
    OpenAiAdapter,
    AnthropicAdapter,
    GeminiAdapter,
  ],
  exports: [ProvidersService, ProviderAdapterRegistry],
})
export class ProvidersModule {}
