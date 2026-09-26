import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import {
  activeNotificationCategories,
  NOTIFICATION_ACTION,
  NOTIFICATION_CATEGORY_ID,
  NOTIFICATION_CHANNEL,
  type NotificationCategory,
} from '@haala/shared';
import {
  configureForegroundNotifications,
  ensureNotificationCategories,
  getExpoPushToken,
  onNotificationReceived,
  onNotificationTapped,
  type PushChannel,
} from '@haala/ui';
import { notificationsApi } from '../api/endpoints';
import { qk } from '../api/queryKeys';

// Set once, at module scope, so the handler exists before any notification can
// arrive — doing it inside an effect races the first push. No OS alert while
// the app is open: `InAppBanner` shows it instead.
configureForegroundNotifications({ showAlert: false });

/*
 * The comp puts a "Track order" button under an order notification. Registered
 * at module scope alongside the foreground handler, because a category has to
 * exist before a push carrying its id arrives — a push for an unregistered
 * category renders with no buttons and nothing says why.
 */
void ensureNotificationCategories({
  [NOTIFICATION_CATEGORY_ID.order as string]: [
    { id: NOTIFICATION_ACTION.Track, title: 'Track order' },
  ],
});

/**
 * One Android channel per category, as the design's spec sheet sets them.
 * Payments are high so a failed payment interrupts; offers are low and silent.
 * These names are what the customer sees in Android's own settings.
 */
const CHANNEL_SPEC: Record<NotificationCategory, { name: string; importance: PushChannel['importance'] }> = {
  order: { name: 'Order updates', importance: 'high' },
  payment: { name: 'Payments', importance: 'high' },
  brand: { name: 'Brand orders', importance: 'default' },
  service: { name: 'Account & service', importance: 'default' },
  offer: { name: 'Offers', importance: 'low' },
};

/*
 * Only categories that can actually send something.
 *
 * Android never lets an app delete a channel it has created — it lingers in the
 * customer's system settings forever — so creating one for `brand`, which no
 * notification type maps to yet, is a permanent piece of furniture advertising
 * a feature that does not exist. It appears the day brand types do.
 */
const CHANNELS: PushChannel[] = activeNotificationCategories().map((category) => ({
  id: NOTIFICATION_CHANNEL[category],
  ...CHANNEL_SPEC[category],
}));

const register = async (prompt: boolean, isCancelled: () => boolean = () => false): Promise<boolean> => {
  const reg = await getExpoPushToken({ prompt, channels: CHANNELS });
  // Null is the ordinary case on a simulator or after a declined prompt.
  if (!reg) return false;
  // Checked after the await, which is the only place it can have changed.
  if (isCancelled()) return false;
  try {
    await notificationsApi.registerPushToken(
      reg.token,
      reg.platform,
      reg.platform === 'android' ? CHANNELS.map((c) => c.id) : undefined,
    );
  } catch {
    // A failed registration costs notifications, not the session. The next
    // launch registers again.
  }
  return true;
};

/**
 * Ask for permission and register — the "Turn on notifications" button. The
 * only place the customer app shows the OS prompt, so it is always preceded by
 * a screen explaining why.
 */
export const enablePush = (): Promise<boolean> => register(true);

/**
 * Registers this device for push once the user is authenticated, keeps the
 * inbox fresh as pushes arrive, and routes taps.
 *
 * Registration here never prompts. The design asks right after the first order
 * — the moment a customer most wants to hear from us — not at sign-in, so this
 * only picks up permission that already exists. The token goes up after sign-in
 * because the API stores it against a user; it is removed on sign-out so the
 * next person to use the handset doesn't receive the previous user's updates.
 */
export function usePushRegistration(isAuthenticated: boolean): void {
  const router = useRouter();
  const qc = useQueryClient();

  useEffect(() => {
    if (!isAuthenticated) return;
    /*
     * `register` awaits `getExpoPushToken`, which on Android also creates the
     * channels — hundreds of milliseconds. Sign out inside that window and
     * `unregisterPushToken` deletes the row *first*, then this resolves and
     * POSTs the token straight back, so the handset keeps receiving the
     * previous customer's order and payment notifications.
     *
     * The guard was here before this file was rewritten; it is not decoration.
     */
    let cancelled = false;
    void register(false, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // Whatever lands while the app is open is already in the inbox server-side.
  useEffect(
    () => onNotificationReceived(() => qc.invalidateQueries({ queryKey: qk.notifications })),
    [qc],
  );

  // A tap lands on the order it is about; anything else lands in the inbox.
  useEffect(
    () =>
      onNotificationTapped((data, action) => {
        if (typeof data.notificationId === 'string') {
          notificationsApi
            .markRead(data.notificationId)
            .then(() => qc.invalidateQueries({ queryKey: qk.notifications }))
            .catch(() => undefined);
        }
        const orderId = typeof data.orderId === 'string' ? data.orderId : null;
        /*
         * "Track order" and a tap on the body go to the same place — the order
         * screen is where tracking lives, and it carries the call button too.
         * Kept as an explicit branch so a second action lands cleanly.
         */
        if (action === NOTIFICATION_ACTION.Track && orderId) {
          router.push(`/order/${orderId}`);
          return;
        }
        router.push(orderId ? `/order/${orderId}` : '/notifications');
      }),
    [router, qc],
  );
}

/**
 * Called during sign-out, before the tokens are cleared — the request needs the
 * still-valid access token to authenticate. Never prompts: a customer who never
 * granted permission has no token to remove, and must not meet the OS dialog
 * on their way out.
 */
export async function unregisterPushToken(): Promise<void> {
  const reg = await getExpoPushToken({ prompt: false, channels: CHANNELS });
  if (!reg) return;
  await notificationsApi.unregisterPushToken(reg.token).catch(() => undefined);
}
