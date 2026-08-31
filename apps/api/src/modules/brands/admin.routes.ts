import { Router } from 'express';
import { z } from 'zod';
import {
  UserRole,
  brandsQuerySchema,
  createBrandSchema,
  createBrandUserSchema,
  createBusinessTypeSchema,
  setUserActiveSchema,
  updateBrandSchema,
  updateBusinessTypeSchema,
} from '@haala/shared';
import { asyncHandler, sendSuccess } from '../../common/http';
import { authenticate } from '../../common/middleware/authenticate';
import { authorize } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validate';
import { businessTypeService } from '../business-types/business-type.service';
import { brandService } from './brand.service';

/**
 * Platform administration — creating brands and the logins that use them.
 *
 * `super_admin` only, deliberately narrower than the `/ops` routes: an ops
 * admin moves orders and counts stock, which is a different job from deciding
 * who may sell on the platform at all.
 *
 * Nothing here is brand-scoped. These endpoints act across every tenant by
 * design, which is exactly why they are gated on the one role that is allowed
 * to, and why they live apart from `/brand/*` rather than sharing a router with
 * it.
 */
const router: Router = Router();

router.use(authenticate, authorize(UserRole.SuperAdmin));

const idParams = z.object({ id: z.string().uuid() });
const brandUserParams = z.object({ id: z.string().uuid(), userId: z.string().uuid() });

// ── Brands ────────────────────────────────────────────────────────────────
router.get(
  '/brands',
  validate({ query: brandsQuerySchema }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await brandService.list(req.query));
  }),
);

router.post(
  '/brands',
  validate({ body: createBrandSchema }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await brandService.create(req.body), 201);
  }),
);

router.get(
  '/brands/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await brandService.getById(req.params.id as string));
  }),
);

router.patch(
  '/brands/:id',
  validate({ params: idParams, body: updateBrandSchema }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await brandService.update(req.params.id as string, req.body));
  }),
);

// ── Brand logins ──────────────────────────────────────────────────────────
// Listed across all brands here, and created under one brand below. The list
// is flat because "who can sign in" is a question about the platform; creating
// is per-brand because attaching a login to the wrong shop should not be
// possible by editing a field.
router.get(
  '/brand-users',
  asyncHandler(async (_req, res) => {
    sendSuccess(res, await brandService.listAllUsers());
  }),
);

// The brand is in the path, never the body: a login cannot be created for, or
// deactivated in, a brand other than the one being addressed.
router.post(
  '/brands/:id/users',
  validate({ params: idParams, body: createBrandUserSchema }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await brandService.createUser(req.params.id as string, req.body), 201);
  }),
);

router.patch(
  '/brands/:id/users/:userId',
  validate({ params: brandUserParams, body: setUserActiveSchema }),
  asyncHandler(async (req, res) => {
    const { id, userId } = req.params as { id: string; userId: string };
    sendSuccess(res, await brandService.setUserActive(id, userId, req.body.isActive));
  }),
);

// ── Business types ────────────────────────────────────────────────────────
router.get(
  '/business-types',
  asyncHandler(async (_req, res) => {
    sendSuccess(res, await businessTypeService.list());
  }),
);

router.post(
  '/business-types',
  validate({ body: createBusinessTypeSchema }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await businessTypeService.create(req.body), 201);
  }),
);

router.patch(
  '/business-types/:id',
  validate({ params: idParams, body: updateBusinessTypeSchema }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await businessTypeService.update(req.params.id as string, req.body));
  }),
);

export const adminRoutes = router;
