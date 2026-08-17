import { Router } from 'express';
import { createAddressSchema, updateAddressSchema } from '@haala/shared';
import { asyncHandler } from '../../common/http';
import { authenticate } from '../../common/middleware/authenticate';
import { validate } from '../../common/middleware/validate';
import { addressController } from './address.controller';

const router: Router = Router();

router.use(authenticate);

router.get('/', asyncHandler(addressController.list));
router.post('/', validate({ body: createAddressSchema }), asyncHandler(addressController.create));
router.patch('/:id', validate({ body: updateAddressSchema }), asyncHandler(addressController.update));
router.delete('/:id', asyncHandler(addressController.remove));
router.post('/:id/default', asyncHandler(addressController.setDefault));

export const addressesRoutes = router;
