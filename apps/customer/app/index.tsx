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
   * Everyone lands in the shop.
   *
   * Signed-out customers used to be sent to Welcome and on to a sign-in form
   * before they had seen a single product — which is a lot to ask of somebody
   * who has not yet decided they want anything. Welcome is still reachable, and
   * the account tab still offers signing in; the difference is that browsing no
   * longer requires it.
   */
  return <Redirect href="/(tabs)" />;
}
