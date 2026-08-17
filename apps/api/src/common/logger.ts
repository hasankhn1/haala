import pino from 'pino';
import { config } from '../config';

export const logger = pino({
  level: config.logLevel,
  transport: config.isDev
    ? {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
      }
    : undefined,
  redact: {
    paths: ['req.headers.authorization', 'req.body.password', '*.password', '*.refreshToken'],
    censor: '[redacted]',
  },
});
