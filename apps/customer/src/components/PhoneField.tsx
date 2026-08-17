import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Text, theme } from '@haala/ui';

const COUNTRY_CODE = '+92';
const NATIONAL_LENGTH = 10;

export interface PhoneFieldProps {
  /** The national part only — 10 digits, no country code. */
  value: string;
  onChangeText: (value: string) => void;
  label?: string;
  error?: string;
}

/**
 * Pakistani mobile input, split exactly as the Onyx design draws it: a fixed
 * `+92` affix sitting flush against the number field. Callers hold only the
 * national digits; `toE164` composes the value the API expects.
 */
export function PhoneField({
  value,
  onChangeText,
  label = 'Phone Number',
  error,
}: PhoneFieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <Text variant="labelSm" color="textSecondary">
        {label}
      </Text>
      <View style={[styles.field, focused && styles.focused, error ? styles.errored : null]}>
        <View style={styles.affix}>
          <Text variant="bodyStrong">{COUNTRY_CODE}</Text>
        </View>
        <TextInput
          style={styles.input}
          value={value}
          // Strip anything that isn't a digit so paste and IME input stay valid.
          onChangeText={(t) => onChangeText(t.replace(/\D/g, '').slice(0, NATIONAL_LENGTH))}
          keyboardType="number-pad"
          placeholder="300 1234567"
          placeholderTextColor={theme.colors.textTertiary}
          maxLength={NATIONAL_LENGTH}
          textContentType="telephoneNumber"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </View>
      {error ? (
        <Text variant="caption" color="error">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** National digits → the `+92XXXXXXXXXX` form `phoneSchema` validates. */
export const toE164 = (national: string): string => `${COUNTRY_CODE}${national}`;

/** True once the number is long enough to submit. */
export const isCompletePhone = (national: string): boolean => national.length === NATIONAL_LENGTH;

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing.sm },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    height: theme.controlHeight.lg,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    overflow: 'hidden',
  },
  focused: { borderColor: theme.colors.primary, backgroundColor: theme.colors.surface },
  errored: { borderColor: theme.colors.error },
  affix: {
    paddingHorizontal: theme.spacing.lg,
    height: '100%',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
  },
  input: {
    flex: 1,
    height: '100%',
    paddingHorizontal: theme.spacing.lg,
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.fontSize.body,
    color: theme.colors.textPrimary,
  },
});
