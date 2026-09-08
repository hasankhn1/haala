import { z } from 'zod';
import type { Request, Response } from 'express';
import type { ProductsQuery } from '@haala/shared';
import { AppError } from '../../common/errors';
import { sendSuccess } from '../../common/http';
import { catalogService } from './catalog.service';

export const catalogController = {
  /** The marketplace home's department list. Public, like the rest of browsing. */
  async departments(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, await catalogService.departments());
  },

  /**
   * Everything the home screen draws.
   *
   * `storeId` is optional rather than required, unlike `product` below. The app
   * calls this the moment the tab mounts, which is often before location has
   * resolved a store — and answering with departments and banners beats
   * answering with a 400 the screen has to treat as an error state.
   */
  async home(req: Request, res: Response): Promise<void> {
    /*
     * Validated to a uuid before it goes anywhere near the cache, and that is
     * the point rather than input hygiene: `storeId` becomes part of the cache
     * key, so an unchecked value lets anyone mint unlimited keys —
     * `?storeId=1`, `?storeId=2`, … — each holding a full home payload in
     * Redis for five minutes. A bad id is treated as no store rather than
     * rejected, because the screen's own fallback is to render without one.
     */
    const raw = req.query.storeId;
    const parsed = typeof raw === 'string' ? z.string().uuid().safeParse(raw) : null;
    sendSuccess(res, await catalogService.home(parsed?.success ? parsed.data : null));
  },

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
