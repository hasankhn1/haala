import { Router } from 'express';
import {
  UserRole,
  riderLocationSchema,
  updateAvailabilitySchema,
  updateRiderProfileSchema,
} from '@haala/shared';
import { asyncHandler } from '../../common/http';
import { authenticate } from '../../common/middleware/authenticate';
import { authorize } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validate';
import { riderController } from './rider.controller';

const router: Router = Router();

// Every route here is the rider acting on their own profile.
router.use(authenticate, authorize(UserRole.Rider));

router.get('/me', asyncHandler(riderController.me));
router.patch(
  '/me',
  validate({ body: updateRiderProfileSchema }),
  asyncHandler(riderController.updateProfile),
);
router.patch(
  '/me/availability',
  validate({ body: updateAvailabilitySchema }),
  asyncHandler(riderController.setAvailability),
);
router.post(
  '/me/location',
  validate({ body: riderLocationSchema }),
  asyncHandler(riderController.pushLocation),
);
router.get('/me/queue', asyncHandler(riderController.queue));

export const ridersRoutes = router;
