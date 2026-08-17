import { Router } from 'express';
import { authRoutes } from './modules/auth/auth.routes';
import { userRoutes } from './modules/users/user.routes';
import { addressesRoutes } from './modules/addresses/addresses.routes';
import { storesRoutes } from './modules/stores/stores.routes';
import { catalogRoutes } from './modules/catalog/catalog.routes';
import { inventoryRoutes } from './modules/inventory/inventory.routes';
import { cartRoutes } from './modules/cart/cart.routes';
import { ordersRoutes } from './modules/orders/orders.routes';
import { opsRoutes } from './modules/orders/ops.routes';
import { paymentRoutes } from './modules/payments/payment.routes';
import { ridersRoutes } from './modules/riders/riders.routes';
import { deliveryRoutes } from './modules/delivery/delivery.routes';
import { promotionsRoutes } from './modules/promotions/promotions.routes';
import { notificationsRoutes } from './modules/notifications/notifications.routes';
import { analyticsRoutes } from './modules/analytics/analytics.routes';

/** Mounts every module under the API prefix. */
export const apiRouter: Router = Router();

apiRouter.use('/auth', authRoutes);
apiRouter.use('/users', userRoutes);
apiRouter.use('/addresses', addressesRoutes);
apiRouter.use('/stores', storesRoutes);
apiRouter.use('/catalog', catalogRoutes);
apiRouter.use('/inventory', inventoryRoutes);
apiRouter.use('/cart', cartRoutes);
apiRouter.use('/orders', ordersRoutes);
// Store/ops surface (admin-only): the order pipeline the dashboard will drive.
apiRouter.use('/ops', opsRoutes);
apiRouter.use('/payments', paymentRoutes);
apiRouter.use('/riders', ridersRoutes);
apiRouter.use('/delivery', deliveryRoutes);
apiRouter.use('/promotions', promotionsRoutes);
apiRouter.use('/notifications', notificationsRoutes);
apiRouter.use('/analytics', analyticsRoutes);
