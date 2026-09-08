import { useLocalSearchParams, useRouter } from 'expo-router';
import { SignInFlow } from '../../src/components/SignInFlow';
import { RouteError } from '../../src/components/RouteError';

/**
 * The sign-in modal, opened by checkout.
 *
 * **Success and dismissal go to different places, and that is the fix.**
 * Signing in returns to checkout, which is still mounted underneath with the
 * address, tip and promo the customer had already chosen — nothing is lost and
 * they carry on where they were.
 *
 * Dismissing goes to the **basket**, because that is what the button says. It
 * used to be `router.back()` for both, which put "Back to basket" on a control
 * that returned to checkout: the customer declined to sign in and landed back
 * on the screen that had just asked them to. Checkout needs an account, so
 * there is nothing for them to do there.
 *
 * `reason` lets the caller say why it appeared. Somebody who tapped Checkout
 * and got a sign-in sheet deserves a sentence explaining it, and the design's
 * landing copy for that case reassures them about the basket specifically.
 */
export default function SignInModal() {
  const router = useRouter();
  const { reason } = useLocalSearchParams<{ reason?: string }>();

  return (
    <SignInFlow
      headline={
        reason === 'checkout'
          ? {
              title: 'Almost there',
              sub: 'Sign in to place your order — your basket and delivery details are saved, and you’ll come straight back.',
            }
          : undefined
      }
      /*
       * Not "Continue as guest": this sheet only ever appears because an order
       * needs an account, so offering guest checkout would be a promise the
       * next screen breaks. Same action — the basket, address, tip and promo
       * are all still there because checkout was never unmounted.
       */
      dismissLabel="Back to basket"
      onSignedIn={() => router.back()}
      /*
       * `/(tabs)` rather than `/(tabs)/cart`: the stack is tabs → checkout →
       * this modal, and `dismissTo` matches stack entries. The cart is a *tab
       * within* the tabs entry, not an entry of its own, so naming it matches
       * nothing and the dismissal stops one screen short — on checkout, which
       * is the bug. The Cart tab is the one showing, because that is where the
       * customer came from.
       */
      /*
       * `replace`, after trying the alternatives: `back()` returned to
       * checkout — the screen that had just demanded an account, which is the
       * bug. `dismissTo('/(tabs)/cart')` matched nothing, because a tab is not
       * a stack entry. `dismissTo('/(tabs)')` unwound correctly but landed on
       * whichever tab was last active rather than the basket. Replacing the
       * modal with the cart route swaps this screen for the basket and unwinds
       * checkout with it.
       */
      onDismiss={() => router.replace('/(tabs)/cart')}
    />
  );
}

/**
 * As on `/login`. Dismissal here is `back()` rather than a redirect, because
 * checkout is still mounted underneath and must not be replaced.
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return <ModalErrorScreen error={error} retry={retry} />;
}

function ModalErrorScreen({ error, retry }: { error: Error; retry: () => void }) {
  const router = useRouter();
  return (
    <RouteError error={error} retry={retry} what="Sign in" onDismiss={() => router.back()} />
  );
}
