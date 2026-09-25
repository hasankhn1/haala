import { z } from 'zod';

/**
 * A card Safepay is holding on a customer's behalf.
 *
 * Everything here is display-only and safe to send to a phone: a scheme name,
 * the last four digits and an expiry. The number never exists outside Safepay,
 * and `token` is theirs — it identifies the card to *them*, is scoped to one
 * customer, and cannot be charged by anyone holding it alone.
 */
export interface SavedCardDto {
  /** Safepay's payment-method token, `pm_…`. */
  token: string;
  /** "Visa" | "Mastercard", or null when the BIN does not tell us. */
  brand: string | null;
  last4: string | null;
  /** Two digits, e.g. "07". */
  expiryMonth: string | null;
  /** Four digits, e.g. "2028". */
  expiryYear: string | null;
}

export interface SavedCardListView {
  cards: SavedCardDto[];
}

/**
 * Safepay tokens are `pm_` followed by a UUID. Pinned so a malformed one is
 * rejected before it reaches their API rather than after.
 */
export const savedCardTokenSchema = z
  .object({ token: z.string().min(4).max(128).regex(/^[A-Za-z0-9_-]+$/) })
  .strict();
export type SavedCardTokenParam = z.infer<typeof savedCardTokenSchema>;

/**
 * How an in-app checkout ended, as far as the *screen* can tell.
 *
 * None of these are proof of payment — see `classifyCheckoutUrl`. They decide
 * when to close the sheet, nothing else.
 */
export type CheckoutExit = 'completed' | 'cancelled';

/**
 * Decide whether a URL the embedded checkout has navigated to means the flow is
 * over, and how.
 *
 * ## Why this lives in `shared`
 *
 * Only the customer app calls it — but the customer app has **no test runner**
 * (a deliberate choice, see CLAUDE.md), and this is the one piece of the
 * embedded flow that can be got wrong silently. Too eager and the sheet snaps
 * shut mid-3DS challenge, taking the customer's payment with it; too lax and it
 * never closes at all. Here it is covered by `node:test` like everything else.
 *
 * ## What it matches
 *
 * Safepay's hosted page, opened with `source=mobile`, does not redirect out to
 * a custom scheme — a WebView cannot reliably follow one. Instead it navigates
 * to its own `/external/complete` or `/external/error`, and the host app is
 * expected to watch for that. Both of ours are also matched, because the page
 * still honours `redirect_url` in some flows and there is no reason to care
 * which one we get.
 *
 * Returns `null` for every other URL — the issuer's 3DS challenge, their own
 * card form, an analytics beacon — all of which must be left alone.
 */
export const classifyCheckoutUrl = (rawUrl: string): CheckoutExit | null => {
  /*
   * Compare against the path only. A query string can carry anything the
   * gateway likes — `?redirect_url=…%2Fexternal%2Fcomplete` is a real shape,
   * since we hand them a return URL — and matching on the whole string would
   * read our own outbound parameter as an arrival and close the sheet on the
   * very first page load.
   */
  let path = rawUrl;
  try {
    const parsed = new URL(rawUrl);
    path = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    // A custom scheme like `haala://order/confirmed` parses fine in modern
    // runtimes; anything that does not is matched as-is below.
  }

  if (path.includes('/external/complete')) return 'completed';
  if (path.includes('/external/error')) return 'cancelled';

  // The hosted-redirect legs, for whichever flow produces them.
  if (path.startsWith('haala://order/confirmed')) return 'completed';
  if (path.includes('/payments/return/safepay')) return 'completed';

  return null;
};
