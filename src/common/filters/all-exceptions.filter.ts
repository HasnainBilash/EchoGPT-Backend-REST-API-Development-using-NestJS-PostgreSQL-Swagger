import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { STATUS_CODES } from 'node:http';
import { ErrorResponseDto } from '../dto/error-response.dto';

/**
 * Turns every thrown error into the same {@link ErrorResponseDto} shape.
 * Common Prisma errors get proper HTTP statuses; unknown errors return 500 without leaking internals.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const { status, message } = this.resolve(exception);

    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.originalUrl} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    // A streaming response may already have started.
    if (res.headersSent) {
      res.end();
      return;
    }

    const body: ErrorResponseDto = {
      statusCode: status,
      error: STATUS_CODES[status] ?? 'Error',
      message,
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
    };
    res.status(status).json(body);
  }

  private resolve(exception: unknown): { status: number; message: string | string[] } {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const message =
        typeof response === 'string'
          ? response
          : ((response as { message?: string | string[] }).message ?? exception.message);
      return { status: exception.getStatus(), message };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': // unique constraint
          return { status: HttpStatus.CONFLICT, message: 'Resource already exists' };
        case 'P2025': // record not found
          return { status: HttpStatus.NOT_FOUND, message: 'Resource not found' };
        case 'P2003': // foreign key
          return {
            status: HttpStatus.CONFLICT,
            message: 'Operation violates a relation constraint',
          };
      }
    }

    return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' };
  }
}
