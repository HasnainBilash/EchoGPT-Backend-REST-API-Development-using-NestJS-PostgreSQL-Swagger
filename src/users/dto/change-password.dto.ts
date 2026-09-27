import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { StrongPassword } from '../../common/decorators/strong-password.decorator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'Str0ngPassw0rd!', description: 'Your current password.' })
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  currentPassword: string;

  @ApiProperty({
    example: 'N3wStr0ngPassw0rd!',
    description: 'At least 8 characters, with at least one letter and one number.',
  })
  @StrongPassword()
  newPassword: string;
}
