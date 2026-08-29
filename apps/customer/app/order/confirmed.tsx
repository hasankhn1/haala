import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Icon, Text, theme } from '@haala/ui';
import { ETA_MINUTES } from '../../src/config';
import { haptics } from '../../src/lib/haptics';

/**
 * Order placed — Basket's full-bleed ember confirmation.
 *
 * The one screen that fills the frame with the brand colour. Everything the
 * customer wants in the first five seconds sits on a single white card: how
 * long, by when, and how far along. The previous version of this screen was an
 * "Immersive Onyx" treatment with the old ink palette hardcoded, so the
 * re-theme could not reach it — it is rebuilt here rather than recoloured.
 */
export default function OrderConfirmedScreen() {
  const router = useRouter();
  const { id, number } = useLocalSearchParams<{ id: string; number?: string }>();

  useEffect(() => {
    haptics.success();
  }, []);

  // "by 4:42 pm" — the promise stated as a clock time, which reads as more of
  // a commitment than a duration does.
  const by = new Date(Date.now() + ETA_MINUTES * 60_000).toLocaleTimeString('en-PK', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.topRow}>
          {number ? (
            <View style={styles.orderPill}>
              <Text variant="labelSm" color="onPrimary">
                Order {number}
              </Text>
            </View>
          ) : (
            <View />
          )}
          <Pressable
            style={styles.close}
            onPress={() => router.replace('/(tabs)')}
            accessibilityLabel="Close"
          >
            <Icon name="close" size={15} color={theme.colors.onPrimary} />
          </Pressable>
        </View>

        <Text variant="display" color="onPrimary" style={styles.headline}>
          We’re on it.
        </Text>
        <Text variant="bodyStrong" style={styles.sub}>
          Your order is being picked now. We’ll have it at your door shortly.
        </Text>

        <View style={styles.card}>
          <View style={styles.cardTop}>
            <View>
              <Text variant="labelCaps" color="textTertiary">
                ARRIVING IN
              </Text>
              <View style={styles.etaRow}>
                <Text variant="display">{ETA_MINUTES}</Text>
                <Text variant="title" color="textSecondary" style={styles.etaUnit}>
                  min
                </Text>
              </View>
            </View>
            <Text variant="bodySm" color="textSecondary">
              by {by}
            </Text>
          </View>

          {/* Three segments: picking → on the way → delivered. Only the first
              is lit here; the tracking screen advances the rest. */}
          <View style={styles.segments}>
            <View style={[styles.segment, styles.segmentOn]} />
            <View style={styles.segment} />
            <View style={styles.segment} />
          </View>
        </View>

        <View style={styles.actions}>
          <Button
            label="Track order"
            onPress={() => router.replace(`/order/${id}?placed=1`)}
            style={styles.trackBtn}
            labelColor={theme.colors.primary}
            leadingIcon={<Icon name="navigate-outline" size={18} color={theme.colors.primary} />}
          />
          <Button
            label="Keep shopping"
            variant="ghost"
            onPress={() => router.replace('/(tabs)')}
            labelColor={theme.colors.onPrimary}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.primary },
  safe: { flex: 1, padding: theme.layout.margin },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderPill: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: theme.radii.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 7,
  },
  close: {
    width: 32,
    height: 32,
    borderRadius: theme.radii.pill,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: { marginTop: theme.spacing.xl },
  sub: { color: 'rgba(255,255,255,0.86)', marginTop: theme.spacing.sm },
  card: {
    marginTop: theme.spacing.xl,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.xl,
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  etaRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: theme.spacing.xs },
  etaUnit: { marginBottom: 4 },
  segments: { flexDirection: 'row', gap: 5 },
  segment: {
    flex: 1,
    height: 5,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.border,
  },
  segmentOn: { backgroundColor: theme.colors.primary },
  actions: { marginTop: 'auto', gap: theme.spacing.sm },
  trackBtn: { backgroundColor: theme.colors.surface },
});
