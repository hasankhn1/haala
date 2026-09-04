import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { theme } from '@haala/ui';
import { useAuth } from '../src/auth/AuthContext';

export default function Index() {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} size="large" />
      </View>
    );
  }

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
