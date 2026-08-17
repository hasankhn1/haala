import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@haala/design-tokens';
import { Text } from './Text';

type ToastType = 'success' | 'error' | 'info';

interface ToastContextValue {
  show: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** App-wide toast for post-action feedback. Wrap the app once, inside SafeAreaProvider. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(24)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const show = useCallback(
    (message: string, type: ToastType = 'success') => {
      setToast({ message, type });
      if (timer.current) clearTimeout(timer.current);
      opacity.setValue(0);
      translateY.setValue(24);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
      ]).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(
          ({ finished }) => finished && setToast(null),
        );
      }, 2400);
    },
    [opacity, translateY],
  );

  const accent =
    toast?.type === 'error'
      ? theme.colors.error
      : toast?.type === 'info'
        ? theme.colors.info
        : theme.colors.success;

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.wrap,
            { bottom: insets.bottom + 24, opacity, transform: [{ translateY }] },
          ]}
        >
          <View style={[styles.toast, { borderLeftColor: accent }]}>
            <Text variant="bodyStrong" numberOfLines={2}>
              {toast.message}
            </Text>
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: theme.spacing.lg,
    right: theme.spacing.lg,
    alignItems: 'center',
  },
  toast: {
    maxWidth: 480,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderLeftWidth: 4,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    ...theme.elevation.sheet,
  },
});
