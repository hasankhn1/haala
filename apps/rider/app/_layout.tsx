import { useEffect, type ReactNode } from 'react';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastProvider, setImageBaseUrl, theme } from '@haala/ui';
import { AuthProvider, useAuth } from '../src/auth/AuthContext';
import { API_URL } from '../src/config';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

// Product images are served by the API as root-relative paths; resolve them
// against whatever host this build talks to.
setImageBaseUrl(API_URL);

const queryClient = new QueryClient({
  defaultOptions: {
    // A rider's queue changes underneath them constantly, so this refetches
    // more eagerly than the customer app does.
    queries: { retry: 1, staleTime: 5_000, refetchOnWindowFocus: true },
  },
});

function SplashGate({ fontsReady, children }: { fontsReady: boolean; children: ReactNode }) {
  const { status } = useAuth();
  const ready = fontsReady && status !== 'loading';
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);
  if (!ready) return null;
  return <>{children}</>;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  const fontsReady = fontsLoaded || Boolean(fontError);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <AuthProvider>
              <SplashGate fontsReady={fontsReady}>
                <StatusBar style="dark" />
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: theme.colors.background },
                    animation: 'slide_from_right',
                  }}
                />
              </SplashGate>
            </AuthProvider>
          </ToastProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
