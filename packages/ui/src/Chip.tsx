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
  /**
   * Fill when selected. `accent` (the contrast surface) is for filters that
   * sit beside ember content — the notification inbox's category row, where an
   * ember chip would compete with the order tiles beneath it.
   */
  tone?: 'primary' | 'accent';
}

export function Chip({
  label,
  selected = false,
  onPress,
  shape = 'chip',
  tone = 'primary',
}: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      // React Native Web drops `accessibilityState`, so the label carries it too.
      accessibilityLabel={selected ? `${label}, selected` : label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        shape === 'pill' ? styles.pill : styles.rect,
        selected
          ? tone === 'accent'
            ? styles.selectedAccent
            : styles.selected
          : styles.unselected,
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
  selectedAccent: {
    backgroundColor: theme.colors.accent,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  unselected: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
});
