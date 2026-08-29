import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatPKR } from '@haala/shared';
import { Icon, type IconName, Text, theme } from '@haala/ui';
import { ETA_MINUTES, FREE_DELIVERY_THRESHOLD } from '../src/config';

/**
 * Welcome — the first screen a signed-out customer sees.
 *
 * The Basket comps cover the shopping flow and stop there: there is no welcome
 * or auth screen in the design file. So this is built from the system's own
 * vocabulary rather than invented as a third language — the full-bleed ember of
 * the confirmation screen, the pills and extrabold headings used everywhere
 * else, and the same 26px sweep the Home hero uses.
 *
 * Every claim on it is one the app can keep: the ETA and the free-delivery
 * threshold are the shared pricing constants, and the first-order offer is the
 * real seeded `HAALA100` promotion.
 */
const POINTS: Array<{ icon: IconName; title: string; body: string }> = [
  {
    icon: 'flash-outline',
    title: `${ETA_MINUTES}-minute delivery`,
    body: 'Milk, eggs, bread and the one thing you forgot.',
  },
  {
    icon: 'storefront-outline',
    title: 'From a store near you',
    body: 'We pick from the closest branch, so it arrives fresh.',
  },
  {
    icon: 'bicycle-outline',
    title: 'Free delivery to start',
    body: `On your first order, and free over ${formatPKR(FREE_DELIVERY_THRESHOLD)} after that.`,
  },
];

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.brandRow}>
          <View style={styles.mark}>
            <Text variant="h2" style={styles.markText}>
              h
            </Text>
          </View>
          <Text variant="title" color="onPrimary">
            Haala
          </Text>
        </View>

        <View style={styles.hero}>
          <Text variant="display" color="onPrimary" style={styles.headline}>
            Groceries at{'\n'}your door in{'\n'}{ETA_MINUTES} minutes.
          </Text>
          <Text variant="bodyStrong" style={styles.sub}>
            Delivering across DHA Peshawar.
          </Text>
        </View>

        <View style={styles.points}>
          {POINTS.map((p) => (
            <View key={p.title} style={styles.point}>
              <View style={styles.pointIcon}>
                <Icon name={p.icon} size={16} color={theme.colors.onPrimary} />
              </View>
              <View style={styles.flex}>
                <Text variant="bodyStrong" color="onPrimary">
                  {p.title}
                </Text>
                <Text variant="bodySm" style={styles.pointBody}>
                  {p.body}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          <Pressable
            style={styles.primary}
            onPress={() => router.push('/register')}
            accessibilityRole="button"
          >
            <Text variant="title" style={styles.primaryText}>
              Get started
            </Text>
            <Icon name="arrow-forward" size={17} color={theme.colors.primary} />
          </Pressable>
          <Pressable
            style={styles.secondary}
            onPress={() => router.push('/login')}
            accessibilityRole="button"
          >
            <Text variant="label" color="onPrimary">
              I already have an account
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.primary },
  safe: { flex: 1, paddingHorizontal: theme.layout.margin, paddingBottom: theme.spacing.md },
  flex: { flex: 1 },

  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.lg,
  },
  mark: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markText: { color: theme.colors.primary },

  // The headline takes the space; the points sit under it, actions pinned low.
  hero: { marginTop: theme.spacing['2xl'] },
  headline: { lineHeight: 34 },
  sub: { color: 'rgba(255,255,255,0.86)', marginTop: theme.spacing.md },

  points: { marginTop: 'auto', gap: theme.spacing.lg, paddingBottom: theme.spacing.xl },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md },
  pointIcon: {
    width: 32,
    height: 32,
    borderRadius: theme.radii.pill,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointBody: { color: 'rgba(255,255,255,0.8)', marginTop: 2 },

  actions: { gap: 10 },
  primary: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.pill,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  primaryText: { color: theme.colors.primary },
  secondary: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
    borderRadius: theme.radii.pill,
    paddingVertical: 14,
    alignItems: 'center',
  },
});
