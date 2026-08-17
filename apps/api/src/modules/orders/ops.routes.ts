import { Router } from 'express';
import { z } from 'zod';
import {
  OrderStatus,
  UserRole,
  assignRiderStoreSchema,
  createStoreSchema,
  updateInventorySchema,
  updateOrderStatusSchema,
  updateProductSchema,
  updateStoreSchema,
} from '@haala/shared';
import { asyncHandler } from '../../common/http';
import { sendSuccess } from '../../common/http';
import { authenticate } from '../../common/middleware/authenticate';
import { authorize } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validate';
import { riderService } from '../riders/rider.service';
import { opsCatalogService } from './ops.catalog';
import { orderService } from './order.service';

/**
 * Store-side order operations — the queue the ops dashboard will render.
 *
 * Without this the fulfilment pipeline has no actor: a customer places an order
 * and it sits at `placed` forever, because only `packed` orders reach riders.
 * That's why the rider queue looked empty. These endpoints are how a store
 * moves work forward until the dashboard exists.
 */
const router: Router = Router();

router.use(authenticate, authorize(UserRole.Admin));

const listQuerySchema = z.object({
  status: z
    .enum([
      OrderStatus.Placed,
      OrderStatus.Confirmed,
      OrderStatus.Preparing,
      OrderStatus.Packed,
      OrderStatus.PickedUp,
      OrderStatus.OutForDelivery,
      OrderStatus.Delivered,
      OrderStatus.Cancelled,
      OrderStatus.Failed,
    ])
    .optional(),
});

/** Every order in the pipeline, newest first, optionally filtered by status. */
router.get(
  '/orders',
  validate({ query: listQuerySchema }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await orderService.listForOps(req.query.status as OrderStatus | undefined));
  }),
);

/** Full detail for one order: items, address, timeline, payment, courier. */
router.get(
  '/orders/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    sendSuccess(res, await orderService.getForOps(id));
  }),
);

/** Move one order along the lifecycle (confirm → prepare → pack → …). */
router.patch(
  '/orders/:id/status',
  validate({ body: updateOrderStatusSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    sendSuccess(res, await orderService.updateStatus(id, req.body, req.auth!.userId));
  }),
);

/**
 * Convenience for the common case: take an order all the way from wherever it
 * is to `packed`, so it becomes claimable by a rider. Walks the intermediate
 * states rather than jumping, so status history and `ORDER_STATUS_FLOW` stay
 * honest.
 */
router.post(
  '/orders/:id/pack',
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    sendSuccess(res, await orderService.advanceToPacked(id, req.auth!.userId));
  }),
);

/**
 * Rider roster + store assignment. A rider's home store decides which orders
 * they're offered, so it's an ops decision, not the rider's — hence it lives
 * here rather than on `/riders/me`.
 */
router.get(
  '/riders',
  asyncHandler(async (_req, res) => {
    sendSuccess(res, await riderService.listAll());
  }),
);

router.patch(
  '/riders/:userId/store',
  validate({ body: assignRiderStoreSchema }),
  asyncHandler(async (req, res) => {
    const { userId } = req.params as { userId: string };
    sendSuccess(res, await riderService.assignStore(userId, req.body.storeId));
  }),
);

/**
 * Catalogue + pricing. Stock and price overrides are per store, so the store
 * is always explicit in the path rather than inferred.
 */
router.get(
  '/stores',
  asyncHandler(async (_req, res) => {
    sendSuccess(res, await opsCatalogService.listStores());
  }),
);

router.post(
  '/stores',
  validate({ body: createStoreSchema }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await opsCatalogService.createStore(req.body), 201);
  }),
);

router.patch(
  '/stores/:id',
  validate({ body: updateStoreSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    sendSuccess(res, await opsCatalogService.updateStore(id, req.body));
  }),
);

router.get(
  '/stores/:storeId/catalog',
  asyncHandler(async (req, res) => {
    const { storeId } = req.params as { storeId: string };
    sendSuccess(res, await opsCatalogService.catalogForStore(storeId));
  }),
);

router.patch(
  '/products/:id',
  validate({ body: updateProductSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    await opsCatalogService.updateProduct(id, req.body);
    sendSuccess(res, { ok: true });
  }),
);

router.patch(
  '/stores/:storeId/inventory/:productId',
  validate({ body: updateInventorySchema }),
  asyncHandler(async (req, res) => {
    const { storeId, productId } = req.params as { storeId: string; productId: string };
    await opsCatalogService.updateInventory(storeId, productId, req.body);
    sendSuccess(res, { ok: true });
  }),
);

export const opsRoutes = router;
