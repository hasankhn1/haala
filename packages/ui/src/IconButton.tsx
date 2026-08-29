import { ActivityIndicator, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { theme } from '@haala/design-tokens';
import { Icon, type IconName } from './Icon';

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
  /** Swaps the glyph for a spinner and blocks presses. */
  loading?: boolean;
  /** Fills the glyph — Lucide draws outlines only, so on/off states need this. */
  fill?: string;
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
  loading = false,
  fill,
  style,
}: IconButtonProps) {
  const isDisabled = disabled || loading;
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
      disabled={isDisabled}
      hitSlop={8}
      style={({ pressed }) => [
        styles.btn,
        { width: dimension, height: dimension, backgroundColor: bg },
        variant === 'surface' && styles.surface,
        pressed && { opacity: 0.7 },
        isDisabled && { opacity: 0.4 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={iconColor} />
      ) : (
        <Icon name={name} size={size} color={iconColor} fill={fill} />
      )}
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
