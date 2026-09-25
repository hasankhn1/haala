import { Redirect } from 'expo-router';
import { useAuth } from '../src/auth/AuthContext';

export default function Index() {
  const { status } = useAuth();

  // The launch loader in the root layout covers this until the session is in.
  if (status === 'loading') return null;

  /**
   * Signed out, the app opens on sign-in; signed in, straight to the shop.
   *
   * **This is only the entry point, not a wall.** The tab group stays reachable
   * without an account — "Continue as guest" on that screen goes to the shop,
   * the catalogue is public, and the basket works signed out. So a guest is
   * asked once and can decline, rather than being unable to browse. That is the
   * distinction that matters: the earlier version of this had
   * `<Redirect href="/login" />` inside `(tabs)/_layout.tsx`, which put every
   * tab behind an account and left no way past it.
   */
  return <Redirect href={status === 'authenticated' ? '/(tabs)' : '/login'} />;
}
