import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { riderApi } from '../api/endpoints';
import { LOCATION_INTERVAL_MS } from '../config';

export type BroadcastState = 'idle' | 'denied' | 'broadcasting' | 'error';

/**
 * Push the rider's GPS position to the API on a timer while `enabled`.
 *
 * Only runs when the rider actually holds an order — a background stream of a
 * courier's movements when they're off-shift is data we have no reason to
 * collect. The server decides who may see it (customers only after pickup).
 *
 * Failures are deliberately soft: a dropped ping is not worth interrupting a
 * delivery for, so we surface state but never throw.
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
