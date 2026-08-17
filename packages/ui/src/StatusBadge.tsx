import { View } from 'react-native';
import { theme, type StatusColorKey } from '@haala/design-tokens';
import { Text } from './Text';

const LABELS: Record<string, string> = {
  placed: 'Placed',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  packed: 'Packed',
  picked_up: 'Picked up',
  nearby: 'Nearby',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  failed: 'Failed',
};

/**
 * Order/delivery status chip. Onyx keeps these **tonal and rectangular** (4px)
 * — pale slate/indigo fills with ink text, so a list of orders reads as a
 * calm document rather than a row of traffic lights.
 */
export function StatusBadge({ status }: { status: string }) {
  const c =
    theme.statusColors[status as StatusColorKey] ??
    ({ fg: theme.colors.textSecondary, bg: theme.colors.surfaceMuted } as const);
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: c.bg,
        borderRadius: theme.radii.xs,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: 4,
      }}
    >
      <Text variant="labelSm" style={{ color: c.fg }}>
        {LABELS[status] ?? status}
      </Text>
    </View>
  );
}
