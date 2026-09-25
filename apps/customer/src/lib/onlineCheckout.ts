import type { PaymentStatus, PlaceOrderResult } from '@haala/shared';
import { paymentsApi } from '../api/endpoints';
import type { SheetOutcome } from '../components/PaymentSheet';

/**
 * Runs the hosted-checkout leg of an online payment.
 *
 * **How the page is shown is injected**, not decided here — `usePaymentSheet()`
 * gives an embedded WebView on native and a browser tab on web, and this
 * function does not care which. It only sequences: show the page, then ask our
 * own server what happened.
 *
 * The outcome of the sheet is **not** treated as evidence of payment. A
 * dismissed sheet and a successful payment look identical from here, and a
 * customer could close it after paying or before. So the answer always comes
 * from asking our server to re-check the gateway — and the gateway's webhook is
 * what actually moves the payment to `paid`.
 */
export type CheckoutOutcome =
  | { kind: 'not_required' }
  | { kind: 'resolved'; status: PaymentStatus }
  | { kind: 'unconfirmed' };

export const runOnlineCheckout = async (
  result: PlaceOrderResult,
  present: (url: string) => Promise<SheetOutcome>,
): Promise<CheckoutOutcome> => {
  const url = result.checkout?.url;
  // COD, or a provider that needs no redirect.
  if (!url) return { kind: 'not_required' };

  try {
    await present(url);
  } catch {
    // Failing to show the page is not the same as failing to pay — an earlier
    // attempt may already have gone through, so still verify.
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
