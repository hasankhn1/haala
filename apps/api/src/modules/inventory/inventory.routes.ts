import { Router } from 'express';
import { asyncHandler } from '../../common/http';
import { authenticate } from '../../common/middleware/authenticate';
import { inventoryController } from './inventory.controller';

const router: Router = Router();

router.use(authenticate);

router.get('/:storeId/:productId', asyncHandler(inventoryController.availability));

export const inventoryRoutes = router;
