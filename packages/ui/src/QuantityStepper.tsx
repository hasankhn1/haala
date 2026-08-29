import { Pressable, StyleSheet, View } from 'react-native';
import { theme } from '@haala/design-tokens';
import { Icon } from './Icon';
import { Text } from './Text';

export interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  size?: 'sm' | 'md';
  loading?: boolean;
  /**
   * `tonal` (default) is the Onyx form: one quiet slate container with ink
   * glyphs. `solid` fills each button with Onyx — reserved for dark surfaces
   * where the tonal version would disappear.
   */
  variant?: 'tonal' | 'solid';
}

export function QuantityStepper({
  value,
  onChange,
  min = 0,
  max = 99,
  size = 'md',
  loading = false,
  variant = 'tonal',
}: QuantityStepperProps) {
  const dim = size === 'sm' ? 30 : 36;
  const glyph = size === 'sm' ? 15 : 17;
  const solid = variant === 'solid';
  const tint = solid ? theme.colors.onPrimary : theme.colors.textPrimary;
  const dec = () => value > min && onChange(value - 1);
  const inc = () => value < max && onChange(value + 1);

  return (
    <View style={[styles.wrap, solid ? styles.wrapSolid : styles.wrapTonal, { height: dim }]}>
      <Pressable
        onPress={dec}
        disabled={loading || value <= min}
        accessibilityLabel="Decrease quantity"
        style={[styles.btn, { width: dim }, value <= min && styles.btnDisabled]}
      >
        <Icon name="remove" size={glyph} color={tint} />
      </Pressable>
      <View style={styles.count}>
        <Text
          variant="label"
          color={solid ? 'onPrimary' : 'textPrimary'}
          align="center"
          style={[styles.countText, { lineHeight: dim }]}
        >
          {value}
        </Text>
      </View>
      <Pressable
        onPress={inc}
        disabled={loading || value >= max}
        accessibilityLabel="Increase quantity"
        style={[styles.btn, { width: dim }, value >= max && styles.btnDisabled]}
      >
        <Icon name="add" size={glyph} color={tint} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: theme.radii.xs,
    overflow: 'hidden',
  },
  wrapTonal: {
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  wrapSolid: { backgroundColor: theme.colors.primary },
  btn: { alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  btnDisabled: { opacity: 0.35 },
  count: { minWidth: 24, alignSelf: 'stretch', justifyContent: 'center' },
  /**
   * The glyphs are icons (perfectly centred by the icon font) but the count is
   * real text, and text does not centre reliably in a fixed-height row: Android
   * adds `includeFontPadding` inside the line box, and the token's own
   * lineHeight (20) is shorter than the control (30/36), so the digit sat high.
   * Stretching the line box to the control height and dropping the font padding
   * puts it on the same optical centre as the − and +.
   */
  countText: { includeFontPadding: false, textAlignVertical: 'center' },
});
