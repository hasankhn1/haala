import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type DimensionValue, type ViewStyle } from 'react-native';
import { theme } from '@haala/design-tokens';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}

/** Pulsing placeholder block for loading states. */
export function Skeleton({
  width = '100%',
  height = 16,
  radius = theme.radii.sm,
  style,
}: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: theme.colors.surfaceMuted,
          opacity,
        },
        style,
      ]}
    />
  );
}

/**
 * A skeleton shaped like a `ProductCard`. Pass the same `variant` the real list
 * uses — a row-shaped placeholder in a 2-column grid reflows every card the
 * moment data lands.
 */
export function ProductCardSkeleton({ variant = 'grid' }: { variant?: 'grid' | 'row' }) {
  if (variant === 'row') {
    return (
      <View style={styles.row}>
        <Skeleton width={64} height={64} radius={theme.radii.sm} />
        <View style={styles.info}>
          <Skeleton width="70%" height={16} />
          <Skeleton width="40%" height={12} />
          <Skeleton width={90} height={20} />
        </View>
        <Skeleton width={64} height={30} radius={theme.radii.xs} />
      </View>
    );
  }
  return (
    <View style={styles.grid}>
      <Skeleton height={110} radius={theme.radii.sm} />
      <Skeleton width="85%" height={16} />
      <Skeleton width="45%" height={12} />
      <View style={styles.gridFooter}>
        <Skeleton width={70} height={20} />
        <Skeleton width={36} height={36} radius={theme.radii.pill} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  info: { flex: 1, gap: theme.spacing.sm },
  grid: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  gridFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing.xs,
  },
});
