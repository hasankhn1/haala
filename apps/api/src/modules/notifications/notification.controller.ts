import type { Request, Response } from 'express';
import { sendSuccess } from '../../common/http';
import { notificationService } from './notification.service';

export const notificationController = {
  async list(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await notificationService.list(req.auth!.userId));
  },

  async markRead(req: Request, res: Response): Promise<void> {
    await notificationService.markRead(req.auth!.userId, req.params.id!);
    sendSuccess(res, { success: true });
  },

  async markAllRead(req: Request, res: Response): Promise<void> {
    const count = await notificationService.markAllRead(req.auth!.userId);
    sendSuccess(res, { success: true, count });
  },

  async registerToken(req: Request, res: Response): Promise<void> {
    await notificationService.registerToken(
      req.auth!.userId,
      req.body.token,
      req.body.platform ?? null,
    );
    sendSuccess(res, { success: true }, 201);
  },

  /**
   * Called on sign-out. Not scoped to the caller's own token on purpose: the
   * token identifies a device, and the point is to stop this handset receiving
   * the departing user's notifications.
   */
  async unregisterToken(req: Request, res: Response): Promise<void> {
    await notificationService.unregisterToken(req.body.token);
    sendSuccess(res, { success: true });
  },
};
