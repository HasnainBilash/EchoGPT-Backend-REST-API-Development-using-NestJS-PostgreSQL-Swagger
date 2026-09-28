import { ApiProperty } from '@nestjs/swagger';
import { MessageRole } from '@prisma/client';
import { PageMetaDto } from '../../common/dto/pagination.dto';
import { UsageCounterDto } from '../../subscriptions/dto/usage.dto';

export class ProviderRefDto {
  @ApiProperty({ example: '3f1c2d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f' })
  id: string;

  @ApiProperty({ example: 'OpenAI' })
  name: string;
}

export class MessageDto {
  @ApiProperty({ example: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d' })
  id: string;

  @ApiProperty({ enum: MessageRole, example: MessageRole.ASSISTANT })
  role: MessageRole;

  @ApiProperty({ example: 'A REST API is ...' })
  content: string;

  @ApiProperty({ example: 'gpt-4o-mini', nullable: true, type: String })
  model: string | null;

  @ApiProperty({ example: 42, nullable: true, type: Number })
  promptTokens: number | null;

  @ApiProperty({ example: 87, nullable: true, type: Number })
  completionTokens: number | null;

  @ApiProperty({ example: 1234, nullable: true, type: Number, description: 'AI response time.' })
  latencyMs: number | null;

  @ApiProperty({ example: '2026-09-28T10:00:00.000Z' })
  createdAt: Date;
}

export class ConversationSummaryDto {
  @ApiProperty({ example: '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e' })
  id: string;

  @ApiProperty({ example: 'Explain what a REST API is in two sentences.' })
  title: string;

  @ApiProperty({
    type: ProviderRefDto,
    nullable: true,
    description: 'null if the provider was deleted.',
  })
  provider: ProviderRefDto | null;

  @ApiProperty({ example: 'gpt-4o-mini', nullable: true, type: String })
  model: string | null;

  @ApiProperty({ example: 4 })
  messageCount: number;

  @ApiProperty({ example: '2026-09-28T10:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-09-28T10:05:00.000Z' })
  updatedAt: Date;
}

export class ConversationDetailDto extends ConversationSummaryDto {
  @ApiProperty({ type: MessageDto, isArray: true, description: 'Oldest first.' })
  messages: MessageDto[];
}

export class ConversationPageDto {
  @ApiProperty({ type: ConversationSummaryDto, isArray: true })
  items: ConversationSummaryDto[];

  @ApiProperty({ type: PageMetaDto })
  meta: PageMetaDto;
}

export class SendMessageResponseDto {
  @ApiProperty({ type: ConversationSummaryDto })
  conversation: ConversationSummaryDto;

  @ApiProperty({ type: MessageDto })
  userMessage: MessageDto;

  @ApiProperty({ type: MessageDto })
  reply: MessageDto;

  @ApiProperty({ type: UsageCounterDto, description: 'Chat quota after this request.' })
  usage: UsageCounterDto;
}
