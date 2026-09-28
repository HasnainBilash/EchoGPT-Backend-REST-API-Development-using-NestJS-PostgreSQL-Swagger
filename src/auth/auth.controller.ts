import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ApiErrorResponses } from '../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { AuthService } from './auth.service';
import { AuthResponseDto, MessageResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { EmailVerificationService } from './email-verification.service';

/** Stricter limit for credential endpoints: 10 attempts per minute per IP. */
const CREDENTIAL_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly verification: EmailVerificationService,
  ) {}

  @Public()
  @Post('register')
  @Throttle(CREDENTIAL_THROTTLE)
  @ApiOperation({
    summary: 'Create an account',
    description: 'Creates a USER account on the Free plan and returns a token pair (auto-login).',
  })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiErrorResponses(400, 409, 429)
  register(
    @Body() dto: RegisterDto,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<AuthResponseDto> {
    return this.auth.register(dto, { ipAddress, userAgent });
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle(CREDENTIAL_THROTTLE)
  @ApiOperation({
    summary: 'Log in with email and password',
    description: 'Starts a new session (one per device) and returns an access + refresh token.',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiErrorResponses(400, 401, 403, 429)
  login(
    @Body() dto: LoginDto,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<AuthResponseDto> {
    return this.auth.login(dto, { ipAddress, userAgent });
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get a new token pair',
    description:
      'Exchanges a refresh token for a new access + refresh token. The old refresh token is ' +
      'invalidated (rotation); replaying it revokes the whole session.',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiErrorResponses(400, 401)
  refresh(@Body() dto: RefreshTokenDto): Promise<AuthResponseDto> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @Throttle(CREDENTIAL_THROTTLE)
  @ApiOperation({
    summary: 'Verify an email address',
    description:
      'Confirms the address with the token from the verification email. Tokens are single-use ' +
      'and expire after 24 hours.',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiErrorResponses(400, 429)
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<MessageResponseDto> {
    const { email } = await this.verification.verify(dto.token);
    return { message: `Email ${email} verified` };
  }

  @Public()
  @Get('verify-email')
  @Throttle(CREDENTIAL_THROTTLE)
  @ApiOperation({
    summary: 'Verify an email address (link from the email)',
    description: 'Same as POST, for the link in the email: `?token=...`.',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiErrorResponses(400, 429)
  async verifyEmailLink(@Query() dto: VerifyEmailDto): Promise<MessageResponseDto> {
    return this.verifyEmail(dto);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @Throttle(CREDENTIAL_THROTTLE)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Resend the verification email',
    description: 'Sends a new link and invalidates any previous unused one.',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiErrorResponses(401, 409, 429)
  async resendVerification(@CurrentUser() user: AuthenticatedUser): Promise<MessageResponseDto> {
    await this.verification.resend(user.id);
    return { message: 'Verification email sent' };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Log out of the current device',
    description: 'Revokes the session that owns the given refresh token.',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiErrorResponses(400, 401, 403)
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RefreshTokenDto,
  ): Promise<MessageResponseDto> {
    await this.auth.logout(user.id, dto.refreshToken);
    return { message: 'Logged out successfully' };
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Log out of all devices',
    description: 'Revokes every active session of the current user.',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiErrorResponses(401)
  async logoutAll(@CurrentUser() user: AuthenticatedUser): Promise<MessageResponseDto> {
    const count = await this.auth.logoutAll(user.id);
    return { message: `Logged out of ${count} session(s)` };
  }
}
