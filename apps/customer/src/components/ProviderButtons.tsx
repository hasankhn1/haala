import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text, theme } from '@haala/ui';
import { useGoogleSignIn } from '../auth/useProviderSignIn';

/**
 * The ways in, from `Auth & Checkout.dc.html`.
 *
 * Three things about this follow the design rather than convenience:
 *
 * **Apple only renders on iOS.** App Store review requires the Apple button
 * wherever a third-party sign-in is offered, and it cannot work on Android at
 * all — so on Android it is absent rather than present and broken. It is
 * disabled even on iOS until `verifyAppleIdToken` exists; a button that opens a
 * sheet and then fails is worse than one that says "not yet".
 *
 * **Cancellation is not an error.** Dismissing Google's sheet returns a calm
 * line and leaves the buttons unstyled — no red, no shake. The one thing that
 * line does say is that the basket is untouched, because that is the actual
 * worry.
 *
 * **"Continue with Mobile" is shown disabled.** The design reserves the slot
 * for phone OTP. Rendering it greyed is honest about what is coming without
 * pretending it works; the alternative is a layout that shifts when it lands.
 */
export function ProviderButtons({
  onSignedIn,
  onEmail,
  showReserved = true,
}: {
  onSignedIn: (created: boolean) => void;
  onEmail: () => void;
  /** The reserved OTP row. Hidden in tight spaces like the checkout modal. */
  showReserved?: boolean;
}) {
  const google = useGoogleSignIn(onSignedIn);

  return (
    <View style={styles.wrap}>
      {google.state.kind === 'cancelled' ? (
        <Notice
          icon="information-circle-outline"
          title="Sign-in cancelled"
          body="Your basket is exactly as you left it. Pick any way in."
        />
      ) : null}
      {google.state.kind === 'error' ? (
        <Notice icon="alert-circle-outline" title="Couldn’t finish sign-in" body={google.state.message} />
      ) : null}

      <Row
        label="Continue with Google"
        glyph="G"
        glyphColor="#4285F4"
        loading={google.state.kind === 'pending'}
        disabled={!google.ready}
        hint={google.configured ? undefined : 'Not set up on this build'}
        onPress={google.signIn}
      />

      {/* iOS only — see the note above. */}
      {Platform.OS === 'ios' ? (
        <Row label="Continue with Apple" glyph="" glyphColor={theme.colors.textPrimary} disabled hint="Coming soon" />
      ) : null}

      <Row
        label="Continue with Email"
        icon="mail-outline"
        onPress={() => {
          google.reset();
          onEmail();
        }}
      />

      {showReserved ? (
        <Row label="Continue with Mobile" icon="call-outline" disabled hint="Reserved" />
      ) : null}
    </View>
  );
}

function Row({
  label,
  icon,
  glyph,
  glyphColor,
  onPress,
  loading,
  disabled,
  hint,
}: {
  label: string;
  icon?: 'mail-outline' | 'call-outline';
  glyph?: string;
  glyphColor?: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  hint?: string;
}) {
  const off = disabled || loading;
  return (
    <Pressable
      style={[styles.row, off && styles.rowOff]}
      onPress={off ? undefined : onPress}
      // The design's a11y note: the full sentence, never just the mark.
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(off) }}
    >
      <View style={styles.mark}>
        {icon ? (
          <Icon name={icon} size={19} color={theme.colors.textPrimary} />
        ) : (
          <Text variant="title" style={{ color: glyphColor }}>
            {glyph}
          </Text>
        )}
      </View>
      <Text variant="bodyStrong" style={styles.rowLabel}>
        {loading ? 'Signing you in…' : label}
      </Text>
      {hint ? (
        <Text variant="caption" color="textTertiary">
          {hint}
        </Text>
      ) : null}
    </Pressable>
  );
}

function Notice({ icon, title, body }: { icon: 'information-circle-outline' | 'alert-circle-outline'; title: string; body: string }) {
  return (
    <View style={styles.notice} accessibilityLiveRegion="polite">
      <Icon name={icon} size={18} color={theme.colors.textSecondary} />
      <View style={styles.flex}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="bodySm" color="textSecondary">
          {body}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing.md },
  flex: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    // 56 clears the design's 44×44 minimum with room to spare.
    minHeight: 56,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radii.sm,
    borderWidth: 1.4,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  rowOff: { opacity: 0.5 },
  rowLabel: { flex: 1 },
  mark: { width: 24, alignItems: 'center' },
  notice: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surfaceMuted,
  },
});
