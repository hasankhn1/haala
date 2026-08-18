import type { Request, Response } from 'express';
import { sendSuccess } from '../../common/http';
import { analyticsService } from './analytics.service';

export const analyticsController = {
  async overview(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await analyticsService.overview(req.query));
  },
};
