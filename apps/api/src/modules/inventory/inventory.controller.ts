import type { Request, Response } from 'express';
import { sendSuccess } from '../../common/http';
import { inventoryService } from './inventory.service';

export const inventoryController = {
  async availability(req: Request, res: Response): Promise<void> {
    const { storeId, productId } = req.params as { storeId: string; productId: string };
    sendSuccess(res, await inventoryService.getAvailability(storeId, productId));
  },
};
