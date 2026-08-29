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
 * Basket renders progress as **filled segments**: one bar per beat, ember for
 * everything reached and clay for what is still ahead, with the labels beneath.
 * The previous system drew dots on a hairline and asked the eye to find the
 * current state by weight alone; on a warm canvas a filled bar is read at a
 * glance from across a kitchen, which is where this screen is actually used.
 *
 * The API is unchanged — same steps, same `current` — so the tracking screen
 * needed no edit to adopt it.
 */
export function DeliveryTracker({ steps, current }: DeliveryTrackerProps) {
  return (
    <View>
      <View style={styles.rail}>
        {steps.map((step, i) => (
          <View
            key={step.label}
            style={[styles.segment, i <= current ? styles.segmentOn : styles.segmentOff]}
          />
        ))}
      </View>

      <View style={styles.labels}>
        {steps.map((step, i) => (
          <View key={step.label} style={styles.labelSlot}>
            <Text
              variant="labelSm"
              color={i === current ? 'primary' : i < current ? 'textSecondary' : 'textTertiary'}
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

const styles = StyleSheet.create({
  rail: { flexDirection: 'row', gap: 6 },
  segment: { flex: 1, height: 6, borderRadius: theme.radii.pill },
  segmentOn: { backgroundColor: theme.colors.primary },
  segmentOff: { backgroundColor: theme.colors.border },
  labels: { flexDirection: 'row', marginTop: 9 },
  labelSlot: { flex: 1, alignItems: 'center' },
});
