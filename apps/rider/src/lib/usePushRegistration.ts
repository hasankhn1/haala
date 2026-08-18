import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { configureForegroundNotifications, getExpoPushToken, onNotificationTapped } from '@haala/ui';
import { notificationsApi } from '../api/endpoints';

configureForegroundNotifications();

/**
 * Registers the rider's device for push and routes taps to the queue.
 *
 * Push matters more here than on the customer side: the claimable pool is
 * first-come, so a rider who doesn't hear about an order loses it. Taps go to
 * the queue rather than a specific order because by the time they look,
 * someone else may already have claimed the one that triggered the buzz.
 */
export function usePushRegistration(isAuthenticated: boolean): void {
  const router = useRouter();
  const registered = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;

    (async () => {
      const reg = await getExpoPushToken();
      if (!reg || cancelled || registered.current === reg.token) return;
      try {
        await notificationsApi.registerPushToken(reg.token, reg.platform);
        registered.current = reg.token;
      } catch {
        // Notifications are an enhancement; the shift still works without them.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    return onNotificationTapped((data) => {
      if (data.type === 'claimable_order') router.push('/(tabs)');
    });
  }, [router]);
}

/** Called during sign-out, while the access token is still valid. */
export async function unregisterPushToken(): Promise<void> {
  const reg = await getExpoPushToken();
  if (!reg) return;
  await notificationsApi.unregisterPushToken(reg.token).catch(() => undefined);
}
