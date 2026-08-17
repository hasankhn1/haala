import { Router } from 'express';
import { nearbyStoresQuerySchema } from '@haala/shared';
import { asyncHandler } from '../../common/http';
import { authenticate } from '../../common/middleware/authenticate';
import { validate } from '../../common/middleware/validate';
import { storeController } from './store.controller';

const router: Router = Router();

router.use(authenticate);

router.get('/', validate({ query: nearbyStoresQuerySchema }), asyncHandler(storeController.nearby));
router.get('/:id', asyncHandler(storeController.getById));

export const storesRoutes = router;
