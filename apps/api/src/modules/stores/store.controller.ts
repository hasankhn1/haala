import type { Request, Response } from 'express';
import { sendSuccess } from '../../common/http';
import { storeService } from './store.service';

export const storeController = {
  async nearby(req: Request, res: Response): Promise<void> {
    const { lat, lng } = req.query as unknown as { lat: number; lng: number };
    sendSuccess(res, await storeService.findNearby(lat, lng));
  },
  async getById(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await storeService.getById(req.params.id!));
  },
};
