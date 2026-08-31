import { Router } from 'express';
import { HAALA_STAFF_ROLES, placeOrderSchema, updateOrderStatusSchema } from '@haala/shared';
import { asyncHandler } from '../../common/http';
import { authenticate } from '../../common/middleware/authenticate';
import { authorize } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validate';
import { orderController } from './order.controller';

const router: Router = Router();

router.use(authenticate);

router.post('/', validate({ body: placeOrderSchema }), asyncHandler(orderController.place));
router.get('/', asyncHandler(orderController.list));
router.get('/:id', asyncHandler(orderController.getOne));
router.post('/:id/cancel', asyncHandler(orderController.cancel));

// Ops/admin: advance order status through the fulfilment lifecycle.
router.patch(
  '/:id/status',
  authorize(...HAALA_STAFF_ROLES),
  validate({ body: updateOrderStatusSchema }),
  asyncHandler(orderController.updateStatus),
);

export const ordersRoutes = router;
