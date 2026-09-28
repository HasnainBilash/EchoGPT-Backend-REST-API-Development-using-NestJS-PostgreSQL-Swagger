import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { AppConfig } from '../config/configuration';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

export const VERIFICATION_TTL_HOURS = 24;

/**
 * Single-use email verification links. The token is random (32 bytes); only its SHA-256 hash is
 * stored, so a database leak cannot be used to verify accounts. Issuing a new token replaces any
 * unused older one.
 */
@Injectable()
export class EmailVerificationService {
  private readonly verificationUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.verificationUrl = config.get('mail', { infer: true }).verificationUrl;
  }

  async issue(userId: string, email: string): Promise<void> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + VERIFICATION_TTL_HOURS * 3_600_000);

    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.deleteMany({ where: { userId, usedAt: null } }),
      this.prisma.emailVerificationToken.create({
        data: { userId, tokenHash: hashToken(token), expiresAt },
      }),
    ]);

    const link = `${this.verificationUrl}?token=${encodeURIComponent(token)}`;
    await this.mail.send({
      to: email,
      subject: 'Verify your EchoGPT email address',
      text:
        `Welcome to EchoGPT!\n\nConfirm your email address by opening this link:\n${link}\n\n` +
        `The link expires in ${VERIFICATION_TTL_HOURS} hours. If you did not create an account, ignore this email.`,
      html:
        `<p>Welcome to EchoGPT!</p><p><a href="${link}">Confirm your email address</a></p>` +
        `<p>The link expires in ${VERIFICATION_TTL_HOURS} hours. If you did not create an account, ignore this email.</p>`,
    });
  }

  async verify(token: string): Promise<{ email: string }> {
    const row = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { select: { email: true } } },
    });
    if (!row || row.usedAt) {
      throw new BadRequestException('This verification link is invalid or has already been used');
    }
    if (row.expiresAt <= new Date()) {
      throw new BadRequestException('This verification link has expired — request a new one');
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.update({ where: { id: row.id }, data: { usedAt: now } }),
      this.prisma.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: now } }),
    ]);
    return { email: row.user.email };
  }

  async resend(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, emailVerifiedAt: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.emailVerifiedAt) {
      throw new ConflictException('Your email address is already verified');
    }
    await this.issue(userId, user.email);
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
