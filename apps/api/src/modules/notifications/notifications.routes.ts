import { Router } from 'express';
import {
  listNotificationsQuerySchema,
  registerPushTokenSchema,
  unregisterPushTokenSchema,
  updateNotificationPreferencesSchema,
} from '@haala/shared';
import { asyncHandler } from '../../common/http';
import { authenticate } from '../../common/middleware/authenticate';
import { validate } from '../../common/middleware/validate';
import { notificationController } from './notification.controller';

const router: Router = Router();

router.use(authenticate);

router.get(
  '/',
  validate({ query: listNotificationsQuerySchema }),
  asyncHandler(notificationController.list),
);
router.post('/read-all', asyncHandler(notificationController.markAllRead));

router.get('/preferences', asyncHandler(notificationController.preferences));
router.patch(
  '/preferences',
  validate({ body: updateNotificationPreferencesSchema }),
  asyncHandler(notificationController.updatePreferences),
);
router.post('/:id/read', asyncHandler(notificationController.markRead));

router.post(
  '/push-token',
  validate({ body: registerPushTokenSchema }),
  asyncHandler(notificationController.registerToken),
);
router.delete(
  '/push-token',
  validate({ body: unregisterPushTokenSchema }),
  asyncHandler(notificationController.unregisterToken),
);

export const notificationsRoutes = router;
