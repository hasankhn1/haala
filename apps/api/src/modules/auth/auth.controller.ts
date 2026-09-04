import type { Request, Response } from 'express';
import { sendSuccess } from '../../common/http';
import { authService } from './auth.service';

export const authController = {
  async register(req: Request, res: Response): Promise<void> {
    // Nothing is logged here on purpose. This body carries a plaintext
    // password, and a `console.log(req.body)` used to put it straight into the
    // request log where it would sit indefinitely.
    const result = await authService.register(req.body);
    sendSuccess(res, result, 201);
  },

  /**
   * 201 when the account was created, 200 when it already existed — so the
   * client can confirm a new account rather than silently making one.
   */
  async emailAuth(req: Request, res: Response): Promise<void> {
    const result = await authService.emailAuth(req.body);
    sendSuccess(res, result, result.created ? 201 : 200);
  },

  async login(req: Request, res: Response): Promise<void> {
    const result = await authService.login(req.body);
    sendSuccess(res, result);
  },

  async refresh(req: Request, res: Response): Promise<void> {
    const result = await authService.refresh(req.body.refreshToken);
    sendSuccess(res, result);
  },

  async logout(req: Request, res: Response): Promise<void> {
    await authService.logout(req.body.refreshToken);
    sendSuccess(res, { success: true });
  },
};
