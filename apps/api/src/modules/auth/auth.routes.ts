import { Router } from 'express';
import { loginSchema, refreshSchema, registerSchema } from '@haala/shared';
import { asyncHandler } from '../../common/http';
import { validate } from '../../common/middleware/validate';
import { authLimiter } from '../../common/middleware/rate-limit';
import { authController } from './auth.controller';

const router: Router = Router();

router.use(authLimiter);

router.post('/register', validate({ body: registerSchema }), asyncHandler(authController.register));
router.post('/login', validate({ body: loginSchema }), asyncHandler(authController.login));
router.post('/refresh', validate({ body: refreshSchema }), asyncHandler(authController.refresh));
router.post('/logout', validate({ body: refreshSchema }), asyncHandler(authController.logout));

export const authRoutes = router;
