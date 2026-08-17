import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { theme } from '@haala/design-tokens';
import { Text } from './Text';

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
}

/**
 * Onyx & Ink text field: a soft slate fill with a hairline border at rest that
 * **darkens to Onyx on focus**. No shadow at rest — depth here would compete
 * with the cards around it.
 */
export function Input({ label, error, style, ...rest }: InputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      {label ? (
        <Text variant="labelSm" color="textSecondary">
          {label}
        </Text>
      ) : null}
      <TextInput
        placeholderTextColor={theme.colors.textTertiary}
        style={[styles.input, focused && styles.focused, error ? styles.errored : null, style]}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...rest}
      />
      {error ? (
        <Text variant="caption" color="error">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

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
  /** Focus lifts the field to white and draws the Onyx edge. */
  focused: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surface,
  },
  errored: { borderColor: theme.colors.error },
});
