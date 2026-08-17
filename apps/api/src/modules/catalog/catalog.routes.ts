import { Router } from 'express';
import { productsQuerySchema } from '@haala/shared';
import { asyncHandler } from '../../common/http';
import { authenticate } from '../../common/middleware/authenticate';
import { validate } from '../../common/middleware/validate';
import { catalogController } from './catalog.controller';

const router: Router = Router();

router.use(authenticate);

router.get('/categories', asyncHandler(catalogController.categories));
router.get(
  '/products',
  validate({ query: productsQuerySchema }),
  asyncHandler(catalogController.products),
);
router.get('/products/:id', asyncHandler(catalogController.product));

export const catalogRoutes = router;
