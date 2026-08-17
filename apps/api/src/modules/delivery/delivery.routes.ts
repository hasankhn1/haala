import { Router } from 'express';
import { UserRole, advanceDeliverySchema, claimOrderSchema } from '@haala/shared';
import { asyncHandler } from '../../common/http';
import { authenticate } from '../../common/middleware/authenticate';
import { authorize } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validate';
import { deliveryController } from './delivery.controller';

/**
 * Rider delivery workflow.
 *
 * The scaffold sketched one endpoint per step (accept / pickup / arrive / …).
 * They collapse into a single `/status` transition validated against
 * `DELIVERY_STATUS_FLOW`, so adding a step is a change to the flow map rather
 * than a new route, and the legal transitions live in exactly one place.
 * `collect-cod` stays separate because it isn't a state change — it records
 * that cash changed hands.
 */
const router: Router = Router();

router.use(authenticate, authorize(UserRole.Rider));

router.get('/assignments', asyncHandler(deliveryController.list));
router.post(
  '/assignments',
  validate({ body: claimOrderSchema }),
  asyncHandler(deliveryController.claim),
);
router.post(
  '/assignments/:id/status',
  validate({ body: advanceDeliverySchema }),
  asyncHandler(deliveryController.advance),
);
router.post('/assignments/:id/collect-cod', asyncHandler(deliveryController.collectCod));

export const deliveryRoutes = router;
