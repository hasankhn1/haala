import { Stack } from 'expo-router';

/**
 * Auth, presented over whatever asked for it.
 *
 * A modal group rather than a route of its own, so signing in from checkout
 * **pops** back instead of navigating. Checkout is never unmounted, which is
 * what keeps the basket, the chosen address, the payment method, the tip and
 * any promo code exactly where the customer left them. Navigating away and
 * back would remount the screen and lose all of it — the design's step 2 is
 * explicit that checkout state lives in checkout, not in the auth stack.
 */
export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        presentation: 'modal',
        animation: 'slide_from_bottom',
      }}
    />
  );
}
