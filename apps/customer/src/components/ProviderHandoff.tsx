import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, Text, theme } from '@haala/ui';

/**
 * "Signing you in with Google" — the hand-off, from `Auth & Checkout.dc.html`.
 *
 * Shown while the provider round trip is in flight. It replaces an inline
 * "Signing you in…" label on the button, which was accurate and told somebody
 * nothing: a provider sign-in leaves the app, comes back, and *then* does
 * several things on the server. The steps below say what those are, so the
 * pause has a shape.
 *
 * The steps are **deliberately not faked forward.** Only what has actually
 * happened is ticked: the round trip either returned or it did not, and we do
 * not know that the customer has been matched to an id until the server says
 * so. A progress list that animates ahead of the work is the kind of detail
 * that makes everything else on screen less believable.
 */
export function ProviderHandoff({
  provider,
  onCancel,
}: {
  provider: 'google' | 'apple';
  /**
   * Abandons the attempt and returns to the landing.
   *
   * It cannot recall the browser that is already open — nothing can — so this
   * stops *waiting* rather than cancelling at Google's end. If they finish in
   * the browser afterwards the result is ignored, which is the same outcome as
   * closing it, and the landing says the sign-in was cancelled either way.
   */
  onCancel: () => void;
}) {
  const spin = useRef(new Animated.Value(0)).current;
  const name = provider === 'google' ? 'Google' : 'Apple';

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  // Ticked only where it is true. See the note above.
  const steps: { label: string; done: boolean }[] = [
    { label: `Waiting for ${name}`, done: false },
    { label: 'Matching you to your customer ID', done: false },
    { label: 'Restoring basket and checkout', done: false },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.body}>
        <View style={styles.ringWrap}>
          <Animated.View style={[styles.ring, { transform: [{ rotate }] }]} />
          <View style={styles.chip}>
            {provider === 'google' ? (
              <Text variant="h2" style={styles.googleG}>
                G
              </Text>
            ) : null}
          </View>
        </View>

        <Text variant="h2" align="center" style={styles.title}>
          Signing you in with {name}
        </Text>
        <Text variant="body" color="textSecondary" align="center" style={styles.sub}>
          If you’re new we’ll set the account up for you. No extra screens.
        </Text>

        <View
          style={styles.steps}
          accessible
          accessibilityLabel={`Signing in with ${name}. ${steps.map((s) => s.label).join('. ')}`}
        >
          {steps.map((step) => (
            <View key={step.label} style={styles.step}>
              <View style={[styles.dot, step.done && styles.dotDone]}>
                <Icon
                  name="checkmark"
                  size={11}
                  strokeWidth={3.2}
                  color={step.done ? theme.colors.textInverse : theme.colors.textDisabled}
                />
              </View>
              <Text variant="bodySm" color={step.done ? 'textPrimary' : 'textTertiary'}>
                {step.label}
              </Text>
            </View>
          ))}
        </View>

        <Pressable onPress={onCancel} style={styles.cancel} hitSlop={8} accessibilityRole="button">
          <Text variant="label" color="textSecondary">
            Cancel
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const RING = 86;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 26, paddingBottom: 34 },
  ringWrap: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 3,
    borderColor: theme.colors.surfaceMuted,
    borderTopColor: theme.colors.primary,
  },
  chip: {
    width: 52,
    height: 52,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Google's blue, from their brand guidelines — not a theme colour.
  googleG: { color: '#4285F4' },
  title: { marginTop: 24 },
  sub: { marginTop: 9, maxWidth: 250 },
  steps: { marginTop: 26, width: '100%', maxWidth: 280, gap: 9 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: {
    width: 18,
    height: 18,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: theme.colors.primary },
  cancel: { marginTop: 30, paddingVertical: theme.spacing.md, paddingHorizontal: 18 },
});
