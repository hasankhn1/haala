import './common/types'; // load Express Request augmentation
import path from 'node:path';
import express, { type Express, type Request, type Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import pinoHttp from 'pino-http';
import { config } from './config';
import { logger } from './common/logger';
import { asyncHandler } from './common/http';
import { requestId } from './common/middleware/request-id';
import { errorHandler } from './common/middleware/error-handler';
import { notFound } from './common/middleware/not-found';
import { apiLimiter } from './common/middleware/rate-limit';
import { apiRouter } from './routes';
import { checkDbConnection } from './db/client';
import { checkRedisConnection } from './redis/client';

const webhookPrefix = `${config.apiPrefix}/payments/webhooks`;

const healthHandler = async (_req: Request, res: Response): Promise<void> => {
  const [dbResult, redisResult] = await Promise.allSettled([
    checkDbConnection(),
    checkRedisConnection(),
  ]);
  const services = {
    db: dbResult.status === 'fulfilled' ? 'up' : 'down',
    redis: redisResult.status === 'fulfilled' ? 'up' : 'down',
  };
  const healthy = services.db === 'up' && services.redis === 'up';
  res.status(healthy ? 200 : 503).json({
    ok: healthy,
    status: healthy ? 'ok' : 'degraded',
    services,
    uptime: process.uptime(),
  });
};

export const createApp = (): Express => {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestId);
  app.use(helmet());
  app.use(cors({ origin: config.cors.origins }));
  app.use(compression());
  app.use(pinoHttp({ logger, genReqId: (req) => req.id }));

  // Global JSON parser — but NOT for payment webhooks, which need the raw body
  // for signature verification (handled by express.raw in payment.routes).
  app.use((req, res, next) => {
    if (req.path.startsWith(webhookPrefix)) return next();
    express.json({ limit: '1mb' })(req, res, next);
  });

  /**
   * Product imagery, served from `apps/api/public`.
   *
   * Originally these hot-linked Wikimedia thumbnails, which cost ~150-250 KB
   * each from a European CDN — on a phone that meant 1-2 minutes to fill a
   * product grid. They're now downloaded once, resized to 400px and served
   * locally, which also removes the dependency on someone else's User-Agent
   * policy. Long-lived cache headers because filenames are stable per product.
   */
  app.use(
    '/static',
    express.static(path.join(process.cwd(), 'public'), {
      maxAge: '7d',
      fallthrough: true,
    }),
  );

  app.get('/health', asyncHandler(healthHandler));
  app.use(config.apiPrefix, apiLimiter, apiRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
};
