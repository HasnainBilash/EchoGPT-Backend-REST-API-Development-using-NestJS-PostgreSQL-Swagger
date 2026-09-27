import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Logs every request to `api_usage_logs` for the admin analytics/request-log endpoints.
 * Runs on `res.finish` so the final status code is always captured, success or error.
 * The user id is read from the access token without verifying it (logging only, not auth) —
 * an invalid/expired token just logs as anonymous.
 */
@Injectable()
export class ApiUsageLoggerMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();

    res.on('finish', () => {
      const data = {
        userId: this.decodeUserId(req),
        method: req.method,
        path: (req.originalUrl || req.url).slice(0, 2048),
        statusCode: res.statusCode,
        durationMs: Date.now() - start,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')?.slice(0, 512),
      };
      // A token for a deleted/unknown user fails the FK — keep the log row, just anonymous.
      this.prisma.apiUsageLog
        .create({ data })
        .catch(() => this.prisma.apiUsageLog.create({ data: { ...data, userId: undefined } }))
        .catch(() => undefined);
    });

    next();
  }

  private decodeUserId(req: Request): string | undefined {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return undefined;

    const token = header.slice(7);
    const payloadSegment = token.split('.')[1];
    if (!payloadSegment) return undefined;

    try {
      const json = Buffer.from(payloadSegment, 'base64url').toString('utf8');
      const payload = JSON.parse(json) as { sub?: unknown };
      return typeof payload.sub === 'string' ? payload.sub : undefined;
    } catch {
      return undefined;
    }
  }
}
