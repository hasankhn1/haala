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
   * Called on sign-out, to stop this handset receiving the departing user's
   * notifications.
   *
   * Scoped to the caller. An earlier version deleted by token alone, reasoning
   * that a token identifies a device rather than a person — but that let any
   * authenticated user silence another user's notifications by passing their
   * token, and bought nothing: the device-handover case is already handled by
   * the upsert on the token's unique index when the next person signs in.
   */
  async unregisterToken(req: Request, res: Response): Promise<void> {
    await notificationService.unregisterToken(req.auth!.userId, req.body.token);
    sendSuccess(res, { success: true });
  },
};
