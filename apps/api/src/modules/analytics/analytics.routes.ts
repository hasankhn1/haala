import { Router } from 'express';
import { HAALA_STAFF_ROLES, analyticsQuerySchema } from '@haala/shared';
import { asyncHandler } from '../../common/http';
import { authenticate } from '../../common/middleware/authenticate';
import { authorize } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validate';
import { analyticsController } from './analytics.controller';

const router: Router = Router();

/** Admin-only: this exposes revenue and every rider's performance. */
router.use(authenticate, authorize(...HAALA_STAFF_ROLES));

router.get(
  '/overview',
  validate({ query: analyticsQuerySchema }),
  asyncHandler(analyticsController.overview),
);

export const analyticsRoutes = router;
