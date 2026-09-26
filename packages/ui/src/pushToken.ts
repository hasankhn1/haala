import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Expo push-token mechanics, shared by both apps.
 *
 * Only the Expo plumbing lives here — permission prompt, Android channels,
 * token fetch, listeners. Sending the token to the API stays in each app, since
 * each has its own authenticated client.
 *
 * A `.web.ts` sibling no-ops: web push needs a service worker and a VAPID key,
 * which is a separate piece of work from native notifications.
 */

/**
 * How a notification behaves when it lands while the app is foregrounded.
 * Registered at module scope so it's set before any notification can arrive.
 *
 * `showAlert: false` is for an app that draws its own in-app banner — letting
 * the OS show one too would put the same message on screen twice.
 */
export const configureForegroundNotifications = ({ showAlert = true } = {}): void => {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: showAlert,
      shouldPlaySound: showAlert,
      shouldSetBadge: false,
    }),
  });
};

/** An Android notification channel. The OS owns it after creation: see below. */
export interface PushChannel {
  id: string;
  name: string;
  importance: 'high' | 'default' | 'low';
}

const IMPORTANCE = {
  high: Notifications.AndroidImportance.HIGH,
  default: Notifications.AndroidImportance.DEFAULT,
  low: Notifications.AndroidImportance.LOW,
} as const;

/** What both apps had before channels were per-category. */
const ORDER_UPDATES: PushChannel = { id: 'default', name: 'Order updates', importance: 'high' };

/**
 * Android requires a channel before notifications display, and the channel
 * carries the importance — without one, order updates arrive silently.
 *
 * Re-running this is safe, but only the name and description take effect on a
 * channel that already exists: Android hands importance and sound to the user
 * once a channel is created. Changing a channel's behaviour means a new id.
 */
const ensureAndroidChannels = async (channels: readonly PushChannel[]): Promise<void> => {
  if (Platform.OS !== 'android') return;
  await Promise.all(
    channels.map((c) =>
      Notifications.setNotificationChannelAsync(c.id, {
        name: c.name,
        importance: IMPORTANCE[c.importance],
        // A low-importance channel is the silent one; give it no sound at all
        // rather than relying on the importance to suppress it.
        ...(c.importance === 'low' ? { sound: null } : { vibrationPattern: [0, 250, 250, 250] }),
        // Ember primary — the notification accent should match the app's identity.
        lightColor: '#FF5A1F',
      }),
    ),
  );
};

export interface PushRegistration {
  token: string;
  platform: 'ios' | 'android';
}

export interface PushOptions {
  /**
   * Whether to show the OS permission prompt if it hasn't been answered. Pass
   * `false` to register silently when permission already exists and otherwise
   * do nothing — for an app that asks at a moment of its own choosing.
   */
  prompt?: boolean;
  channels?: readonly PushChannel[];
}

/**
 * Whether asking for permission could still produce a prompt: a real device,
 * not yet granted, and not permanently refused. The cue for a priming screen —
 * showing one when the answer is already known would only ever be a dead end.
 */
export const canAskForPush = async (): Promise<boolean> => {
  if (!Device.isDevice) return false;
  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  return status !== 'granted' && canAskAgain;
};

/**
 * Get an Expo push token, asking for permission first if `prompt` allows.
 *
 * Returns null rather than throwing for every ordinary refusal — no physical
 * device (a simulator can't receive pushes), permission denied, or no EAS
 * project id configured. Notifications are an enhancement; a customer who says
 * no must still be able to order.
 */
export const getExpoPushToken = async ({
  prompt = true,
  channels = [ORDER_UPDATES],
}: PushOptions = {}): Promise<PushRegistration | null> => {
  if (!Device.isDevice) return null;

  const existing = await Notifications.getPermissionsAsync();
  let granted = existing.status === 'granted';
  if (!granted) {
    // Only prompt if we haven't been permanently denied — re-asking after a
    // hard "no" does nothing on iOS and annoys on Android.
    if (!prompt || !existing.canAskAgain) return null;
    const asked = await Notifications.requestPermissionsAsync();
    granted = asked.status === 'granted';
  }
  if (!granted) return null;

  await ensureAndroidChannels(channels);

  // EAS project id is required for Expo's push service to route to this app.
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

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

/** What a push carried, for code that reacts to one. */
export interface ReceivedPush {
  title: string;
  body: string;
  data: Record<string, unknown>;
}

/** Subscribe to notification taps. Returns an unsubscribe function. */
export const onNotificationTapped = (
  handler: (data: Record<string, unknown>) => void,
): (() => void) => {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    handler((response.notification.request.content.data ?? {}) as Record<string, unknown>);
  });
  return () => sub.remove();
};

/** Subscribe to pushes arriving while the app is open. Returns an unsubscribe function. */
export const onNotificationReceived = (handler: (push: ReceivedPush) => void): (() => void) => {
  const sub = Notifications.addNotificationReceivedListener((notification) => {
    const { title, body, data } = notification.request.content;
    handler({
      title: title ?? '',
      body: body ?? '',
      data: (data ?? {}) as Record<string, unknown>,
    });
  });
  return () => sub.remove();
};
