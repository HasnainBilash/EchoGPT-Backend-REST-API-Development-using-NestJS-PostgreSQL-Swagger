import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class DeleteAccountDto {
  @ApiProperty({
    example: 'Str0ngPassw0rd!',
    description: 'Your current password, to confirm the deletion.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password: string;
}
