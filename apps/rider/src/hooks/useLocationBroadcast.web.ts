import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { riderApi } from '../api/endpoints';
import { LOCATION_INTERVAL_MS } from '../config';

export type BroadcastState = 'idle' | 'denied' | 'broadcasting' | 'error';

/**
 * Web build of the location broadcaster.
 *
 * Browsers have no background location and `expo-task-manager` has no web
 * implementation, so this keeps the original foreground timer. Metro resolves
 * the `.web` extension at bundle time, which is what stops the native file's
 * `expo-task-manager` import from ever reaching the web bundle — a runtime
 * `Platform.OS` check could not do that, because the import is resolved when
 * the bundle is built, not when it runs.
 *
 * Keep this file's exports in step with `useLocationBroadcast.ts`.
 */
export function useLocationBroadcast(enabled: boolean): BroadcastState {
  const [state, setState] = useState<BroadcastState>('idle');
  // Held in a ref so a slow request can't overlap with the next tick.
  const inFlight = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setState('idle');
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const pushOnce = async (): Promise<void> => {
      if (inFlight.current || cancelled) return;
      inFlight.current = true;
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        await riderApi.pushLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        if (!cancelled) setState('broadcasting');
      } catch {
        if (!cancelled) setState('error');
      } finally {
        inFlight.current = false;
      }
    };

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== 'granted') {
        setState('denied');
        return;
      }
      await pushOnce();
      if (!cancelled) timer = setInterval(pushOnce, LOCATION_INTERVAL_MS);
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [enabled]);

  return state;
}
