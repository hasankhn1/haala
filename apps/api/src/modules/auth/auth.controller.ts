import type { Request, Response } from 'express';
import { sendSuccess } from '../../common/http';
import { authService } from './auth.service';

export const authController = {
  async register(req: Request, res: Response): Promise<void> {
    const result = await authService.register(req.body);
    sendSuccess(res, result, 201);
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
