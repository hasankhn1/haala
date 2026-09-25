import express, { Router } from 'express';
import { savedCardTokenSchema } from '@haala/shared';
import { asyncHandler } from '../../common/http';
import { authenticate } from '../../common/middleware/authenticate';
import { validate } from '../../common/middleware/validate';
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

/**
 * Where a hosted checkout sends the customer's browser back.
 *
 * Public, unauthenticated and deliberately dumb: it serves a page that bounces
 * to `haala://order/confirmed`, which is the deep link the customer app is
 * already watching for (`src/lib/onlineCheckout.ts`).
 *
 * It exists because a gateway's hosted page may refuse a non-HTTP return URL,
 * and because Rapid Gateway returns the URL **exactly as submitted** with
 * nothing appended in LIVE — so there is nothing here worth reading anyway.
 * Their sandbox does append result parameters; those are ignored on purpose,
 * since building on them would break the day we go live.
 *
 * **Reaching this page is not proof of payment.** A wallet approval still
 * pending returns the customer here too. The app shows order state from our own
 * record, and that record only changes on a verified webhook.
 */
router.get(
  '/return/:provider',
  asyncHandler(async (_req, res) => {
    res
      .status(200)
      .type('html')
      .send(
        '<!doctype html><meta charset="utf-8">' +
          '<meta http-equiv="refresh" content="0;url=haala://order/confirmed">' +
          '<title>Returning to Haala</title>' +
          '<body style="font-family:system-ui;padding:32px;text-align:center">' +
          '<p>Confirming your payment…</p>' +
          '<p><a href="haala://order/confirmed">Return to Haala</a></p>' +
          '</body>',
      );
  }),
);

/**
 * Saved cards. Registered before the `/:orderId/…` routes so a literal segment
 * is never read as an order id.
 *
 * There is no parameter for *whose* wallet: the customer token comes from the
 * authenticated user's own row. Accepting a `cus_…` here would let anyone who
 * guessed one list and delete somebody else's cards.
 */
router.get('/methods', authenticate, asyncHandler(paymentController.listMethods));
router.delete(
  '/methods/:token',
  authenticate,
  validate({ params: savedCardTokenSchema }),
  asyncHandler(paymentController.removeMethod),
);

router.get('/:orderId/status', authenticate, asyncHandler(paymentController.status));
router.post('/:orderId/verify', authenticate, asyncHandler(paymentController.verify));

export const paymentRoutes = router;
