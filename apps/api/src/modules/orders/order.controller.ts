import type { Request, Response } from 'express';
import { AppError } from '../../common/errors';
import { sendSuccess } from '../../common/http';
import { orderService } from './order.service';

export const orderController = {
  async place(req: Request, res: Response): Promise<void> {
    const idempotencyKey = req.header('Idempotency-Key') ?? undefined;
    const result = await orderService.placeOrder(req.auth!.userId, req.body, idempotencyKey);
    sendSuccess(res, result, 201);
  },

  async list(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await orderService.listMine(req.auth!.userId));
  },

  /**
   * Requires `storeId`, unlike the home payload which tolerates its absence.
   * The difference is that this endpoint has nothing to say without one: every
   * field on the card — price, stock, whether the product is carried at all —
   * is a per-store answer.
   */
  async recentlyOrdered(req: Request, res: Response): Promise<void> {
    const storeId = req.query.storeId;
    if (typeof storeId !== 'string' || !storeId) {
      throw AppError.badRequest('storeId query parameter is required');
    }
    sendSuccess(res, await orderService.recentlyOrdered(req.auth!.userId, storeId));
  },

  async getOne(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await orderService.getMine(req.auth!.userId, req.params.id!));
  },

  async cancel(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await orderService.cancel(req.auth!.userId, req.params.id!));
  },

  async updateStatus(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await orderService.updateStatus(req.params.id!, req.body, req.auth!.userId));
  },
};
