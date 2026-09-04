/**
 * Product events.
 *
 * There is **no analytics provider in this app**, and this file does not add
 * one — choosing between Amplitude, PostHog, Firebase and the rest is a
 * decision with cost and privacy consequences that belongs to Hassan, not to
 * the auth work. What this does is put the call sites in place and give them
 * one shape, so adopting a provider later is this file's `send` function and
 * nothing else.
 *
 * Until then events go to the console in development and nowhere in
 * production. That is genuinely useful — walking the sign-in and checkout flow
 * with a log open is how you see whether the funnel fires in the order you
 * expect — and it is honest about the fact that nothing is being collected.
 *
 * **What must never be logged**, per the brief and plain sense: passwords,
 * access or refresh tokens, ID tokens, and the delivery phone number itself.
 * The events below carry no free-form payload for exactly that reason — a
 * `props` bag is how a token ends up in a log six months from now. Where a
 * detail genuinely helps, it is a named field with a narrow type.
 */

/**
 * The event names, fixed as a union so a typo is a compile error rather than a
 * silently unqueryable event. Named after what happened, in the order a
 * customer meets them.
 */
export type AnalyticsEvent =
  // Sign-in
  | { name: 'auth_screen_viewed'; from: 'account' | 'checkout' | 'welcome' }
  | { name: 'google_sign_in_started' }
  | { name: 'google_sign_in_success'; created: boolean }
  | { name: 'google_sign_in_failed'; reason: 'cancelled' | 'unconfigured' | 'provider' | 'network' }
  // Declared but not emitted anywhere yet: there is no Apple button, because
  // there is no Apple developer account. Kept so the funnel does not need
  // reshaping when it arrives — 14 of the 17 below fire today.
  | { name: 'apple_sign_in_started' }
  | { name: 'apple_sign_in_success'; created: boolean }
  | { name: 'apple_sign_in_failed'; reason: 'cancelled' | 'unavailable' | 'provider' | 'network' }
  | { name: 'email_sign_in_started' }
  | { name: 'email_sign_in_success'; created: boolean }
  | { name: 'email_sign_in_failed'; reason: 'password' | 'validation' | 'network' }
  // The delivery contact
  | { name: 'mobile_collection_viewed' }
  | { name: 'mobile_collection_started' }
  | { name: 'mobile_collection_success' }
  | { name: 'mobile_collection_failed'; reason: 'invalid' | 'network' | 'server' }
  | { name: 'mobile_collection_dismissed' }
  // Checkout
  | { name: 'checkout_blocked_missing_mobile' }
  | { name: 'guest_cart_merged'; lines: number; skipped: number };

/**
 * The one place a provider would be wired in.
 *
 * Deliberately swallows its own errors: analytics must never be the reason a
 * customer cannot sign in or place an order.
 */
function send(event: AnalyticsEvent): void {
  try {
    if (__DEV__) {
      const { name, ...rest } = event;
      // eslint-disable-next-line no-console
      console.log(
        `📊 ${name}`,
        Object.keys(rest).length > 0 ? rest : '',
      );
    }
    // A provider's own `track(name, props)` goes here.
  } catch {
    // Never rethrow. See above.
  }
}

export const track = send;
