import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { theme } from '@haala/design-tokens';

type IconName = ComponentProps<typeof Ionicons>['name'];
type Variant = 'surface' | 'primary' | 'ghost';

export interface IconButtonProps {
  name: IconName;
  onPress?: () => void;
  /** Glyph size. */
  size?: number;
  /** Outer diameter. The Onyx add-to-cart control is 40px. */
  dimension?: number;
  color?: string;
  variant?: Variant;
  accessibilityLabel?: string;
  disabled?: boolean;
  style?: ViewStyle;
}

/**
 * Round icon control. `primary` is the solid-Onyx circle used for add-to-cart;
 * `surface` is the white circle with a hairline edge used for back/close/heart.
 */
export function IconButton({
  name,
  onPress,
  size = 22,
  dimension = 40,
  color,
  variant = 'surface',
  accessibilityLabel,
  disabled = false,
  style,
}: IconButtonProps) {
  const bg =
    variant === 'primary'
      ? theme.colors.primary
      : variant === 'ghost'
        ? 'transparent'
        : theme.colors.surface;
  const iconColor =
    color ?? (variant === 'primary' ? theme.colors.onPrimary : theme.colors.textPrimary);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [
        styles.btn,
        { width: dimension, height: dimension, backgroundColor: bg },
        variant === 'surface' && styles.surface,
        pressed && { opacity: 0.7 },
        disabled && { opacity: 0.4 },
        style,
      ]}
    >
      <Ionicons name={name} size={size} color={iconColor} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: theme.radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  surface: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    ...theme.elevation.card,
  },
});
