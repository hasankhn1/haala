import type { Request, Response } from 'express';
import { sendSuccess } from '../../common/http';
import { paymentService } from './payment.service';
import { walletService } from './wallet.service';

export const paymentController = {
  /** GET /payments/methods — the signed-in customer's saved cards. */
  async listMethods(req: Request, res: Response): Promise<void> {
    sendSuccess(res, { cards: await walletService.list(req.auth!.userId) });
  },

  /** DELETE /payments/methods/:token */
  async removeMethod(req: Request, res: Response): Promise<void> {
    await walletService.remove(req.auth!.userId, req.params.token!);
    sendSuccess(res, { removed: true });
  },

  /** GET /payments/:orderId/status */
  async status(req: Request, res: Response): Promise<void> {
    const result = await paymentService.getStatus(req.params.orderId!);
    sendSuccess(res, result);
  },

  /** POST /payments/:orderId/verify */
  async verify(req: Request, res: Response): Promise<void> {
    const payment = await paymentService.verify(req.params.orderId!);
    sendSuccess(res, { status: payment.status });
  },

  /**
   * POST /payments/webhooks/:provider — public endpoint hit by the gateway.
   * Body is the raw payload (express.raw) so signatures can be verified.
   */
  async webhook(req: Request, res: Response): Promise<void> {
    const result = await paymentService.handleWebhook(req.params.provider!, {
      headers: req.headers,
      rawBody: req.body as Buffer,
    });
    /*
     * 2xx tells a gateway the delivery landed and it should stop retrying, so
     * a webhook we could not *verify* must not get one — that would discard
     * the only notification we were ever going to receive. 401 instead, which
     * buys their whole retry ladder to notice a wrong secret.
     *
     * Everything else is acknowledged, including deliveries we deliberately
     * ignore: retrying an unknown reference or an event we do not act on would
     * fail the same way five more times.
     */
    if (result.retryable) {
      res.status(401).json({
        ok: false,
        error: { code: 'WEBHOOK_UNVERIFIED', message: 'Signature could not be verified' },
      });
      return;
    }
    sendSuccess(res, result);
  },
};
