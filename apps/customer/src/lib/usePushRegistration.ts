import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { configureForegroundNotifications, getExpoPushToken, onNotificationTapped } from '@haala/ui';
import { notificationsApi } from '../api/endpoints';

// Set once, at module scope, so the handler exists before any notification can
// arrive — doing it inside an effect races the first push.
configureForegroundNotifications();

/**
 * Registers this device for push once the user is authenticated, and routes
 * notification taps to the relevant order.
 *
 * The token is deliberately registered *after* sign-in rather than at launch:
 * the API stores it against a user, so a token registered while anonymous would
 * have nobody to notify. It is de-registered on sign-out so the next person to
 * use the handset doesn't receive the previous user's order updates.
 */
export function usePushRegistration(isAuthenticated: boolean): void {
  const router = useRouter();
  const registered = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;

    (async () => {
      const reg = await getExpoPushToken();
      // Null is the ordinary case on a simulator or after a declined prompt.
      if (!reg || cancelled || registered.current === reg.token) return;
      try {
        await notificationsApi.registerPushToken(reg.token, reg.platform);
        registered.current = reg.token;
      } catch {
        // A failed registration costs notifications, not the session.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // Tapping an order notification should land on that order, not the home tab.
  useEffect(() => {
    return onNotificationTapped((data) => {
      const orderId = typeof data.orderId === 'string' ? data.orderId : null;
      if (orderId) router.push(`/order/${orderId}`);
    });
  }, [router]);
}

/**
 * Called during sign-out, before the tokens are cleared — the request needs the
 * still-valid access token to authenticate.
 */
export async function unregisterPushToken(): Promise<void> {
  const reg = await getExpoPushToken();
  if (!reg) return;
  await notificationsApi.unregisterPushToken(reg.token).catch(() => undefined);
}
