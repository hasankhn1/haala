import { Router } from 'express';
import { z } from 'zod';
import {
  UserRole,
  createCategorySchema,
  createProductSchema,
  createVariantSchema,
  reorderCategoriesSchema,
  updateBrandProfileSchema,
  updateCategorySchema,
  updateProductSchema,
  updateVariantSchema,
} from '@haala/shared';
import { asyncHandler, sendSuccess } from '../../common/http';
import { authenticate } from '../../common/middleware/authenticate';
import { authorize } from '../../common/middleware/authorize';
import { brandScope, requireBrandId } from '../../common/middleware/brand-scope';
import { validate } from '../../common/middleware/validate';
import { brandCatalogService as svc } from './catalog.service';

/**
 * A brand's own catalogue.
 *
 * `brandScope` runs on every route in this router, so `requireBrandId(req)` is
 * the only source of the tenant anywhere below — never a param, never the body.
 * A brand user gets their own brand from the token; Haala staff must name one
 * with `?brandId=`, which is how support looks at a vendor's catalogue without
 * a second implementation of all of this.
 *
 * Ids in the path are addresses, not authorization. Every one of them is
 * resolved *within* the scoped brand, and anything outside it is 404 — the same
 * answer as a genuinely missing row, because distinguishing the two would let
 * a competitor's catalogue be enumerated.
 */
const router: Router = Router();

router.use(authenticate, authorize(UserRole.BrandUser, UserRole.SuperAdmin, UserRole.Admin), brandScope);

const idParams = z.object({ id: z.string().uuid() });
const variantParams = z.object({ id: z.string().uuid(), variantId: z.string().uuid() });
const productsQuery = z.object({
  categoryId: z.string().uuid().optional(),
  // `brandScope` reads this for staff; declared so `.strict()` elsewhere and
  // the query validator do not treat it as unexpected.
  brandId: z.string().uuid().optional(),
});

// ── Profile ─────────────────────────────────────────────────────────────────
router.get(
  '/profile',
  asyncHandler(async (req, res) => {
    sendSuccess(res, await svc.profile(requireBrandId(req)));
  }),
);

router.patch(
  '/profile',
  validate({ body: updateBrandProfileSchema }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await svc.updateProfile(requireBrandId(req), req.body));
  }),
);

// ── Categories ──────────────────────────────────────────────────────────────
router.get(
  '/categories',
  asyncHandler(async (req, res) => {
    sendSuccess(res, await svc.listCategories(requireBrandId(req)));
  }),
);

router.post(
  '/categories',
  validate({ body: createCategorySchema }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await svc.createCategory(requireBrandId(req), req.body), 201);
  }),
);

// Declared before `/categories/:id` so "reorder" is not read as an id.
router.patch(
  '/categories/reorder',
  validate({ body: reorderCategoriesSchema }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await svc.reorderCategories(requireBrandId(req), req.body.ids));
  }),
);

router.patch(
  '/categories/:id',
  validate({ params: idParams, body: updateCategorySchema }),
  asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await svc.updateCategory(requireBrandId(req), req.params.id as string, req.body),
    );
  }),
);

router.delete(
  '/categories/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await svc.deleteCategory(requireBrandId(req), req.params.id as string);
    sendSuccess(res, { ok: true });
  }),
);

// ── Products ────────────────────────────────────────────────────────────────
router.get(
  '/products',
  validate({ query: productsQuery }),
  asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await svc.listProducts(requireBrandId(req), req.query.categoryId as string | undefined),
    );
  }),
);

router.post(
  '/products',
  validate({ body: createProductSchema }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await svc.createProduct(requireBrandId(req), req.body), 201);
  }),
);

router.get(
  '/products/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await svc.getProduct(requireBrandId(req), req.params.id as string));
  }),
);

router.patch(
  '/products/:id',
  validate({ params: idParams, body: updateProductSchema }),
  asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await svc.updateProduct(requireBrandId(req), req.params.id as string, req.body),
    );
  }),
);

router.delete(
  '/products/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await svc.deleteProduct(requireBrandId(req), req.params.id as string);
    sendSuccess(res, { ok: true });
  }),
);

// ── Variants ────────────────────────────────────────────────────────────────
router.post(
  '/products/:id/variants',
  validate({ params: idParams, body: createVariantSchema }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await svc.addVariant(requireBrandId(req), req.params.id as string, req.body), 201);
  }),
);

router.patch(
  '/products/:id/variants/:variantId',
  validate({ params: variantParams, body: updateVariantSchema }),
  asyncHandler(async (req, res) => {
    const { id, variantId } = req.params as { id: string; variantId: string };
    sendSuccess(res, await svc.updateVariant(requireBrandId(req), id, variantId, req.body));
  }),
);

router.delete(
  '/products/:id/variants/:variantId',
  validate({ params: variantParams }),
  asyncHandler(async (req, res) => {
    const { id, variantId } = req.params as { id: string; variantId: string };
    sendSuccess(res, await svc.removeVariant(requireBrandId(req), id, variantId));
  }),
);

export const brandCatalogRoutes = router;
