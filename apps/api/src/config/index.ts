import { env } from './env';

export { env };

export const config = {
  env: env.NODE_ENV,
  isProd: env.NODE_ENV === 'production',
  isDev: env.NODE_ENV === 'development',
  port: env.PORT,
  apiPrefix: env.API_PREFIX,
  logLevel: env.LOG_LEVEL,

  database: {
    url: env.DATABASE_URL,
  },
  redis: {
    url: env.REDIS_URL,
  },
  jwt: {
    accessSecret: env.JWT_ACCESS_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    accessTtl: env.JWT_ACCESS_TTL,
    refreshTtl: env.JWT_REFRESH_TTL,
  },
  cors: {
    origins: env.CORS_ORIGINS === '*' ? '*' : env.CORS_ORIGINS.split(',').map((o) => o.trim()),
  },
  /**
   * `enabled` is the whole set being present. Every consumer checks it rather
   * than testing four variables and getting one of them wrong.
   */
  r2: {
    enabled: Boolean(
      env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET,
    ),
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucket: env.R2_BUCKET,
    publicBaseUrl: env.R2_PUBLIC_BASE_URL?.replace(/\/$/, ''),
  },

  payments: {
    onlineProvider: env.PAYMENT_ONLINE_PROVIDER,
    safepay: {
      apiKey: env.SAFEPAY_API_KEY,
      secretKey: env.SAFEPAY_SECRET_KEY,
      webhookSecret: env.SAFEPAY_WEBHOOK_SECRET,
      baseUrl: env.SAFEPAY_BASE_URL.replace(/\/$/, ''),
      environment: env.SAFEPAY_ENVIRONMENT,
    },
  },
} as const;

export type AppConfig = typeof config;
