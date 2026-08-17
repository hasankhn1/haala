import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';
import { theme } from '@haala/design-tokens';
import { Text } from './Text';

export interface DeliveryTrackerStep {
  label: string;
}

export interface DeliveryTrackerProps {
  steps: DeliveryTrackerStep[];
  /** Zero-based index of the step currently in progress. */
  current: number;
}

/**
 * Horizontal delivery progress rail — the four-beat
 * *Placed → Picking → On the way → Delivered* indicator on the tracking screen.
 *
 * Onyx renders progress as ink on a hairline: completed beats are small solid
 * dots, the live beat is a larger dot with a halo and the only bold label, and
 * upcoming beats fade to `borderStrong`. No color, no bars — the eye finds the
 * current state by weight alone.
 */
export function DeliveryTracker({ steps, current }: DeliveryTrackerProps) {
  return (
    <View>
      <View style={styles.rail}>
        {steps.map((step, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <Fragment key={step.label}>
              <View style={styles.dotSlot}>
                {active ? <View style={styles.halo} /> : null}
                <View
                  style={[
                    styles.dot,
                    active ? styles.dotActive : done ? styles.dotDone : styles.dotUpcoming,
                  ]}
                />
              </View>
              {i < steps.length - 1 ? (
                <View style={[styles.line, done ? styles.lineOn : styles.lineOff]} />
              ) : null}
            </Fragment>
          );
        })}
      </View>

      <View style={styles.labels}>
        {steps.map((step, i) => (
          <View key={step.label} style={styles.labelSlot}>
            <Text
              variant={i === current ? 'labelSm' : 'caption'}
              color={i <= current ? 'textPrimary' : 'textTertiary'}
              align="center"
              numberOfLines={2}
            >
              {step.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const SLOT = 20;
const styles = StyleSheet.create({
  rail: { flexDirection: 'row', alignItems: 'center' },
  dotSlot: { width: SLOT, height: SLOT, alignItems: 'center', justifyContent: 'center' },
  halo: {
    position: 'absolute',
    width: SLOT,
    height: SLOT,
    borderRadius: SLOT / 2,
    backgroundColor: theme.colors.surfaceMuted,
  },
  dot: { borderRadius: 999 },
  dotActive: { width: 12, height: 12, backgroundColor: theme.colors.primary },
  dotDone: { width: 8, height: 8, backgroundColor: theme.colors.primary },
  dotUpcoming: { width: 8, height: 8, backgroundColor: theme.colors.borderStrong },
  line: { flex: 1, height: 1 },
  lineOn: { backgroundColor: theme.colors.primary },
  lineOff: { backgroundColor: theme.colors.border },
  labels: { flexDirection: 'row', marginTop: theme.spacing.sm },
  labelSlot: { flex: 1, alignItems: 'center' },
});
