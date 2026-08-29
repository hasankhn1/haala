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

  // Signed-out customers land on Welcome, which routes on to register or
  // sign-in. Signed-in ones never see it.
  return <Redirect href={status === 'authenticated' ? '/(tabs)' : '/welcome'} />;
}
