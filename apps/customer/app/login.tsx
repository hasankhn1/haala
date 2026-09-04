import { useRouter } from 'expo-router';
import { SignInFlow } from '../src/components/SignInFlow';
import { RouteError } from '../src/components/RouteError';

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

/**
 * Expo Router renders this in place of the screen when it throws while
 * rendering. Worth having specifically here: a provider library that cannot
 * find its client id throws from inside a hook, and the failure used to present
 * as an unexplained bounce to the homepage.
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return <RouteErrorScreen error={error} retry={retry} />;
}

function RouteErrorScreen({ error, retry }: { error: Error; retry: () => void }) {
  const router = useRouter();
  return (
    <RouteError
      error={error}
      retry={retry}
      what="Sign in"
      onDismiss={() => router.replace('/(tabs)')}
    />
  );
}
