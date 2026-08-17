import { Redirect } from 'expo-router';

/**
 * The Onyx design merges checkout into the cart — address, payment, bill and
 * Place Order all live on `/(tabs)/cart`. This route is kept only so existing
 * links and any deep link to `/checkout` still land somewhere sensible.
 */
export default function CheckoutRedirect() {
  return <Redirect href="/(tabs)/cart" />;
}
