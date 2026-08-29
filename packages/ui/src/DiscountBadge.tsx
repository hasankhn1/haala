import { StyleSheet, View } from 'react-native';
import { theme } from '@haala/design-tokens';
import { Text } from './Text';

export interface DiscountBadgeProps {
  /** Percent off, e.g. 20 → "-20%". */
  percent: number;
}

/**
 * Discount marker — Basket's sun-yellow "Save 20%" tag.
 *
 * Yellow is reserved for savings and progress across the system, so a deal
 * reads the same wherever it appears: product grids, the shelf rails, the
 * cart, and the free-delivery bar on Home. It sits on ink text rather than
 * white because yellow-on-white fails contrast at this size.
 */
export function DiscountBadge({ percent }: DiscountBadgeProps) {
  if (percent <= 0) return null;
  return (
    <View style={styles.badge}>
      <Text variant="labelSm" style={styles.label}>
        Save {Math.round(percent)}%
      </Text>
    </View>
  );
}

/** Compute a percentage off from original + current price (paisa). */
export const discountPercent = (price: number, original?: number): number =>
  original && original > price ? Math.round((1 - price / original) * 100) : 0;

const styles = StyleSheet.create({
  badge: {
    backgroundColor: theme.colors.promo,
    borderRadius: theme.radii.xs,
    paddingHorizontal: 7,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  label: { color: theme.colors.onPromo },
});
