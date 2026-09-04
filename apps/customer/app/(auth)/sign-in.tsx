import { useLocalSearchParams, useRouter } from 'expo-router';
import { SignInFlow } from '../../src/components/SignInFlow';

/**
 * The sign-in modal, opened by checkout.
 *
 * Both exits are `router.back()`: success and dismissal alike return to the
 * screen underneath rather than navigating anywhere. Checkout is still mounted
 * behind this, so it simply becomes visible again — with everything the
 * customer had already chosen still selected.
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
      onSignedIn={() => router.back()}
      onDismiss={() => router.back()}
    />
  );
}
