import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { ErrorResponseDto } from './common/dto/error-response.dto';

const BEARER_SCHEME = 'access-token';

const DESCRIPTION = `REST API for the EchoGPT multi-AI chat Chrome extension.

### How to authenticate in this page
1. Call **POST /auth/register** or **POST /auth/login**.
2. The \`accessToken\` from the response is applied to **Authorize** automatically (padlocks close).
3. Endpoints with a padlock now work. The access token expires after 15 minutes — log in again or call **/auth/refresh**.

Outside Swagger, send it as a header: \`Authorization: Bearer <accessToken>\`. It never goes in the request body.

All errors use the same format: \`{ statusCode, error, message, path, timestamp }\`.`;

const LOGIN_NOTE =
  '**Requires login** — the access token is sent in the `Authorization` header ' +
  '(click **Authorize**, or log in first on this page). Do not put it in the body.';

/** Prefixes every protected operation's description with how to authenticate. */
function annotateProtectedOperations(document: OpenAPIObject): void {
  for (const pathItem of Object.values(document.paths)) {
    for (const operation of Object.values(pathItem)) {
      const op = operation as { security?: unknown[]; description?: string };
      if (op?.security?.length) {
        op.description = op.description ? `${LOGIN_NOTE}\n\n${op.description}` : LOGIN_NOTE;
      }
    }
  }
}

/**
 * Runs in the browser (serialized by @nestjs/swagger): whenever a response issues tokens
 * (login, register, refresh, change password), applies the access token to Authorize.
 */
function autoAuthorize(res: { ok: boolean; obj?: { accessToken?: unknown } }) {
  const token = res.obj?.accessToken;
  const ui = (globalThis as { ui?: { preauthorizeApiKey(name: string, value: string): void } }).ui;
  if (res.ok && typeof token === 'string' && ui) {
    ui.preauthorizeApiKey('access-token', token);
  }
  return res;
}

export const setupSwagger = (app: INestApplication): void => {
  const config = new DocumentBuilder()
    .setTitle('EchoGPT API')
    .setDescription(DESCRIPTION)
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Paste the `accessToken` (not the refreshToken). No "Bearer " prefix.',
      },
      BEARER_SCHEME,
    )
    .build();

  const document = SwaggerModule.createDocument(app, config, { extraModels: [ErrorResponseDto] });
  annotateProtectedOperations(document);

  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs/openapi.json',
    swaggerOptions: { persistAuthorization: true, responseInterceptor: autoAuthorize },
  });
};
