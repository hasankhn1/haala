import { Router } from 'express';
import { addCartItemSchema, updateCartItemSchema } from '@haala/shared';
import { asyncHandler } from '../../common/http';
import { authenticate } from '../../common/middleware/authenticate';
import { validate } from '../../common/middleware/validate';
import { cartController } from './cart.controller';

const router: Router = Router();

router.use(authenticate);

router.get('/', asyncHandler(cartController.get));
router.post('/items', validate({ body: addCartItemSchema }), asyncHandler(cartController.addItem));
router.patch(
  '/items/:productId',
  validate({ body: updateCartItemSchema }),
  asyncHandler(cartController.updateItem),
);
router.delete('/items/:productId', asyncHandler(cartController.removeItem));
router.delete('/', asyncHandler(cartController.clear));

export const cartRoutes = router;
