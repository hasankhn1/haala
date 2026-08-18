import type { Request, Response } from 'express';
import { sendSuccess } from '../../common/http';
import { cartService } from '../cart/cart.service';
import { promotionService } from './promotion.service';

export const promotionController = {
  /**
   * Preview a promo code against the caller's live cart. Deliberately prices
   * the *server's* view of the cart rather than a client-supplied subtotal —
   * otherwise a crafted request could quote a discount against a fake total.
   */
  async validate(req: Request, res: Response): Promise<void> {
    const userId = req.auth!.userId;
    const { subtotal, deliveryFee } = await cartService.totals(userId);
    const quote = await promotionService.quote(userId, req.body.code, subtotal, deliveryFee);
    const { promotionId: _ignored, ...view } = quote;
    sendSuccess(res, view);
  },

  async listActive(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, await promotionService.listActive());
  },

  async listAll(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, await promotionService.listAll());
  },

  async create(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await promotionService.create(req.body), 201);
  },

  async update(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await promotionService.update(req.params.id!, req.body));
  },
};
