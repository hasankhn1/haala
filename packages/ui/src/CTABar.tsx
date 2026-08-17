import { StyleSheet, View } from 'react-native';
import { theme } from '@haala/design-tokens';
import { Button } from './Button';
import { Text } from './Text';

export interface CTABarProps {
  buttonLabel: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  /** Optional left-side summary, e.g. item count + total. */
  leftTop?: string;
  leftBottom?: string;
}

/**
 * Persistent bottom action bar. Place inside a `Screen`'s `footer`.
 * With left content it splits label/value on the left and the button on the
 * right; without it, the button fills the width.
 */
export function CTABar({
  buttonLabel,
  onPress,
  loading,
  disabled,
  leftTop,
  leftBottom,
}: CTABarProps) {
  const hasLeft = Boolean(leftTop || leftBottom);
  return (
    <View style={styles.bar}>
      {hasLeft ? (
        <View style={styles.left}>
          {leftTop ? (
            <Text variant="caption" color="textSecondary">
              {leftTop}
            </Text>
          ) : null}
          {leftBottom ? <Text variant="title">{leftBottom}</Text> : null}
        </View>
      ) : null}
      <View style={hasLeft ? styles.buttonWrap : styles.buttonFull}>
        <Button label={buttonLabel} onPress={onPress} loading={loading} disabled={disabled} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg },
  left: { flexShrink: 1 },
  buttonWrap: { flex: 1, minWidth: 150 },
  buttonFull: { flex: 1 },
});
