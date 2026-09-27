import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ErrorResponseDto } from '../dto/error-response.dto';

const DESCRIPTIONS: Record<number, [string, string]> = {
  400: ['Bad Request', 'Validation failed or malformed request'],
  401: ['Unauthorized', 'Missing, invalid or expired access token'],
  403: ['Forbidden', 'Not allowed to perform this action'],
  404: ['Not Found', 'Resource not found'],
  409: ['Conflict', 'Resource already exists or state conflict'],
  429: ['Too Many Requests', 'Rate limit or plan usage limit exceeded'],
  502: ['Bad Gateway', 'Upstream AI provider / search engine returned an error'],
  503: ['Service Unavailable', 'Service or dependency unavailable'],
};

/** Adds documented error responses (with example bodies) to a Swagger operation. */
export const ApiErrorResponses = (...statuses: number[]) =>
  applyDecorators(
    ...statuses.map((status) => {
      const [error, description] = DESCRIPTIONS[status] ?? ['Error', 'Error'];
      return ApiResponse({
        status,
        description,
        type: ErrorResponseDto,
        example: {
          statusCode: status,
          error,
          message: description,
          path: '/api/v1/...',
          timestamp: '2026-09-28T10:00:00.000Z',
        },
      });
    }),
  );
