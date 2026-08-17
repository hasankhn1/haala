import { Pressable, StyleSheet } from 'react-native';
import { theme } from '@haala/design-tokens';
import { Text } from './Text';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /**
   * `chip` (default) is the Onyx rectangular 4px-radius chip used for filters
   * and tags. `pill` is reserved for the horizontally-scrolling category rail
   * on Home, where the rounded form reads as a scannable rail rather than a
   * set of controls.
   */
  shape?: 'chip' | 'pill';
}

export function Chip({ label, selected = false, onPress, shape = 'chip' }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        shape === 'pill' ? styles.pill : styles.rect,
        selected ? styles.selected : styles.unselected,
        pressed && { opacity: 0.85 },
      ]}
    >
      <Text variant="labelSm" color={selected ? 'onPrimary' : 'textPrimary'}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: theme.spacing.lg,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rect: { borderRadius: theme.radii.xs },
  pill: { borderRadius: theme.radii.pill },
  selected: { backgroundColor: theme.colors.primary, borderWidth: 1, borderColor: 'transparent' },
  unselected: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
});
