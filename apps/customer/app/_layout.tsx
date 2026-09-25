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
import { Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastProvider, setImageBaseUrl, theme } from '@haala/ui';
import { AuthProvider, useAuth } from '../src/auth/AuthContext';
import { SplashOverlay } from '../src/components/SplashLoader';
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
 * Hold the app behind the loader until BOTH the session is restored and the
 * type faces are registered. React Native cannot synthesise weights for a
 * custom family, so painting before the fonts land would flash system-font
 * text and then reflow every screen.
 *
 * The native splash is only the first frame: it is the same ember as the GIF
 * loader, so it is hidden at once and the loader takes over seamlessly.
 */
function SplashGate({ fontsReady, children }: { fontsReady: boolean; children: ReactNode }) {
  const { status } = useAuth();
  const ready = fontsReady && status !== 'loading';
  // Home is `/`. A launch from a notification or a deep link goes elsewhere,
  // and waiting on a home screen that will never mount holds the full 8s.
  const pathname = usePathname();

  // Sits inside the provider so it can react to sign-in, and above the Stack so
  // a notification tap can navigate regardless of which screen is showing.
  usePushRegistration(status === 'authenticated');

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  return (
    <SplashOverlay ready={ready} waitForHome={status === 'authenticated' && pathname === '/'}>
      {children}
    </SplashOverlay>
  );
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
