import type { Request, Response } from 'express';
import { sendSuccess } from '../../common/http';
import { paymentService } from './payment.service';

export const paymentController = {
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
    sendSuccess(res, result);
  },
};
