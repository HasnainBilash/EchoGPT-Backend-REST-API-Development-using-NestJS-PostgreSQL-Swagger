import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AiProviderType } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const MODEL_ID = /^[A-Za-z0-9._:\-/]+$/;

export class CreateProviderDto {
  @ApiProperty({ example: 'OpenAI', description: 'Unique display name.' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name: string;

  @ApiProperty({ enum: AiProviderType, example: AiProviderType.OPENAI })
  @IsEnum(AiProviderType)
  type: AiProviderType;

  @ApiProperty({
    example: 'sk-proj-xxxxxxxxxxxxxxxxxxxx',
    description: 'Vendor API key. Stored encrypted; never returned by the API.',
  })
  @Transform(trim)
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  apiKey: string;

  @ApiProperty({
    example: 'gpt-4o-mini',
    description: 'Model used when the user does not pick one.',
  })
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  @Matches(MODEL_ID, { message: 'defaultModel contains invalid characters' })
  defaultModel: string;

  @ApiPropertyOptional({
    example: ['gpt-4o-mini', 'gpt-4o'],
    description: 'Models users may choose. The default model is always included.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  @Matches(MODEL_ID, { each: true, message: 'models contains invalid characters' })
  models?: string[];

  @ApiPropertyOptional({
    example: null,
    nullable: true,
    description:
      'Optional API URL override (e.g. an OpenAI-compatible gateway). null = vendor default.',
  })
  @IsOptional()
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true, require_tld: false })
  @MaxLength(2048)
  baseUrl?: string | null;

  @ApiPropertyOptional({ example: 2048, description: 'Maximum tokens per AI reply.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(32000)
  maxOutputTokens?: number;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional({
    example: false,
    default: false,
    description:
      'Make this the default provider. The first enabled provider becomes default automatically.',
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
