import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { CreateProviderDto } from './create-provider.dto';

/**
 * Partial update. `type` cannot change (delete and re-create instead); enable/disable and the
 * default flag have their own endpoints so their rules are explicit.
 */
export class UpdateProviderDto extends PartialType(
  OmitType(CreateProviderDto, ['type', 'apiKey', 'isEnabled', 'isDefault'] as const),
) {
  @ApiPropertyOptional({
    example: 'sk-proj-new-key-xxxxxxxx',
    description: 'Send only to rotate the key. Omit to keep the current one.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  apiKey?: string;
}
