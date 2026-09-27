import { ApiProperty } from '@nestjs/swagger';
import { IsJWT } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    description:
      'The `refreshToken` value from the login/register/refresh response. ' +
      'This is the only body field — the access token goes in the Authorization header.',
    example: 'paste-the-refreshToken-from-login-response-here',
  })
  @IsJWT()
  refreshToken: string;
}
