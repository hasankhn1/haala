import type { Request, Response } from 'express';
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
