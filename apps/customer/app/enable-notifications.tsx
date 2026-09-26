import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Text, theme } from '@haala/ui';
import { NowDotMark } from '../src/components/NotificationTile';
import { enablePush } from '../src/lib/usePushRegistration';

/**
 * Permission priming, from `Haala Notifications.dc.html`: why notifications
 * are worth having, said before the OS asks — because the OS asks only once.
 *
 * Opened by `usePushPriming`, never on first launch. Every way out goes back to
 * the screen underneath; the count of showings is kept by the hook.
 *
 * The illustration says "Your rider" where the comp names one: it is a picture
 * of the feature, and a stranger's name in it would read as someone real.
 */

const BENEFITS = [
  'Live ETA from packing to your door',
  'A ping 2 min before arrival — no missed calls at the gate',
  'Refund and payment receipts instantly',
];

export default function EnableNotificationsScreen() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const turnOn = async () => {
    setBusy(true);
    try {
      await enablePush();
    } finally {
      router.back();
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        accessibilityRole="button"
        style={styles.skip}
      >
        <Text variant="label" color="textSecondary">
          Skip
        </Text>
      </Pressable>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={styles.eta}>
            <View style={styles.etaLine}>
              <Text variant="display" color="primary" style={styles.etaFigure}>
                7 min
              </Text>
              <Text variant="label" color="textInverse" style={styles.etaCaption}>
                Your rider is on the way
              </Text>
            </View>
            <View style={styles.etaTrack}>
              <View style={[StyleSheet.absoluteFill, styles.etaGround]} />
              <View style={styles.etaFill} />
            </View>
          </View>
          <View style={styles.ping}>
            <View style={styles.pingTile}>
              <NowDotMark size={16} color={theme.colors.onPrimary} />
            </View>
            <Text variant="label">Arriving in 2 min</Text>
          </View>
        </View>

        <Text variant="h1" style={styles.title}>
          Know the moment your rider reaches the gate
        </Text>

        <View style={styles.benefits}>
          {BENEFITS.map((benefit, i) => (
            <View key={benefit} style={styles.benefit}>
              <View style={styles.number}>
                <Text variant="labelSm" color="onPrimary">
                  {i + 1}
                </Text>
              </View>
              <Text variant="label" style={styles.benefitText}>
                {benefit}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Text variant="bodySm" color="textSecondary" style={styles.centered}>
          Offers are off by default. Change anytime in Settings.
        </Text>
        <Button label="Turn on notifications" size="lg" fullWidth loading={busy} onPress={turnOn} />
        <Pressable
          onPress={() => router.back()}
          disabled={busy}
          accessibilityRole="button"
          style={styles.notNow}
        >
          <Text variant="label" color="textSecondary">
            Not now
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingHorizontal: theme.spacing.xl,
  },
  flex: { flex: 1 },
  centered: { textAlign: 'center' },
  skip: { alignSelf: 'flex-end', paddingTop: theme.spacing.md },
  content: { paddingTop: 22, paddingBottom: theme.spacing.xl },
  eta: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.lg,
    padding: 14,
  },
  etaLine: { flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.sm },
  etaFigure: { fontSize: 28, lineHeight: 30 },
  etaCaption: { paddingBottom: 3 },
  etaTrack: {
    height: 6,
    borderRadius: 3,
    marginTop: theme.spacing.md,
    overflow: 'hidden',
  },
  // White at 18%, as the comp draws it on the dark card.
  etaGround: { backgroundColor: theme.colors.textInverse, opacity: 0.18 },
  etaFill: { width: '62%', height: '100%', backgroundColor: theme.colors.primary },
  ping: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.layout.elementGap,
    marginTop: theme.spacing.sm,
    marginHorizontal: theme.layout.elementGap,
    paddingVertical: theme.layout.elementGap,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surface,
    ...theme.elevation.card,
  },
  pingTile: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { marginTop: 28, fontSize: 24, lineHeight: 29, letterSpacing: -0.24 },
  benefits: { gap: theme.spacing.md, marginTop: 18 },
  benefit: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.layout.elementGap },
  // Centres the first line on the 22pt number beside it; later lines wrap below.
  benefitText: { flex: 1, paddingTop: 4 },
  number: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: { gap: theme.spacing.md, paddingBottom: theme.spacing.sm },
  notNow: { alignItems: 'center', paddingVertical: theme.spacing.md },
});
