import { useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastProvider, setImageBaseUrl, theme } from '@haala/ui';
import { AuthProvider, useAuth } from '../src/auth/AuthContext';
import { usePushRegistration } from '../src/lib/usePushRegistration';
import { API_URL } from '../src/config';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

// Product images are served by the API as root-relative paths; resolve them
// against whatever host this build talks to.
setImageBaseUrl(API_URL);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false },
  },
});

/**
 * Hold the branded splash until BOTH the session is restored and the Onyx type
 * faces are registered. React Native cannot synthesise weights for a custom
 * family, so painting before the fonts land would flash system-font text and
 * then reflow every screen.
 */
function SplashGate({ fontsReady, children }: { fontsReady: boolean; children: ReactNode }) {
  const { status } = useAuth();
  const ready = fontsReady && status !== 'loading';

  // Sits inside the provider so it can react to sign-in, and above the Stack so
  // a notification tap can navigate regardless of which screen is showing.
  usePushRegistration(status === 'authenticated');

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

  // A font failure must not brick the app — RN falls back to the system face.
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
