import { useCallback } from 'react';
import * as WebBrowser from 'expo-web-browser';
import type { CheckoutExit } from '@haala/shared';

/**
 * The web half of the payment sheet.
 *
 * `react-native-webview` has **no web implementation**, and Metro resolves
 * `require()` at bundle time — so a `Platform.OS` guard inside the native file
 * would not save the web bundle, it would only fail later. Hence the split.
 *
 * On web the checkout opens in a browser tab, which is what it did before the
 * embedded sheet existed. The tab does not close itself: the session is created
 * with `source: 'mobile'`, so Safepay ends on its own `/external/complete`
 * rather than redirecting back out to `haala://`. The customer closes the tab
 * and `runOnlineCheckout` asks our server what actually happened — which is the
 * authority in every variant anyway.
 *
 * That is a slightly worse experience on a target nobody ships: web exists here
 * to render and drive screens without a simulator. Android and iOS get the
 * embedded sheet.
 */
export type SheetOutcome = CheckoutExit | 'dismissed';

export const usePaymentSheet = (): {
  present: (url: string) => Promise<SheetOutcome>;
  sheet: React.ReactNode;
} => {
  const present = useCallback(async (url: string): Promise<SheetOutcome> => {
    try {
      await WebBrowser.openAuthSessionAsync(url, 'haala://order/confirmed');
    } catch {
      // Failing to open a tab is not the same as failing to pay — an earlier
      // attempt may already have gone through, so the caller still verifies.
    }
    // Never 'completed': a closed tab proves nothing, and claiming otherwise
    // would let the caller skip the check that actually decides.
    return 'dismissed';
  }, []);

  return { present, sheet: null };
};
