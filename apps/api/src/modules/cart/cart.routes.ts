import { Router } from 'express';
import { addCartItemSchema, mergeCartSchema, updateCartItemSchema } from '@haala/shared';
import { asyncHandler } from '../../common/http';
import { authenticate } from '../../common/middleware/authenticate';
import { validate } from '../../common/middleware/validate';
import { cartController } from './cart.controller';

const router: Router = Router();

router.use(authenticate);

router.get('/', asyncHandler(cartController.get));
router.post('/items', validate({ body: addCartItemSchema }), asyncHandler(cartController.addItem));
/**
 * Hand over a guest basket after signing in. Authenticated like everything
 * else here — the whole point is that there is now an account to merge into.
 */
router.post('/merge', validate({ body: mergeCartSchema }), asyncHandler(cartController.merge));
router.patch(
  '/items/:variantId',
  validate({ body: updateCartItemSchema }),
  asyncHandler(cartController.updateItem),
);
router.delete('/items/:variantId', asyncHandler(cartController.removeItem));
router.delete('/', asyncHandler(cartController.clear));

export const cartRoutes = router;
