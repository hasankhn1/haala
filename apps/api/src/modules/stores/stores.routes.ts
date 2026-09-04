import { Router } from 'express';
import { nearbyStoresQuerySchema } from '@haala/shared';
import { asyncHandler } from '../../common/http';
import { optionalAuthenticate } from '../../common/middleware/authenticate';
import { validate } from '../../common/middleware/validate';
import { storeController } from './store.controller';

const router: Router = Router();

/**
 * Open to guests. The catalogue and the store list are what somebody sees
 * before they have any reason to trust us with an account, and the customer app
 * has had no sign-in wall since Phase 4. `optionalAuthenticate` so a signed-in
 * customer still arrives with `req.auth` populated, and an expired token means
 * "anonymous" rather than "no shop".
 */
router.use(optionalAuthenticate);

router.get('/', validate({ query: nearbyStoresQuerySchema }), asyncHandler(storeController.nearby));
router.get('/:id', asyncHandler(storeController.getById));

export const storesRoutes = router;
