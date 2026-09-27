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
  };
};

export type AppConfig = ReturnType<typeof configuration>;
