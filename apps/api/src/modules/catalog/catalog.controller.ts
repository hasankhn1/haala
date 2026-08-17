import type { Request, Response } from 'express';
import type { ProductsQuery } from '@haala/shared';
import { AppError } from '../../common/errors';
import { sendSuccess } from '../../common/http';
import { catalogService } from './catalog.service';

export const catalogController = {
  async categories(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, await catalogService.listCategories());
  },

  async products(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await catalogService.listProducts(req.query as unknown as ProductsQuery));
  },

  async product(req: Request, res: Response): Promise<void> {
    const storeId = req.query.storeId as string | undefined;
    if (!storeId) throw AppError.badRequest('storeId query parameter is required');
    sendSuccess(res, await catalogService.getProduct(req.params.id!, storeId));
  },
};
