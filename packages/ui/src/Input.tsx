import { forwardRef, useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { theme } from '@haala/design-tokens';
import { Text } from './Text';

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
}

/**
 * Text field: a muted fill with a hairline border at rest that lifts to white
 * with an ember edge on focus. No shadow at rest — depth here would compete
 * with the cards around it.
 *
 * Forwards its ref, because focus is sometimes the caller's business: moving to
 * the password field after an email, or to the phone field when a bottom sheet
 * opens, which the design's accessibility notes require.
 */
export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, error, style, onFocus, onBlur, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      {label ? (
        <Text variant="labelSm" color="textSecondary">
          {label}
        </Text>
      ) : null}
      <TextInput
        ref={ref}
        placeholderTextColor={theme.colors.textTertiary}
        style={[styles.input, focused && styles.focused, error ? styles.errored : null, style]}
        // Composed rather than spread over: `{...rest}` used to sit after these,
        // so a caller passing `onFocus` silently replaced the internal one and
        // the field stopped showing that it was focused.
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...rest}
      />
      {error ? (
        <Text variant="caption" color="error">
          {error}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing.sm },
  input: {
    height: theme.controlHeight.lg,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    paddingHorizontal: theme.spacing.lg,
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.fontSize.body,
    color: theme.colors.textPrimary,
  },
  /** Focus lifts the field to white and draws the ember edge. */
  focused: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surface,
  },
  errored: { borderColor: theme.colors.error },
});
