import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Icon, Text, theme } from '@haala/ui';

/**
 * What a crashed route shows instead of nothing.
 *
 * Expo Router renders a route's exported `ErrorBoundary` in place of the screen
 * that threw. Without one, a render-time exception took down the whole route:
 * the sign-in screen showed a red overlay in development and, once dismissed,
 * fell through to the root — which redirects to the tabs. So a crash in
 * `ProviderButtons` presented as "sign-in silently sends me to the homepage",
 * which is about as far from the actual cause as a symptom can get.
 *
 * `expo-auth-session` throws from inside a hook when a client id is missing,
 * and it is not the last dependency that will throw during render. This turns
 * that class of failure into something with a name and a way out.
 *
 * `retry` remounts the route. That genuinely fixes a transient failure and
 * genuinely does not fix a missing client id, so there is a way back to the
 * shop next to it.
 */
export function RouteError({
  error,
  retry,
  onDismiss,
  what,
}: {
  error: Error;
  retry: () => void;
  /** Somewhere safe to go when retrying will not help. */
  onDismiss: () => void;
  /** Named so the message is about a thing, not about "an error". */
  what: string;
}) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.body}>
        <View style={styles.icon}>
          <Icon name="alert-circle-outline" size={24} color={theme.colors.textAlert} />
        </View>
        <Text variant="h1">{what} didn’t load</Text>
        <Text variant="body" color="textSecondary">
          Something in this screen failed before it could appear. Nothing you had is lost — your
          basket is still on this device.
        </Text>

        {/* Shown, because hiding it only means somebody has to screenshot a
            blank screen for us instead. */}
        <View style={styles.detail}>
          <Text variant="bodySm" style={styles.detailText}>
            {error.message}
          </Text>
        </View>

        <View style={styles.actions}>
          <Button label="Try again" onPress={retry} size="lg" />
          <Button label="Back to shopping" variant="secondary" onPress={onDismiss} size="lg" />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  body: { flex: 1, padding: 22, gap: theme.spacing.md, justifyContent: 'center' },
  icon: {
    width: 48,
    height: 48,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceAlert,
    borderWidth: 1,
    borderColor: theme.colors.borderAlert,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detail: {
    padding: theme.spacing.md,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surfaceSunken,
  },
  detailText: { color: theme.colors.textSecondary },
  actions: { marginTop: theme.spacing.md, gap: theme.spacing.sm },
});
