import { Router } from 'express';
import {
  emailAuthSchema,
  loginSchema,
  providerAuthSchema,
  refreshSchema,
  registerSchema,
} from '@haala/shared';
import { asyncHandler } from '../../common/http';
import { validate } from '../../common/middleware/validate';
import { authLimiter } from '../../common/middleware/rate-limit';
import { authController } from './auth.controller';

const router: Router = Router();

router.use(authLimiter);

router.post('/register', validate({ body: registerSchema }), asyncHandler(authController.register));
router.post('/login', validate({ body: loginSchema }), asyncHandler(authController.login));
/**
 * Email sign-in *and* sign-up. Behind `authLimiter` (30 per 15 min per IP) like
 * everything else here, which is what bounds the wrong-password side channel.
 */
router.post(
  '/email',
  validate({ body: emailAuthSchema }),
  asyncHandler(authController.emailAuth),
);
router.post(
  '/google',
  validate({ body: providerAuthSchema }),
  asyncHandler(authController.google),
);
router.post(
  '/apple',
  validate({ body: providerAuthSchema }),
  asyncHandler(authController.apple),
);
router.post('/refresh', validate({ body: refreshSchema }), asyncHandler(authController.refresh));
router.post('/logout', validate({ body: refreshSchema }), asyncHandler(authController.logout));

export const authRoutes = router;
