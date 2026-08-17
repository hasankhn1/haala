import type { Request, Response } from 'express';
import { AppError } from '../../common/errors';
import { sendSuccess } from '../../common/http';
import { riderService } from './rider.service';

/** The authenticated rider's user id, or 401. */
const riderUserId = (req: Request): string => {
  const id = req.auth?.userId;
  if (!id) throw AppError.unauthorized();
  return id;
};

export const riderController = {
  async me(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await riderService.getMe(riderUserId(req)));
  },

  async updateProfile(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await riderService.updateProfile(riderUserId(req), req.body));
  },

  async setAvailability(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await riderService.setAvailability(riderUserId(req), req.body));
  },

  async pushLocation(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await riderService.pushLocation(riderUserId(req), req.body));
  },

  async queue(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await riderService.queue(riderUserId(req)));
  },
};
