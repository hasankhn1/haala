import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Expo push-token mechanics, shared by both apps.
 *
 * Only the Expo plumbing lives here — permission prompt, Android channel, token
 * fetch. Sending the token to the API stays in each app, since each has its own
 * authenticated client.
 *
 * A `.web.ts` sibling no-ops: web push needs a service worker and a VAPID key,
 * which is a separate piece of work from native notifications.
 */

/**
 * How a notification behaves when it lands while the app is foregrounded.
 * Registered at module scope so it's set before any notification can arrive.
 */
export const configureForegroundNotifications = (): void => {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
};

/**
 * Android requires a channel before notifications display, and the channel
 * carries the importance — without one, order updates arrive silently.
 */
const ensureAndroidChannel = async (): Promise<void> => {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Order updates',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    // Onyx primary — the notification accent should match the app's identity.
    lightColor: '#0F172A',
  });
};

export interface PushRegistration {
  token: string;
  platform: 'ios' | 'android';
}

/**
 * Ask for permission and return an Expo push token, or null.
 *
 * Returns null rather than throwing for every ordinary refusal — no physical
 * device (a simulator can't receive pushes), permission denied, or no EAS
 * project id configured. Notifications are an enhancement; a customer who says
 * no must still be able to order.
 */
export const getExpoPushToken = async (): Promise<PushRegistration | null> => {
  if (!Device.isDevice) return null;

  const existing = await Notifications.getPermissionsAsync();
  let granted = existing.status === 'granted';
  if (!granted) {
    // Only prompt if we haven't been permanently denied — re-asking after a
    // hard "no" does nothing on iOS and annoys on Android.
    if (!existing.canAskAgain) return null;
    const asked = await Notifications.requestPermissionsAsync();
    granted = asked.status === 'granted';
  }
  if (!granted) return null;

  await ensureAndroidChannel();

  // EAS project id is required for Expo's push service to route to this app.
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

  try {
    const { data } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    return { token: data, platform: Platform.OS === 'ios' ? 'ios' : 'android' };
  } catch {
    // Unsigned dev builds without a project id land here. Not worth surfacing.
    return null;
  }
};

/** Subscribe to notification taps. Returns an unsubscribe function. */
export const onNotificationTapped = (
  handler: (data: Record<string, unknown>) => void,
): (() => void) => {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    handler((response.notification.request.content.data ?? {}) as Record<string, unknown>);
  });
  return () => sub.remove();
};
