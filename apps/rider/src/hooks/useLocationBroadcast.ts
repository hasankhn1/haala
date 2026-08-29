import { useEffect, useState } from 'react';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { riderApi } from '../api/endpoints';
import { setAccessToken } from '../api/client';
import { tokenStore } from '../auth/tokenStore';
import { LOCATION_INTERVAL_MS } from '../config';

export type BroadcastState = 'idle' | 'denied' | 'broadcasting' | 'error';

/** Task name is a stable string — the OS stores it across app launches. */
const LOCATION_TASK = 'haala-rider-location';

/**
 * Push the rider's position to the API while they are carrying an order.
 *
 * This runs as a **background** location task rather than a foreground timer.
 * The previous implementation polled `getCurrentPositionAsync` on a
 * `setInterval` with foreground permission only, so the moment the rider
 * pocketed the phone or the screen locked, the timer stopped and the customer's
 * tracking map froze — during an active delivery, which is precisely when it is
 * being watched.
 *
 * The privacy rule is unchanged and still the point: updates start when the
 * rider takes an order and stop when it completes. We do not stream a courier's
 * movements off-shift, and the server only forwards a position to a customer
 * after pickup (`isCarryingForCustomer`).
 *
 * Web has no background location; `useLocationBroadcast.web.ts` keeps the
 * foreground timer there. Metro resolves the split at bundle time, so this file
 * never reaches the web bundle.
 */

/**
 * Defined at module scope, on purpose. Android can relaunch the app directly
 * into this task after killing it, and a task defined inside a component would
 * not be registered yet when that happens.
 */
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  const { locations } = (data ?? {}) as { locations?: Location.LocationObject[] };
  const latest = locations?.[locations.length - 1];
  if (!latest) return;

  try {
    // The API client holds its token in module state that `AuthProvider` sets.
    // After an OS relaunch that state is empty, so rehydrate from the secure
    // store before posting or the call goes out unauthenticated.
    const tokens = await tokenStore.load();
    if (!tokens) return;
    setAccessToken(tokens.accessToken);

    await riderApi.pushLocation({
      lat: latest.coords.latitude,
      lng: latest.coords.longitude,
    });
  } catch {
    // A dropped ping is not worth surfacing, let alone interrupting a delivery
    // for. The next update is 15 seconds away.
  }
});

const stopUpdates = async (): Promise<void> => {
  if (await TaskManager.isTaskRegisteredAsync(LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => undefined);
  }
};

export function useLocationBroadcast(enabled: boolean): BroadcastState {
  const [state, setState] = useState<BroadcastState>('idle');

  useEffect(() => {
    let cancelled = false;

    if (!enabled) {
      setState('idle');
      void stopUpdates();
      return;
    }

    (async () => {
      const foreground = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (foreground.status !== 'granted') {
        setState('denied');
        return;
      }

      // Background permission must be asked for separately and only after
      // foreground is granted — Android rejects the combined request.
      const background = await Location.requestBackgroundPermissionsAsync();
      if (cancelled) return;

      try {
        await Location.startLocationUpdatesAsync(LOCATION_TASK, {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: LOCATION_INTERVAL_MS,
          distanceInterval: 25,
          pausesUpdatesAutomatically: false,
          // Android requires a visible notification to keep sending location
          // with the app in the background. It is also honest: the rider can
          // see exactly when they are being tracked.
          foregroundService: {
            notificationTitle: 'Haala Rider',
            notificationBody: 'Sharing your location for the current delivery',
            notificationColor: '#FF5A1F',
          },
        });
        if (!cancelled) setState('broadcasting');
      } catch {
        if (!cancelled) setState('error');
      }

      // Foreground-only permission still works while the app is open, so this
      // is a degraded state rather than a failure — say so, don't stop.
      if (!cancelled && background.status !== 'granted') setState('broadcasting');
    })();

    return () => {
      cancelled = true;
      void stopUpdates();
    };
  }, [enabled]);

  return state;
}
