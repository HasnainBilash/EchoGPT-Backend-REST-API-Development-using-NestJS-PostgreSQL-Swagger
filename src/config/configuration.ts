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
  };
};

export type AppConfig = ReturnType<typeof configuration>;
