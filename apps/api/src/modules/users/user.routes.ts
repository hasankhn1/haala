import { Router } from 'express';
import { z } from 'zod';
import { UserRole, adminCreateUserSchema, enumValues } from '@haala/shared';
import { asyncHandler } from '../../common/http';
import { authenticate } from '../../common/middleware/authenticate';
import { authorize } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validate';
import { userController } from './user.controller';

const updateProfileSchema = z
  .object({
    name: z.string().min(2).max(80).optional(),
    email: z.string().email().nullable().optional(),
  })
  .strict();

const listUsersQuerySchema = z.object({
  role: z.enum(enumValues(UserRole) as [UserRole, ...UserRole[]]).default(UserRole.Customer),
});

const router: Router = Router();

router.get('/me', authenticate, asyncHandler(userController.me));
router.patch(
  '/me',
  authenticate,
  validate({ body: updateProfileSchema }),
  asyncHandler(userController.updateMe),
);

/**
 * Staff administration. Public `/auth/register` can only create customers, so
 * these are the only way to mint a rider or admin through the API — the ops
 * dashboard will drive them.
 */
router.post(
  '/',
  authenticate,
  authorize(UserRole.Admin),
  validate({ body: adminCreateUserSchema }),
  asyncHandler(userController.create),
);
router.get(
  '/',
  authenticate,
  authorize(UserRole.Admin),
  validate({ query: listUsersQuerySchema }),
  asyncHandler(userController.list),
);

export const userRoutes = router;
