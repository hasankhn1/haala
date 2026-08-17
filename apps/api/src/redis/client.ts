import { Redis } from 'ioredis';
import { config } from '../config';
import { logger } from '../common/logger';

export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
});

redis.on('error', (err) => logger.error({ err }, 'Redis error'));
redis.on('connect', () => logger.debug('Redis connecting…'));
redis.on('ready', () => logger.info('Redis ready'));

export const checkRedisConnection = async (): Promise<void> => {
  const pong = await redis.ping();
  if (pong !== 'PONG') throw new Error(`Unexpected Redis ping response: ${pong}`);
};

export const closeRedis = async (): Promise<void> => {
  await redis.quit();
};
