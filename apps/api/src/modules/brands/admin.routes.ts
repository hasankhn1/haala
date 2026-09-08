import { Router } from 'express';
import { z } from 'zod';
import {
  UserRole,
  brandsQuerySchema,
  createBrandSchema,
  createBrandUserSchema,
  createBannerSchema,
  createBusinessTypeSchema,
  setUserActiveSchema,
  updateBannerSchema,
  updateBrandSchema,
  updateBusinessTypeSchema,
} from '@haala/shared';
import { asyncHandler, sendSuccess } from '../../common/http';
import { authenticate } from '../../common/middleware/authenticate';
import { authorize } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validate';
import { invalidate } from '../../common/cache';
import { businessTypeService } from '../business-types/business-type.service';
import { bannerService } from '../home/banner.service';
import { uploadService } from '../uploads/upload.service';
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

/** Every cached home payload, across every store. See `common/cache.ts`. */
const HOME_CACHE_PREFIX = 'cache:home:';
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
    const updated = await businessTypeService.update(req.params.id as string, req.body);
    // Switching a department off is the change an editor most expects to see
    // at once, and the home payload is cached for five minutes.
    await invalidate(HOME_CACHE_PREFIX);
    sendSuccess(res, updated);
  }),
);

// ── Homepage banners ──────────────────────────────────────────────────────
/*
 * The homepage CMS. Banners only — departments and brands already have their
 * on/off switches, on `/business-types` and `/brands` respectively, and a second
 * place to flip them would be a second place for them to disagree.
 *
 * Every write busts the cached home payload, so the app agrees with the
 * dashboard the moment Save returns rather than five minutes later.
 */
router.get(
  '/banners',
  asyncHandler(async (_req, res) => {
    sendSuccess(res, await bannerService.list());
  }),
);

router.post(
  '/banners',
  validate({ body: createBannerSchema }),
  asyncHandler(async (req, res) => {
    const created = await bannerService.create(req.body);
    await invalidate(HOME_CACHE_PREFIX);
    sendSuccess(res, created, 201);
  }),
);

router.patch(
  '/banners/:id',
  validate({ params: idParams, body: updateBannerSchema }),
  asyncHandler(async (req, res) => {
    const updated = await bannerService.update(req.params.id as string, req.body);
    await invalidate(HOME_CACHE_PREFIX);
    sendSuccess(res, updated);
  }),
);

router.delete(
  '/banners/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await bannerService.remove(req.params.id as string);
    await invalidate(HOME_CACHE_PREFIX);
    // `{ ok: true }` rather than a bare 204, matching every other delete here.
    // The dashboard's client reads `data` off the envelope, so a body-less
    // response would surface a successful delete as "Unexpected server
    // response" — right in the object store, wrong on the screen.
    sendSuccess(res, { ok: true });
  }),
);

// ── Banner artwork ────────────────────────────────────────────────────────
/*
 * The same two-step presign the brand dashboard uses, against the `home/`
 * prefix instead of `brands/<id>/`.
 *
 * It lives here rather than on `/uploads` for one reason: that router runs
 * `brandScope`, which resolves a tenant for the request. A platform banner has
 * no tenant, and inventing one — a "Haala" brand id to hang assets off — would
 * put a platform asset inside a shop's namespace, where that brand's own users
 * would then pass the prefix check and be able to overwrite it. Under `/admin`
 * the super-admin gate at the top of this file is the whole authorization
 * story.
 */
const signBannerSchema = z
  .object({ contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']) })
  .strict();

router.post(
  '/banners/uploads/sign',
  validate({ body: signBannerSchema }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await uploadService.signHome(req.body.contentType));
  }),
);

router.post(
  '/banners/uploads/confirm',
  validate({ body: z.object({ key: z.string().min(1).max(300) }).strict() }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await uploadService.confirmHome(req.body.key));
  }),
);

export const adminRoutes = router;
