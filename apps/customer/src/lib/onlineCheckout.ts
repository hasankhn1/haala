import * as WebBrowser from 'expo-web-browser';
import type { PaymentStatus, PlaceOrderResult } from '@haala/shared';
import { paymentsApi } from '../api/endpoints';

/**
 * Runs the hosted-checkout leg of an online payment.
 *
 * Opened with `openAuthSessionAsync` rather than `openBrowserAsync` so the
 * gateway's redirect back to the app closes the sheet automatically instead of
 * leaving the customer looking at a blank page wondering whether it worked.
 *
 * The return value of the browser session is **not** treated as evidence of
 * payment. A dismissed sheet and a successful payment look identical from here,
 * and a customer could close the tab after paying or before. So the outcome
 * always comes from asking our own server to re-check the gateway — and the
 * gateway's webhook is what actually moves the payment to `paid`.
 */
export type CheckoutOutcome =
  | { kind: 'not_required' }
  | { kind: 'resolved'; status: PaymentStatus }
  | { kind: 'unconfirmed' };

export const runOnlineCheckout = async (result: PlaceOrderResult): Promise<CheckoutOutcome> => {
  const url = result.checkout?.url;
  // COD, or a provider that needs no redirect.
  if (!url) return { kind: 'not_required' };

  try {
    // `haala://` is the app's scheme (app.json), so the gateway's redirect
    // re-enters the app and dismisses the sheet.
    await WebBrowser.openAuthSessionAsync(url, 'haala://order/confirmed');
  } catch {
    // Failing to open the browser is not the same as failing to pay — an
    // earlier attempt may already have gone through, so still verify.
  }

  try {
    const { status } = await paymentsApi.verify(result.order.id);
    return { kind: 'resolved', status };
  } catch {
    // The order exists either way; the tracking screen will show the real state
    // once the webhook lands. Never claim failure we can't substantiate.
    return { kind: 'unconfirmed' };
  }
};
