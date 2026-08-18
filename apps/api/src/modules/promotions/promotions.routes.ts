import { Router } from 'express';
import { UserRole, createPromotionSchema, updatePromotionSchema, validatePromoSchema } from '@haala/shared';
import { asyncHandler } from '../../common/http';
import { authenticate } from '../../common/middleware/authenticate';
import { authorize } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validate';
import { promotionController } from './promotion.controller';

const router: Router = Router();

/** Active promotions, for showing offers in-app. Public — these are marketing. */
router.get('/', asyncHandler(promotionController.listActive));

/** Price a code against the caller's cart. Authenticated: per-user limits apply. */
router.post(
  '/validate',
  authenticate,
  validate({ body: validatePromoSchema }),
  asyncHandler(promotionController.validate),
);

// ── Admin ──
router.get('/all', authenticate, authorize(UserRole.Admin), asyncHandler(promotionController.listAll));
router.post(
  '/',
  authenticate,
  authorize(UserRole.Admin),
  validate({ body: createPromotionSchema }),
  asyncHandler(promotionController.create),
);
router.patch(
  '/:id',
  authenticate,
  authorize(UserRole.Admin),
  validate({ body: updatePromotionSchema }),
  asyncHandler(promotionController.update),
);

export const promotionsRoutes = router;
