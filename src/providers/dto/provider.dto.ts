import { ApiProperty } from '@nestjs/swagger';
import { AiProviderType, HealthStatus } from '@prisma/client';

export class ProviderHealthDto {
  @ApiProperty({ enum: HealthStatus, example: HealthStatus.HEALTHY })
  status: HealthStatus;

  @ApiProperty({ example: 'OK', nullable: true, type: String })
  message: string | null;

  @ApiProperty({ example: 312, nullable: true, type: Number })
  latencyMs: number | null;

  @ApiProperty({ example: '2026-09-28T10:00:00.000Z', nullable: true, type: Date })
  checkedAt: Date | null;
}

/** What users see: enough to pick a provider/model, no secrets or internals. */
export class PublicProviderDto {
  @ApiProperty({ example: '3f1c2d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f' })
  id: string;

  @ApiProperty({ example: 'OpenAI' })
  name: string;

  @ApiProperty({ enum: AiProviderType, example: AiProviderType.OPENAI })
  type: AiProviderType;

  @ApiProperty({ example: 'gpt-4o-mini' })
  defaultModel: string;

  @ApiProperty({ example: ['gpt-4o-mini', 'gpt-4o'] })
  models: string[];

  @ApiProperty({ example: true })
  isDefault: boolean;
}

/** What admins see. The API key itself is never returned — only a masked hint. */
export class ProviderDto extends PublicProviderDto {
  @ApiProperty({ example: null, nullable: true, type: String })
  baseUrl: string | null;

  @ApiProperty({ example: '••••abcd', description: 'Last 4 characters of the stored key.' })
  apiKeyHint: string;

  @ApiProperty({ example: 2048 })
  maxOutputTokens: number;

  @ApiProperty({ example: true })
  isEnabled: boolean;

  @ApiProperty({ type: ProviderHealthDto })
  health: ProviderHealthDto;

  @ApiProperty({ example: '2026-09-28T10:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-09-28T10:00:00.000Z' })
  updatedAt: Date;
}
