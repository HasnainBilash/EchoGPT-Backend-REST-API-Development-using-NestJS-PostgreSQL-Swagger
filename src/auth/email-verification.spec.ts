import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailVerificationService } from './email-verification.service';

type Row = Record<string, unknown>;

describe('EmailVerificationService (smoke)', () => {
  let tokens: Row[];
  let sent: { to: string; text: string }[];
  let verifiedAt: Date | null;
  let service: EmailVerificationService;

  beforeEach(() => {
    tokens = [];
    sent = [];
    verifiedAt = null;
    const prisma = {
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
      emailVerificationToken: {
        deleteMany: jest.fn(() => {
          tokens = tokens.filter((t) => t.usedAt);
          return Promise.resolve({});
        }),
        create: jest.fn(({ data }: { data: Row }) => {
          tokens.push({ id: `t${tokens.length}`, usedAt: null, ...data });
          return Promise.resolve({});
        }),
        findUnique: jest.fn(({ where }: { where: { tokenHash: string } }) => {
          const row = tokens.find((t) => t.tokenHash === where.tokenHash);
          return Promise.resolve(row ? { ...row, user: { email: 'jane@example.com' } } : null);
        }),
        update: jest.fn(({ where, data }: { where: { id: string }; data: Row }) => {
          Object.assign(
            tokens.find((t) => t.id === where.id)!,
            data,
          );
          return Promise.resolve({});
        }),
      },
      user: {
        update: jest.fn(({ data }: { data: { emailVerifiedAt: Date } }) => {
          verifiedAt = data.emailVerifiedAt;
          return Promise.resolve({});
        }),
        findUnique: jest.fn(() =>
          Promise.resolve({ email: 'jane@example.com', emailVerifiedAt: verifiedAt }),
        ),
      },
    };
    const mail = {
      send: jest.fn((m: { to: string; text: string }) => {
        sent.push(m);
        return Promise.resolve();
      }),
    };
    const config = {
      get: () => ({ verificationUrl: 'http://localhost:3000/api/v1/auth/verify-email' }),
    } as unknown as ConfigService<AppConfig, true>;
    service = new EmailVerificationService(
      prisma as unknown as PrismaService,
      mail as unknown as MailService,
      config,
    );
  });

  const tokenFromEmail = () => /token=([^\s]+)/.exec(sent.at(-1)!.text)![1];

  it('emails a link, verifies once, and stores only a hash of the token', async () => {
    await service.issue('u1', 'jane@example.com');
    const token = decodeURIComponent(tokenFromEmail());

    expect(sent[0].to).toBe('jane@example.com');
    expect(tokens[0].tokenHash).not.toBe(token);
    await expect(service.verify(token)).resolves.toEqual({ email: 'jane@example.com' });
    expect(verifiedAt).toBeInstanceOf(Date);

    await expect(service.verify(token)).rejects.toThrow('already been used');
  });

  it('rejects expired tokens and replaces old links when resending', async () => {
    await service.issue('u1', 'jane@example.com');
    const first = decodeURIComponent(tokenFromEmail());
    await service.resend('u1');
    const second = decodeURIComponent(tokenFromEmail());

    await expect(service.verify(first)).rejects.toBeInstanceOf(BadRequestException);
    tokens[0].expiresAt = new Date(Date.now() - 1000);
    await expect(service.verify(second)).rejects.toThrow('expired');
  });

  it('refuses to resend once the email is verified', async () => {
    verifiedAt = new Date();
    await expect(service.resend('u1')).rejects.toBeInstanceOf(ConflictException);
  });
});
