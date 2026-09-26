import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { canAskForPush } from '@haala/ui';

/**
 * When to show the "Turn on notifications" screen, per the design: right after
 * the first order is placed — the moment a customer most wants to hear from us
 * — and, if they say "Not now", exactly once more, on the tracking screen.
 * Never on first launch, and never a third time.
 *
 * The second ask waits for a *later* order's tracking screen. Taken literally,
 * "on the tracking screen" would re-ask seconds after the first "Not now", on
 * the very order they just declined it for.
 *
 * Kept per device, like the OS permission it leads to.
 */
const KEY = 'haala.pushPriming';

export type PrimingMoment = 'order-placed' | 'tracking';

interface PrimingState {
  shown: number;
  /** The order the first ask followed. */
  orderId: string | null;
}

const read = async (): Promise<PrimingState> => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PrimingState) : { shown: 0, orderId: null };
  } catch {
    return { shown: 0, orderId: null };
  }
};

const shouldPrime = async (moment: PrimingMoment, orderId: string): Promise<boolean> => {
  // An answered prompt makes the screen a dead end — the button could do nothing.
  if (!(await canAskForPush())) return false;
  const { shown, orderId: firstOrder } = await read();
  return moment === 'order-placed' ? shown === 0 : shown === 1 && orderId !== firstOrder;
};

const markPrimed = async (orderId: string): Promise<void> => {
  const { shown, orderId: firstOrder } = await read();
  const next: PrimingState = { shown: shown + 1, orderId: firstOrder ?? orderId };
  await AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => undefined);
};

/**
 * Show the priming screen from `moment` if it is due. `orderId` is null until
 * the screen has an order to speak about, which also holds the prompt back
 * until the screen underneath has painted.
 */
export function usePushPriming(moment: PrimingMoment, orderId: string | null): void {
  const router = useRouter();

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    void (async () => {
      if (!(await shouldPrime(moment, orderId)) || cancelled) return;
      await markPrimed(orderId);
      router.push('/enable-notifications');
    })();
    return () => {
      cancelled = true;
    };
  }, [moment, orderId, router]);
}
