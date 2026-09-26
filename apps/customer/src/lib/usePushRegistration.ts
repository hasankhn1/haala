import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { NOTIFICATION_CHANNEL } from '@haala/shared';
import {
  configureForegroundNotifications,
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

/**
 * One Android channel per category, as the design's spec sheet sets them.
 * Payments are high so a failed payment interrupts; offers are low and silent.
 * These names are what the customer sees in Android's own settings.
 */
const CHANNELS: PushChannel[] = [
  { id: NOTIFICATION_CHANNEL.order, name: 'Order updates', importance: 'high' },
  { id: NOTIFICATION_CHANNEL.payment, name: 'Payments', importance: 'high' },
  { id: NOTIFICATION_CHANNEL.brand, name: 'Brand orders', importance: 'default' },
  { id: NOTIFICATION_CHANNEL.service, name: 'Account & service', importance: 'default' },
  { id: NOTIFICATION_CHANNEL.offer, name: 'Offers', importance: 'low' },
];

const register = async (prompt: boolean): Promise<boolean> => {
  const reg = await getExpoPushToken({ prompt, channels: CHANNELS });
  // Null is the ordinary case on a simulator or after a declined prompt.
  if (!reg) return false;
  try {
    await notificationsApi.registerPushToken(reg.token, reg.platform);
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
    if (isAuthenticated) void register(false);
  }, [isAuthenticated]);

  // Whatever lands while the app is open is already in the inbox server-side.
  useEffect(
    () => onNotificationReceived(() => qc.invalidateQueries({ queryKey: qk.notifications })),
    [qc],
  );

  // A tap lands on the order it is about; anything else lands in the inbox.
  useEffect(
    () =>
      onNotificationTapped((data) => {
        if (typeof data.notificationId === 'string') {
          notificationsApi
            .markRead(data.notificationId)
            .then(() => qc.invalidateQueries({ queryKey: qk.notifications }))
            .catch(() => undefined);
        }
        const orderId = typeof data.orderId === 'string' ? data.orderId : null;
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
