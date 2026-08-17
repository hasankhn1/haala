import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';
import { theme } from '@haala/design-tokens';
import { Text } from './Text';

export interface ProgressStepsProps {
  steps: string[];
  /** Zero-based index of the active step. */
  current: number;
}

/** Horizontal step indicator for multi-step flows (e.g. checkout). */
export function ProgressSteps({ steps, current }: ProgressStepsProps) {
  return (
    <View style={styles.row}>
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        const on = done || active;
        return (
          <Fragment key={label}>
            <View style={styles.step}>
              <View style={[styles.dot, on ? styles.dotOn : styles.dotOff]}>
                <Text variant="caption" color={on ? 'onPrimary' : 'textTertiary'}>
                  {done ? '✓' : String(i + 1)}
                </Text>
              </View>
              <Text
                variant="caption"
                color={active ? 'primary' : on ? 'textPrimary' : 'textTertiary'}
                numberOfLines={1}
              >
                {label}
              </Text>
            </View>
            {i < steps.length - 1 ? (
              <View style={[styles.bar, i < current ? styles.barOn : styles.barOff]} />
            ) : null}
          </Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  step: { alignItems: 'center', gap: 4 },
  dot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dotOn: { backgroundColor: theme.colors.primary },
  dotOff: { backgroundColor: theme.colors.surfaceMuted },
  bar: { flex: 1, height: 2, marginHorizontal: theme.spacing.xs, marginBottom: 18 },
  barOn: { backgroundColor: theme.colors.primary },
  barOff: { backgroundColor: theme.colors.border },
});
