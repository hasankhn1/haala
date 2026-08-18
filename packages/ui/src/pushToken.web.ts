import type { PushRegistration } from './pushToken';

/**
 * Web no-op. Browser push needs a service worker and a VAPID key pair, which is
 * separate work from native notifications — and the web build exists for quick
 * checks, not as a delivery surface.
 *
 * Metro resolves this file for `platform=web` at *bundle* time, which is the
 * point: a runtime `Platform.OS` guard would still pull `expo-notifications`
 * into the web bundle and fail there.
 */
export const configureForegroundNotifications = (): void => {};

export const getExpoPushToken = async (): Promise<PushRegistration | null> => null;

export const onNotificationTapped = (): (() => void) => () => {};

export type { PushRegistration };
