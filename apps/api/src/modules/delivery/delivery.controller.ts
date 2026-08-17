import type { Request, Response } from 'express';
import { AppError } from '../../common/errors';
import { sendSuccess } from '../../common/http';
import { deliveryService } from './delivery.service';

const riderUserId = (req: Request): string => {
  const id = req.auth?.userId;
  if (!id) throw AppError.unauthorized();
  return id;
};

export const deliveryController = {
  async list(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await deliveryService.listMine(riderUserId(req)));
  },

  async claim(req: Request, res: Response): Promise<void> {
    const view = await deliveryService.claim(riderUserId(req), req.body.orderId);
    sendSuccess(res, view, 201);
  },

  async advance(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    sendSuccess(res, await deliveryService.advance(riderUserId(req), id, req.body));
  },

  async collectCod(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    sendSuccess(res, await deliveryService.collectCod(riderUserId(req), id));
  },
};
