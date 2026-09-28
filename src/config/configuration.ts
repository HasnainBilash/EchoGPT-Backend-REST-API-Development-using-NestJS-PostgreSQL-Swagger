/**
 * Typed application configuration built from (already validated) environment variables.
 * Inject with `ConfigService<AppConfig, true>` and read with `config.get('throttle', { infer: true })`.
 */
export const configuration = () => {
  const env = process.env;
  const num = (value: string | undefined, fallback: number) =>
    value === undefined || value === '' ? fallback : Number(value);

  return {
    nodeEnv: env.NODE_ENV ?? 'development',
    isProduction: env.NODE_ENV === 'production',
    port: num(env.PORT, 3000),
    corsOrigins: (env.CORS_ORIGINS ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    swaggerEnabled: env.SWAGGER_ENABLED !== 'false',
    throttle: {
      ttl: num(env.THROTTLE_TTL_MS, 60000),
      limit: num(env.THROTTLE_LIMIT, 120),
    },
    jwt: {
      accessSecret: env.JWT_ACCESS_SECRET as string,
      accessTtl: env.JWT_ACCESS_TTL ?? '15m',
      refreshSecret: env.JWT_REFRESH_SECRET as string,
      refreshTtl: env.JWT_REFRESH_TTL ?? '30d',
    },
    crypto: { encryptionKey: env.ENCRYPTION_KEY as string },
    search: { cacheTtlSeconds: num(env.SEARCH_CACHE_TTL_SECONDS, 3600) },
    mail: {
      // Where the link in the verification email points; the token is appended as ?token=...
      verificationUrl:
        env.EMAIL_VERIFICATION_URL ||
        `http://localhost:${num(env.PORT, 3000)}/api/v1/auth/verify-email`,
      from: env.MAIL_FROM || 'EchoGPT <no-reply@echogpt.local>',
      smtp: env.SMTP_HOST
        ? {
            host: env.SMTP_HOST,
            port: num(env.SMTP_PORT, 587),
            secure: env.SMTP_SECURE === 'true',
            user: env.SMTP_USER,
            pass: env.SMTP_PASS,
          }
        : null,
    },
  };
};

export type AppConfig = ReturnType<typeof configuration>;
