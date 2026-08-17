import { StyleSheet, View } from 'react-native';
import { theme } from '@haala/design-tokens';
import { Text } from './Text';

export type TimelineState = 'done' | 'current' | 'upcoming';

export interface TimelineStep {
  label: string;
  state: TimelineState;
  at?: string;
}

/** Vertical order-progress timeline (spec: "✓ Order placed → Out for delivery"). */
export function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <View>
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        const on = step.state !== 'upcoming';
        return (
          <View key={step.label} style={styles.row}>
            <View style={styles.rail}>
              <View style={[styles.dot, on ? styles.dotOn : styles.dotOff]}>
                {step.state === 'done' ? (
                  <Text variant="caption" color="onPrimary">
                    ✓
                  </Text>
                ) : null}
              </View>
              {!last ? <View style={[styles.line, on ? styles.lineOn : styles.lineOff]} /> : null}
            </View>
            <View style={styles.content}>
              <Text
                variant={step.state === 'current' ? 'bodyStrong' : 'body'}
                color={on ? 'textPrimary' : 'textTertiary'}
              >
                {step.label}
              </Text>
              {step.at ? (
                <Text variant="caption" color="textSecondary">
                  {step.at}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const DOT = 22;
const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: theme.spacing.md },
  rail: { alignItems: 'center', width: DOT },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotOn: { backgroundColor: theme.colors.primary },
  dotOff: { backgroundColor: theme.colors.border },
  line: { width: 2, flex: 1, minHeight: 24 },
  lineOn: { backgroundColor: theme.colors.primary },
  lineOff: { backgroundColor: theme.colors.border },
  content: { flex: 1, paddingBottom: theme.spacing.lg, paddingTop: 1 },
});
