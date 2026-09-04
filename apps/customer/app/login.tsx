import { useRouter } from 'expo-router';
import { SignInFlow } from '../src/components/SignInFlow';

/**
 * Sign in, reached from the account tab or Welcome.
 *
 * The flow itself lives in `SignInFlow`, because the same steps are also
 * presented as a modal over checkout. Here they are a screen, so signing in
 * lands in the shop.
 */
export default function LoginScreen() {
  const router = useRouter();
  return (
    <SignInFlow
      onSignedIn={() => router.replace('/(tabs)')}
      onDismiss={() => router.back()}
    />
  );
}
