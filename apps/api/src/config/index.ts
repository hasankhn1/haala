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
  payments: {
    onlineProvider: env.PAYMENT_ONLINE_PROVIDER,
  },
} as const;

export type AppConfig = typeof config;
