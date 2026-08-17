import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { theme } from '@haala/design-tokens';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  style?: ViewStyle;
  /**
   * Raw label colour. Only for surfaces outside the token palette — e.g. the
   * inverted CTAs on the immersive order-confirmed screen. Prefer `variant`.
   */
  labelColor?: string;
  testID?: string;
}

/**
 * Onyx & Ink button.
 *
 * - **primary** — solid Onyx, white label, no border. `lg` is the canonical
 *   52px CTA height that makes the action feel substantial.
 * - **secondary** — transparent with a precise 1px Onyx border ("thin-line"
 *   aesthetic), Onyx label. Not a grey fill.
 */
const heights: Record<Size, number> = {
  sm: theme.controlHeight.sm,
  md: theme.controlHeight.md,
  lg: theme.controlHeight.lg,
};

const bg: Record<Variant, string> = {
  primary: theme.colors.primary,
  secondary: 'transparent',
  ghost: 'transparent',
  danger: theme.colors.error,
};
const bgPressed: Record<Variant, string> = {
  primary: theme.colors.primaryPressed,
  secondary: theme.colors.surfaceMuted,
  ghost: theme.colors.surfaceMuted,
  danger: theme.palette.red[700],
};
const fg: Record<Variant, keyof typeof theme.colors> = {
  primary: 'onPrimary',
  secondary: 'textPrimary',
  ghost: 'textPrimary',
  danger: 'onPrimary',
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  loading = false,
  disabled = false,
  fullWidth = true,
  leadingIcon,
  trailingIcon,
  style,
  labelColor,
  testID,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const tint = labelColor ?? theme.colors[fg[variant]];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        { height: heights[size], backgroundColor: pressed ? bgPressed[variant] : bg[variant] },
        variant === 'secondary' && styles.outlined,
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={tint} />
      ) : (
        <View style={styles.row}>
          {leadingIcon}
          <Text variant="label" color={fg[variant]} style={labelColor ? { color: tint } : null}>
            {label}
          </Text>
          {trailingIcon}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: theme.radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  outlined: {
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  fullWidth: { alignSelf: 'stretch' },
  disabled: { opacity: 0.4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
});
