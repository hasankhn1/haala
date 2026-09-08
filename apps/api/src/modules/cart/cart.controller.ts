import type { Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../../common/errors';
import { sendSuccess } from '../../common/http';
import { cartService } from './cart.service';

/** A business-type key, as it arrives on the query string or a path. */
const departmentSchema = z.string().min(1).max(40);

function requireDepartment(value: unknown): string {
  const parsed = departmentSchema.safeParse(value);
  if (!parsed.success) throw AppError.badRequest('department is required');
  return parsed.data;
}

export const cartController = {
  /**
   * Every basket, not one.
   *
   * The Cart tab's switcher needs each basket's count to draw itself, and the
   * tab-bar badge needs the total across all of them. Fetching per department
   * would let the tabs disagree with the basket underneath.
   */
  async get(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await cartService.getBaskets(req.auth!.userId));
  },
  async merge(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await cartService.merge(req.auth!.userId, req.body));
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
  /** Empties one department's basket; `department` says which. */
  async clear(req: Request, res: Response): Promise<void> {
    const department = requireDepartment(req.query.department);
    sendSuccess(res, await cartService.clear(req.auth!.userId, department));
  },
};
