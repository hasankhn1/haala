import { z } from 'zod';

export const registerPushTokenSchema = z
  .object({
    /** Expo push token, e.g. `ExponentPushToken[xxxxxxxx]`. */
    token: z.string().min(10).max(256),
    platform: z.enum(['ios', 'android']).optional(),
  })
  .strict();
export type RegisterPushTokenInput = z.infer<typeof registerPushTokenSchema>;

export const unregisterPushTokenSchema = z
  .object({ token: z.string().min(10).max(256) })
  .strict();
export type UnregisterPushTokenInput = z.infer<typeof unregisterPushTokenSchema>;

export interface NotificationView {
  id: string;
  title: string;
  body: string;
  /** "order_update" | "promo" | "system". */
  type: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListView {
  items: NotificationView[];
  unreadCount: number;
}
