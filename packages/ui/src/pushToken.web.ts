import type { PushChannel, PushOptions, PushRegistration, ReceivedPush } from './pushToken';

/**
 * Web no-op. Browser push needs a service worker and a VAPID key pair, which is
 * separate work from native notifications — and the web build exists for quick
 * checks, not as a delivery surface.
 *
 * Metro resolves this file for `platform=web` at *bundle* time, which is the
 * point: a runtime `Platform.OS` guard would still pull `expo-notifications`
 * into the web bundle and fail there.
 */
export const configureForegroundNotifications = (_options?: { showAlert?: boolean }): void => {};

export const canAskForPush = async (): Promise<boolean> => false;

export const getExpoPushToken = async (_options?: PushOptions): Promise<PushRegistration | null> =>
  null;

export const onNotificationTapped =
  (_handler: (data: Record<string, unknown>) => void): (() => void) =>
  () => {};

export const onNotificationReceived =
  (_handler: (push: ReceivedPush) => void): (() => void) =>
  () => {};

export type { PushChannel, PushOptions, PushRegistration, ReceivedPush };
