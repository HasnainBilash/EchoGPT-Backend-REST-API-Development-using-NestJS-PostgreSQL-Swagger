import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { PlanCode, Prisma, RoleName } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'node:crypto';
import { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { AuthResponseDto, AuthUserDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AccessTokenPayload, RefreshTokenPayload } from './types/jwt-payload.type';

export const BCRYPT_ROUNDS = 10;

export interface ClientMeta {
  ipAddress?: string;
  userAgent?: string;
}

type UserWithRole = Prisma.UserGetPayload<{ include: { role: true } }>;

@Injectable()
export class AuthService {
  private readonly jwtConfig: AppConfig['jwt'];
  /** Compared against when the email doesn't exist, so login timing doesn't reveal registered emails. */
  private readonly dummyHash = bcrypt.hashSync('timing-safe-dummy-password', BCRYPT_ROUNDS);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.jwtConfig = config.get('jwt', { infer: true });
  }

  async register(dto: RegisterDto, meta: ClientMeta): Promise<AuthResponseDto> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const [role, freePlan] = await Promise.all([
      this.prisma.role.findUnique({ where: { name: RoleName.USER } }),
      this.prisma.plan.findUnique({ where: { code: PlanCode.FREE } }),
    ]);
    if (!role || !freePlan) {
      throw new InternalServerErrorException('Reference data missing — run `npm run db:seed`');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    let user: UserWithRole;
    try {
      // Every new account starts on the Free plan.
      user = await this.prisma.user.create({
        data: {
          email: dto.email,
          passwordHash,
          fullName: dto.fullName,
          roleId: role.id,
          lastLoginAt: new Date(),
          subscription: { create: { planId: freePlan.id } },
        },
        include: { role: true },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('An account with this email already exists');
      }
      throw err;
    }

    return this.issueTokens(user, meta);
  }

  async login(dto: LoginDto, meta: ClientMeta): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { role: true },
    });

    const passwordOk = await bcrypt.compare(dto.password, user?.passwordHash ?? this.dummyHash);
    if (!user || !passwordOk) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (!user.isActive) {
      throw new ForbiddenException('This account has been deactivated');
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.issueTokens(user, meta);
  }

  /** Rotates the refresh token: the old one stops working the moment a new one is issued. */
  async refresh(refreshToken: string): Promise<AuthResponseDto> {
    const payload = await this.verifyRefreshToken(refreshToken, false);

    const session = await this.prisma.session.findUnique({ where: { id: payload.sid } });
    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    ) {
      throw new UnauthorizedException('Session expired or revoked — please log in again');
    }

    const presentedHash = this.hashToken(refreshToken);
    if (session.refreshTokenHash !== presentedHash) {
      // An already-rotated token was replayed: treat the session as compromised.
      await this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token reuse detected — session revoked');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
      include: { role: true },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account is no longer active');
    }

    const newRefreshToken = this.signRefreshToken(user.id, session.id);
    // Conditional update guards against two concurrent refreshes with the same token.
    const rotated = await this.prisma.session.updateMany({
      where: { id: session.id, refreshTokenHash: presentedHash, revokedAt: null },
      data: {
        refreshTokenHash: this.hashToken(newRefreshToken),
        expiresAt: this.expiryOf(newRefreshToken),
        lastUsedAt: new Date(),
      },
    });
    if (rotated.count !== 1) {
      throw new UnauthorizedException('Session expired or revoked — please log in again');
    }

    return this.buildResponse(user, this.signAccessToken(user), newRefreshToken);
  }

  /** Revokes the session that owns this refresh token (logout from the current device). */
  async logout(userId: string, refreshToken: string): Promise<void> {
    const payload = await this.verifyRefreshToken(refreshToken, true);
    if (payload.sub !== userId) {
      throw new ForbiddenException('This refresh token belongs to another user');
    }
    await this.prisma.session.updateMany({
      where: { id: payload.sid, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Revokes every session of the user (logout from all devices). */
  async logoutAll(userId: string): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  /** Starts a fresh session for an already-verified user (e.g. after a password change). */
  async startSession(userId: string, meta: ClientMeta): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { role: true },
    });
    return this.issueTokens(user, meta);
  }

  private async issueTokens(user: UserWithRole, meta: ClientMeta): Promise<AuthResponseDto> {
    const sessionId = randomUUID();
    const refreshToken = this.signRefreshToken(user.id, sessionId);

    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        refreshTokenHash: this.hashToken(refreshToken),
        expiresAt: this.expiryOf(refreshToken),
        ipAddress: meta.ipAddress?.slice(0, 45),
        userAgent: meta.userAgent?.slice(0, 512),
      },
    });

    return this.buildResponse(user, this.signAccessToken(user), refreshToken);
  }

  private buildResponse(
    user: UserWithRole,
    accessToken: string,
    refreshToken: string,
  ): AuthResponseDto {
    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.jwtConfig.accessTtl,
      user: this.toAuthUser(user),
    };
  }

  private toAuthUser(user: UserWithRole): AuthUserDto {
    return { id: user.id, email: user.email, fullName: user.fullName, role: user.role.name };
  }

  private signAccessToken(user: UserWithRole): string {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role.name,
      type: 'access',
    };
    return this.jwt.sign(payload, {
      secret: this.jwtConfig.accessSecret,
      expiresIn: this.jwtConfig.accessTtl as JwtSignOptions['expiresIn'],
    });
  }

  private signRefreshToken(userId: string, sessionId: string): string {
    const payload: RefreshTokenPayload = { sub: userId, sid: sessionId, type: 'refresh' };
    return this.jwt.sign(payload, {
      secret: this.jwtConfig.refreshSecret,
      expiresIn: this.jwtConfig.refreshTtl as JwtSignOptions['expiresIn'],
      // Unique per token so two tokens issued in the same second never collide.
      jwtid: randomUUID(),
    });
  }

  private async verifyRefreshToken(
    token: string,
    ignoreExpiration: boolean,
  ): Promise<RefreshTokenPayload> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(token, {
        secret: this.jwtConfig.refreshSecret,
        ignoreExpiration,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (payload.type !== 'refresh' || !payload.sid) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return payload;
  }

  private expiryOf(token: string): Date {
    const { exp } = this.jwt.decode<{ exp: number }>(token);
    return new Date(exp * 1000);
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
