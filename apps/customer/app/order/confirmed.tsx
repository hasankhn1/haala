import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Icon, Text, theme } from '@haala/ui';
import { haptics } from '../../src/lib/haptics';

/**
 * Order confirmed — the *Immersive Onyx* treatment.
 *
 * This is the one screen in the app that inverts the palette: deep ink ground,
 * a single raised panel, white primary action. The Stitch design backs it with
 * an animated WebGL shader; that needs `expo-gl` and a GL context we don't
 * otherwise carry, so the backdrop is rendered as layered translucent ink
 * blooms — static, but the same depth and mood at none of the cost.
 */
const INK = '#0B1120';
const PANEL = '#161E31';

export default function OrderConfirmedScreen() {
  const router = useRouter();
  const { id, number, eta } = useLocalSearchParams<{
    id: string;
    number?: string;
    eta?: string;
  }>();

  useEffect(() => {
    haptics.success();
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* Ambient blooms standing in for the shader backdrop. */}
      <View style={[styles.bloom, styles.bloomTop]} />
      <View style={[styles.bloom, styles.bloomBottom]} />

      <SafeAreaView style={styles.safe}>
        <View style={styles.panel}>
          <View style={styles.check}>
            <Icon name="checkmark-circle" size={34} color="#FFFFFF" />
          </View>

          <Text variant="h1" align="center" style={styles.title}>
            Order Confirmed!
          </Text>

          {number ? (
            <View style={styles.idChip}>
              <Text variant="labelSm" style={styles.idText}>
                Order ID: {number}
              </Text>
            </View>
          ) : null}

          <Text variant="body" align="center" style={styles.body}>
            Your groceries are being picked and will arrive in{' '}
            <Text variant="bodyStrong" style={styles.bodyStrong}>
              {eta ?? '15 minutes'}
            </Text>
            .
          </Text>

          <View style={styles.actions}>
            <Button
              label="Track Order"
              onPress={() => router.replace(`/order/${id}?placed=1`)}
              style={styles.trackBtn}
              labelColor={INK}
              leadingIcon={<Icon name="navigate-outline" size={18} color={INK} />}
            />
            <Button
              label="Go to Home"
              onPress={() => router.replace('/(tabs)')}
              style={styles.homeBtn}
              labelColor="#FFFFFF"
            />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: INK },
  safe: { flex: 1, justifyContent: 'center', padding: theme.layout.margin },

  bloom: { position: 'absolute', borderRadius: 999, backgroundColor: '#1E293B', opacity: 0.55 },
  bloomTop: { width: 420, height: 420, top: -160, right: -150 },
  bloomBottom: { width: 360, height: 360, bottom: -140, left: -130, opacity: 0.4 },

  panel: {
    backgroundColor: PANEL,
    borderRadius: theme.radii.lg,
    padding: theme.spacing['2xl'],
    alignItems: 'center',
    gap: theme.spacing.lg,
  },
  check: {
    width: 64,
    height: 64,
    borderRadius: theme.radii.md,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: '#FFFFFF' },
  idChip: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: theme.radii.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 5,
  },
  idText: { color: '#E2E8F0' },
  body: { color: '#94A3B8' },
  bodyStrong: { color: '#FFFFFF' },

  actions: { alignSelf: 'stretch', gap: theme.spacing.md, marginTop: theme.spacing.sm },
  /** Inverted primary: white plate, ink label — the only white CTA in the app. */
  trackBtn: { backgroundColor: '#FFFFFF' },
  homeBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
});
