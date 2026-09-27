import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';
import { setupSwagger } from './swagger';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService<AppConfig, true>);
  const logger = new Logger('Bootstrap');

  // Security headers + trust the reverse proxy for the real client IP.
  app.use(helmet());
  app.set('trust proxy', 1);

  // The Chrome extension calls from chrome-extension://<id>; allowed origins come from CORS_ORIGINS.
  const origins = config.get('corsOrigins', { infer: true });
  app.enableCors({
    origin: origins.length ? origins : !config.get('isProduction', { infer: true }),
  });

  // All routes live under /api/v1/...
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Validate every request body/query against its DTO and strip unknown fields.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();

  if (config.get('swaggerEnabled', { infer: true })) {
    setupSwagger(app);
  }

  const port = config.get('port', { infer: true });
  await app.listen(port);
  logger.log(`API running on http://localhost:${port}/api/v1`);
  logger.log(`Swagger docs on http://localhost:${port}/docs`);
}

void bootstrap();
