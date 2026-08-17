import { StyleSheet, View } from 'react-native';
import { theme } from '@haala/design-tokens';
import { Text } from './Text';

export interface DiscountBadgeProps {
  /** Percent off, e.g. 20 → "-20%". */
  percent: number;
}

/**
 * Discount marker. Onyx-tonal rather than a loud red pill: the saving is stated
 * in ink on a pale slate ground so it reads as information, not a sticker.
 */
export function DiscountBadge({ percent }: DiscountBadgeProps) {
  if (percent <= 0) return null;
  return (
    <View style={styles.badge}>
      <Text variant="labelSm" color="onPrimary">
        -{Math.round(percent)}%
      </Text>
    </View>
  );
}

/** Compute a percentage off from original + current price (paisa). */
export const discountPercent = (price: number, original?: number): number =>
  original && original > price ? Math.round((1 - price / original) * 100) : 0;

const styles = StyleSheet.create({
  badge: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radii.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
});
