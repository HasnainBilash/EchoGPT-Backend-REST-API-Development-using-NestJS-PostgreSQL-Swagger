import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PageMetaDto } from '../../common/dto/pagination.dto';
import { ProviderRefDto } from '../../chat/dto/chat-response.dto';
import { UsageCounterDto } from '../../subscriptions/dto/usage.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class SearchQueryDto {
  @ApiProperty({ example: 'NestJS' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  query: string;

  @ApiPropertyOptional({
    example: true,
    default: true,
    description: 'Ask an AI provider to summarize the results (AI-assisted search).',
  })
  @IsOptional()
  @IsBoolean()
  summarize?: boolean;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Provider for the summary (from GET /providers). Omit for the default.',
  })
  @IsOptional()
  @IsUUID()
  providerId?: string;
}

export class SuggestionsQueryDto {
  @ApiProperty({ example: 'nest', description: 'What the user has typed so far.' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  q: string;
}

export class RecentQueryDto {
  @ApiPropertyOptional({ example: 10, default: 10, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 10;
}

export class SearchResultItemDto {
  @ApiProperty({ example: 'NestJS' })
  title: string;

  @ApiProperty({ example: 'https://en.wikipedia.org/wiki/NestJS' })
  url: string;

  @ApiProperty({ example: 'NestJS is a server-side Node.js web framework…' })
  snippet: string;

  @ApiProperty({ example: 'Wikipedia' })
  source: string;
}

export class SearchSummaryDto {
  @ApiProperty({ example: '3f1c2d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f' })
  id: string;

  @ApiProperty({ example: 'NestJS' })
  query: string;

  @ApiProperty({ example: 'duckduckgo' })
  engine: string;

  @ApiProperty({ example: 5 })
  resultCount: number;

  @ApiProperty({ example: true, description: 'Whether an AI summary was saved.' })
  hasSummary: boolean;

  @ApiProperty({ example: 420, nullable: true, type: Number })
  latencyMs: number | null;

  @ApiProperty({ example: '2026-09-28T10:00:00.000Z' })
  createdAt: Date;
}

export class SearchDetailDto extends SearchSummaryDto {
  @ApiProperty({ type: SearchResultItemDto, isArray: true })
  results: SearchResultItemDto[];

  @ApiProperty({
    example: 'NestJS is a TypeScript framework for building server-side apps [1].',
    nullable: true,
    type: String,
  })
  summary: string | null;

  @ApiProperty({
    type: ProviderRefDto,
    nullable: true,
    description: 'Provider that wrote the summary.',
  })
  provider: ProviderRefDto | null;
}

export class SearchResponseDto extends SearchDetailDto {
  @ApiProperty({
    example: null,
    nullable: true,
    type: String,
    description: 'Why no summary was produced (results are still returned).',
  })
  summaryError: string | null;

  @ApiProperty({ type: UsageCounterDto, description: 'Search quota after this request.' })
  usage: UsageCounterDto;
}

export class SearchPageDto {
  @ApiProperty({ type: SearchSummaryDto, isArray: true })
  items: SearchSummaryDto[];

  @ApiProperty({ type: PageMetaDto })
  meta: PageMetaDto;
}

export class RecentSearchDto {
  @ApiProperty({ example: 'NestJS' })
  query: string;

  @ApiProperty({ example: '2026-09-28T10:00:00.000Z' })
  lastSearchedAt: Date;
}

export class SuggestionDto {
  @ApiProperty({ example: 'nestjs' })
  text: string;

  @ApiProperty({ enum: ['history', 'web'], example: 'history' })
  source: 'history' | 'web';
}
