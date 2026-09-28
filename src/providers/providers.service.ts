import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AiProvider, HealthStatus, Prisma } from '@prisma/client';
import { EncryptionService } from '../common/crypto/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProviderConnection } from './adapters/ai-provider.adapter';
import { ProviderAdapterRegistry } from './adapters/provider-adapter.registry';
import { ProviderRequestError } from './adapters/provider-http';
import { CreateProviderDto } from './dto/create-provider.dto';
import { ProviderDto, PublicProviderDto } from './dto/provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';

type Tx = Prisma.TransactionClient;

@Injectable()
export class ProvidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly adapters: ProviderAdapterRegistry,
  ) {}

  async list(): Promise<ProviderDto[]> {
    const providers = await this.prisma.aiProvider.findMany({
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    return providers.map((p) => this.toDto(p));
  }

  /** Enabled providers only, without secrets — what the extension shows in its model picker. */
  async listPublic(): Promise<PublicProviderDto[]> {
    const providers = await this.prisma.aiProvider.findMany({
      where: { isEnabled: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    return providers.map((p) => this.toPublicDto(p));
  }

  async get(id: string): Promise<ProviderDto> {
    return this.toDto(await this.findOrThrow(id));
  }

  async create(dto: CreateProviderDto): Promise<ProviderDto> {
    const isEnabled = dto.isEnabled ?? true;
    if (dto.isDefault && !isEnabled) {
      throw new BadRequestException('A disabled provider cannot be the default');
    }

    const provider = await this.saveUniqueName(() =>
      this.prisma.$transaction(async (tx) => {
        if (dto.isDefault) {
          await tx.aiProvider.updateMany({
            where: { isDefault: true },
            data: { isDefault: false },
          });
        }
        const created = await tx.aiProvider.create({
          data: {
            name: dto.name,
            type: dto.type,
            baseUrl: dto.baseUrl ?? null,
            ...this.encryptKey(dto.apiKey),
            defaultModel: dto.defaultModel,
            models: normalizeModels(dto.defaultModel, dto.models),
            maxOutputTokens: dto.maxOutputTokens,
            isEnabled,
            isDefault: dto.isDefault ?? false,
          },
        });
        await this.ensureDefault(tx);
        return tx.aiProvider.findUniqueOrThrow({ where: { id: created.id } });
      }),
    );
    return this.toDto(provider);
  }

  async update(id: string, dto: UpdateProviderDto): Promise<ProviderDto> {
    const existing = await this.findOrThrow(id);
    const defaultModel = dto.defaultModel ?? existing.defaultModel;
    const connectionChanged = dto.apiKey !== undefined || dto.baseUrl !== undefined;

    const provider = await this.saveUniqueName(() =>
      this.prisma.aiProvider.update({
        where: { id },
        data: {
          name: dto.name,
          baseUrl: dto.baseUrl,
          ...(dto.apiKey ? this.encryptKey(dto.apiKey) : {}),
          defaultModel,
          models: normalizeModels(defaultModel, dto.models ?? existing.models),
          maxOutputTokens: dto.maxOutputTokens,
          // A new key or URL makes the last health result meaningless.
          ...(connectionChanged ? RESET_HEALTH : {}),
        },
      }),
    );
    return this.toDto(provider);
  }

  async remove(id: string): Promise<void> {
    await this.findOrThrow(id);
    // Chats and usage keep their rows; their provider reference is set to NULL by the schema.
    await this.prisma.$transaction(async (tx) => {
      await tx.aiProvider.delete({ where: { id } });
      await this.ensureDefault(tx);
    });
  }

  async setEnabled(id: string, isEnabled: boolean): Promise<ProviderDto> {
    await this.findOrThrow(id);
    const provider = await this.prisma.$transaction(async (tx) => {
      await tx.aiProvider.update({
        where: { id },
        data: isEnabled ? { isEnabled } : { isEnabled, isDefault: false },
      });
      await this.ensureDefault(tx);
      return tx.aiProvider.findUniqueOrThrow({ where: { id } });
    });
    return this.toDto(provider);
  }

  async setDefault(id: string): Promise<ProviderDto> {
    const provider = await this.findOrThrow(id);
    if (!provider.isEnabled) {
      throw new ConflictException('Enable the provider before making it the default');
    }
    const [, updated] = await this.prisma.$transaction([
      this.prisma.aiProvider.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      }),
      this.prisma.aiProvider.update({ where: { id }, data: { isDefault: true } }),
    ]);
    return this.toDto(updated);
  }

  /** Real authenticated call to the vendor; the result is stored on the provider. */
  async checkHealth(id: string): Promise<ProviderDto> {
    const provider = await this.findOrThrow(id);
    const started = Date.now();
    let status: HealthStatus = HealthStatus.HEALTHY;
    let message = 'OK';

    try {
      await this.adapters.get(provider.type).checkHealth(this.connectionOf(provider));
    } catch (err) {
      status = HealthStatus.UNHEALTHY;
      message =
        err instanceof ProviderRequestError ? err.message : 'Unexpected error during health check';
    }

    const updated = await this.prisma.aiProvider.update({
      where: { id },
      data: {
        healthStatus: status,
        healthMessage: message.slice(0, 500),
        healthLatencyMs: Date.now() - started,
        lastHealthCheckAt: new Date(),
      },
    });
    return this.toDto(updated);
  }

  /**
   * Picks the provider for a chat request: the one the user asked for, else the one the
   * conversation already uses (if still enabled), else the default.
   */
  async resolveForChat(requestedId?: string, conversationProviderId?: string | null) {
    if (requestedId) {
      const requested = await this.prisma.aiProvider.findUnique({ where: { id: requestedId } });
      if (!requested) {
        throw new NotFoundException('AI provider not found');
      }
      if (!requested.isEnabled) {
        throw new BadRequestException(`Provider "${requested.name}" is currently disabled`);
      }
      return requested;
    }

    if (conversationProviderId) {
      const previous = await this.prisma.aiProvider.findFirst({
        where: { id: conversationProviderId, isEnabled: true },
      });
      if (previous) return previous;
    }

    const fallback = await this.prisma.aiProvider.findFirst({
      where: { isEnabled: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    if (!fallback) {
      throw new ServiceUnavailableException('No AI provider is available right now');
    }
    return fallback;
  }

  /** Decrypted connection details for server-side calls. Never expose this through the API. */
  connectionOf(provider: AiProvider): ProviderConnection {
    return { apiKey: this.encryption.decrypt(provider.encryptedApiKey), baseUrl: provider.baseUrl };
  }

  /** Invariant: while any provider is enabled, exactly one enabled provider is the default. */
  private async ensureDefault(tx: Tx): Promise<void> {
    const current = await tx.aiProvider.findFirst({ where: { isDefault: true, isEnabled: true } });
    if (current) return;
    const fallback = await tx.aiProvider.findFirst({
      where: { isEnabled: true },
      orderBy: { createdAt: 'asc' },
    });
    if (fallback) {
      await tx.aiProvider.update({ where: { id: fallback.id }, data: { isDefault: true } });
    }
  }

  private async findOrThrow(id: string): Promise<AiProvider> {
    const provider = await this.prisma.aiProvider.findUnique({ where: { id } });
    if (!provider) {
      throw new NotFoundException('AI provider not found');
    }
    return provider;
  }

  private async saveUniqueName<T>(save: () => Promise<T>): Promise<T> {
    try {
      return await save();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('A provider with this name already exists');
      }
      throw err;
    }
  }

  private encryptKey(apiKey: string) {
    return { encryptedApiKey: this.encryption.encrypt(apiKey), apiKeyLast4: apiKey.slice(-4) };
  }

  private toPublicDto(p: AiProvider): PublicProviderDto {
    return {
      id: p.id,
      name: p.name,
      type: p.type,
      defaultModel: p.defaultModel,
      models: p.models,
      isDefault: p.isDefault,
    };
  }

  private toDto(p: AiProvider): ProviderDto {
    return {
      ...this.toPublicDto(p),
      baseUrl: p.baseUrl,
      apiKeyHint: `••••${p.apiKeyLast4}`,
      maxOutputTokens: p.maxOutputTokens,
      isEnabled: p.isEnabled,
      health: {
        status: p.healthStatus,
        message: p.healthMessage,
        latencyMs: p.healthLatencyMs,
        checkedAt: p.lastHealthCheckAt,
      },
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }
}

const RESET_HEALTH = {
  healthStatus: HealthStatus.UNKNOWN,
  healthMessage: null,
  healthLatencyMs: null,
  lastHealthCheckAt: null,
};

/** Default model first, no duplicates. */
function normalizeModels(defaultModel: string, models: string[] = []): string[] {
  return [...new Set([defaultModel, ...models])];
}
