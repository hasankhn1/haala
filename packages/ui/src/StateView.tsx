import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { theme } from '@haala/design-tokens';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { Text } from './Text';

export interface StateViewProps {
  loading?: boolean;
  error?: unknown;
  isEmpty?: boolean;
  empty?: ReactNode;
  /**
   * Rendered instead of the spinner while loading. Prefer a skeleton that
   * matches the real layout — it keeps the page from jumping when data lands.
   */
  loadingFallback?: ReactNode;
  onRetry?: () => void;
  children: ReactNode;
}

/**
 * Standardises the loading / error / empty / content states every data-backed
 * screen needs (per the design spec). Wrap the content and pass query state.
 */
export function StateView({
  loading,
  error,
  isEmpty,
  empty,
  loadingFallback,
  onRetry,
  children,
}: StateViewProps) {
  if (loading) {
    if (loadingFallback) return <>{loadingFallback}</>;
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.primary} size="large" />
      </View>
    );
  }
  if (error) {
    const message = error instanceof Error ? error.message : 'Something went wrong';
    return (
      <View style={styles.center}>
        <Text style={styles.emoji}>⚠️</Text>
        <Text variant="h3" align="center">
          Couldn’t load this
        </Text>
        <Text variant="body" color="textSecondary" align="center">
          {message}
        </Text>
        {onRetry ? (
          <View style={styles.retry}>
            <Button label="Try again" variant="secondary" fullWidth={false} onPress={onRetry} />
          </View>
        ) : null}
      </View>
    );
  }
  if (isEmpty) {
    return <>{empty ?? <EmptyState title="Nothing here yet" />}</>;
  }
  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing['2xl'],
  },
  emoji: { fontSize: 40, lineHeight: 48 },
  retry: { marginTop: theme.spacing.lg },
});
