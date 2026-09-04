import type { Request, Response } from 'express';
import { UserRole } from '@haala/shared';
import { sendSuccess } from '../../common/http';
import { userService } from './user.service';

/** Thin HTTP layer — no business logic, just translate req → service → envelope. */
export const userController = {
  async me(req: Request, res: Response): Promise<void> {
    const profile = await userService.getProfile(req.auth!.userId);
    sendSuccess(res, profile);
  },

  /** The ways this customer can sign in. Never includes `providerUserId`. */
  async myProviders(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await userService.listProviders(req.auth!.userId));
  },

  async updateMe(req: Request, res: Response): Promise<void> {
    const profile = await userService.updateProfile(req.auth!.userId, req.body);
    sendSuccess(res, profile);
  },

  /** Admin: create a rider/admin/customer account. */
  async create(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await userService.adminCreate(req.body), 201);
  },

  /** Admin: list accounts, optionally filtered by role (`?role=rider`). */
  async list(req: Request, res: Response): Promise<void> {
    const role = (req.query.role as UserRole | undefined) ?? UserRole.Customer;
    sendSuccess(res, await userService.listByRole(role));
  },
};
