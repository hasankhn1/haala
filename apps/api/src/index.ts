import { config } from './config';
import { logger } from './common/logger';
import { createServer } from './server';
import { checkDbConnection, closeDb } from './db/client';
import { checkRedisConnection, closeRedis } from './redis/client';

const bootstrap = async (): Promise<void> => {
  // Verify infra up front. In dev we warn and continue (so /health shows the
  // problem); in production a bad connection should stop the boot.
  try {
    await Promise.all([checkDbConnection(), checkRedisConnection()]);
    logger.info('Postgres + Redis reachable');
  } catch (err) {
    if (config.isProd) throw err;
    logger.warn({ err }, 'Infra check failed — starting anyway (dev). Check `pnpm infra:up`.');
  }

  const server = createServer();
  server.listen(config.port, () => {
    logger.info(`API listening on http://localhost:${config.port}${config.apiPrefix}`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down…');
    server.close();
    await Promise.allSettled([closeDb(), closeRedis()]);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
};

bootstrap().catch((err) => {
  logger.error({ err }, 'Failed to start API');
  process.exit(1);
});
