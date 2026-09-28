import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({ example: 'Explain what a REST API is in two sentences.' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  message: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Continue this conversation. Omit to start a new one.',
  })
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      "Provider to use (from GET /providers). Omit to keep the conversation's provider, or use the default.",
  })
  @IsOptional()
  @IsUUID()
  providerId?: string;

  @ApiPropertyOptional({
    example: 'gpt-4o-mini',
    description:
      "Model to use; must be one of the provider's models. Omit for the provider's default.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string;
}
