import type { Request, Response } from 'express';
import { sendSuccess } from '../../common/http';
import { cartService } from './cart.service';

export const cartController = {
  async get(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await cartService.getCart(req.auth!.userId));
  },
  async addItem(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await cartService.addItem(req.auth!.userId, req.body), 201);
  },
  async updateItem(req: Request, res: Response): Promise<void> {
    sendSuccess(
      res,
      await cartService.updateItem(req.auth!.userId, req.params.variantId!, req.body.quantity),
    );
  },
  async removeItem(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await cartService.removeItem(req.auth!.userId, req.params.variantId!));
  },
  async clear(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await cartService.clear(req.auth!.userId));
  },
};
