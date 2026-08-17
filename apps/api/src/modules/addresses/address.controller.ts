import type { Request, Response } from 'express';
import { sendSuccess } from '../../common/http';
import { addressService } from './address.service';

export const addressController = {
  async list(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await addressService.list(req.auth!.userId));
  },
  async create(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await addressService.create(req.auth!.userId, req.body), 201);
  },
  async update(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await addressService.update(req.auth!.userId, req.params.id!, req.body));
  },
  async remove(req: Request, res: Response): Promise<void> {
    await addressService.remove(req.auth!.userId, req.params.id!);
    sendSuccess(res, { success: true });
  },
  async setDefault(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await addressService.setDefault(req.auth!.userId, req.params.id!));
  },
};
