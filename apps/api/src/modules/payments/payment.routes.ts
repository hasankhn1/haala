import express, { Router } from 'express';
import { asyncHandler } from '../../common/http';
import { authenticate } from '../../common/middleware/authenticate';
import { paymentController } from './payment.controller';

const router: Router = Router();

/**
 * Webhook endpoint is public and needs the RAW body for signature verification,
 * so it uses express.raw() instead of the global JSON parser.
 */
router.post(
  '/webhooks/:provider',
  express.raw({ type: '*/*' }),
  asyncHandler(paymentController.webhook),
);

router.get('/:orderId/status', authenticate, asyncHandler(paymentController.status));
router.post('/:orderId/verify', authenticate, asyncHandler(paymentController.verify));

export const paymentRoutes = router;
