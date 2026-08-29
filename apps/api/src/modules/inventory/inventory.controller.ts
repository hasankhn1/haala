import type { Request, Response } from 'express';
import { sendSuccess } from '../../common/http';
import { inventoryService } from './inventory.service';

export const inventoryController = {
  async availability(req: Request, res: Response): Promise<void> {
    const { storeId, variantId } = req.params as { storeId: string; variantId: string };
    sendSuccess(res, await inventoryService.getAvailability(storeId, variantId));
  },
};
