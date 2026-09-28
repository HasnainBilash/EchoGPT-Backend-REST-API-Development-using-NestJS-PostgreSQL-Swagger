import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({
    example: 'paste-the-token-from-the-verification-link',
    description: 'The `token` query parameter of the link in the verification email.',
  })
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token: string;
}
