import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/** Global guard: every route requires a valid access token unless marked @Public(). */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }

  /** Replaces passport's bare "Unauthorized" with a message that says what went wrong. */
  override handleRequest<TUser>(err: unknown, user: TUser, info: unknown): TUser {
    if (err instanceof Error) {
      throw err;
    }
    if (user) {
      return user;
    }

    const reason = info instanceof Error ? info.name : undefined;
    if (reason === 'TokenExpiredError') {
      throw new UnauthorizedException('Access token expired — refresh it or log in again');
    }
    if (reason === 'JsonWebTokenError') {
      throw new UnauthorizedException(
        'Invalid access token — make sure you sent the accessToken, not the refreshToken',
      );
    }
    throw new UnauthorizedException(
      'Missing access token — send "Authorization: Bearer <accessToken>"',
    );
  }
}
