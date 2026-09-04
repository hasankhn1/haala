import { Router } from 'express';
import { z } from 'zod';
import {
  HAALA_STAFF_ROLES,
  UserRole,
  adminCreateUserSchema,
  enumValues,
  phoneSchema,
} from '@haala/shared';
import { asyncHandler } from '../../common/http';
import { authenticate } from '../../common/middleware/authenticate';
import { authorize } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validate';
import { userController } from './user.controller';

const updateProfileSchema = z
  .object({
    name: z.string().min(2).max(80).optional(),
    email: z.string().email().nullable().optional(),
    /**
     * The number a rider calls at the door.
     *
     * Reuses `phoneSchema`, so the server validates and normalises it rather
     * than trusting what the sheet sent — client-side validation is a courtesy
     * to the customer, not a check.
     *
     * Explicitly **not** the login. Changing this never changes how anybody
     * signs in, which is the entire reason it is a separate column.
     */
    deliveryPhone: phoneSchema.nullable().optional(),
  })
  .strict();

const listUsersQuerySchema = z.object({
  role: z.enum(enumValues(UserRole) as [UserRole, ...UserRole[]]).default(UserRole.Customer),
});

const router: Router = Router();

router.get('/me', authenticate, asyncHandler(userController.me));
/**
 * Declared before nothing in particular, but note it is `/me/providers` rather
 * than `/users/:id/providers`: a customer may only ever see their own, and a
 * route with an id in it is a route somebody will eventually pass a different
 * id to.
 */
router.get('/me/providers', authenticate, asyncHandler(userController.myProviders));
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
  authorize(...HAALA_STAFF_ROLES),
  validate({ body: adminCreateUserSchema }),
  asyncHandler(userController.create),
);
router.get(
  '/',
  authenticate,
  authorize(...HAALA_STAFF_ROLES),
  validate({ query: listUsersQuerySchema }),
  asyncHandler(userController.list),
);

export const userRoutes = router;
