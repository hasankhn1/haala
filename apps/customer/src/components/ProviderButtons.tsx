import { useEffect, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text, theme } from '@haala/ui';
import { GOOGLE_CONFIGURED, type ProviderState, useGoogleSignIn } from '../auth/useProviderSignIn';

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
 * **"Continue with Mobile" is shown reserved.** The design gives the slot a
 * dashed edge and a "RESERVED SLOT" pill rather than a greyed-out row, which is
 * the difference between "coming" and "broken". Rendering it now also means the
 * layout does not shift when phone OTP lands.
 *
 * The comp puts Apple on **black** and separates the provider pair from email
 * with an "or" — so Google and Apple read as the fast paths and email as the
 * fallback, rather than four interchangeable rows.
 */
export interface ProviderButtonsProps {
  /**
   * Awaited, because the caller hands the guest basket over before navigating
   * and that is a request. `void` alone would typecheck and then not wait.
   */
  onSignedIn: (created: boolean) => void | Promise<void>;
  onEmail: () => void;
  /** The reserved OTP row. Hidden in tight spaces like the checkout modal. */
  showReserved?: boolean;
  /**
   * Raised while a provider round trip is in flight, so the screen above can
   * show the hand-off in place of itself.
   *
   * Reported upwards rather than rendered here because the hand-off is a whole
   * screen and these rows sit inside a scroll view — it has to replace the
   * parent, not appear within it. `null` when the attempt ends, however it ends.
   */
  onHandoff?: (handoff: { provider: 'google' | 'apple'; cancel: () => void } | null) => void;
}

/**
 * **Why this picks a component instead of taking a branch.**
 *
 * `useGoogleSignIn` throws during render when there is no client id for the
 * platform — see the note on `GOOGLE_CONFIGURED`. A hook cannot be called
 * conditionally, so the only way to *not* call it is for the component that
 * calls it never to mount. Hence two components over one with an `if`: the
 * unconfigured build never brings the hook into the tree at all.
 *
 * Both render the identical layout, so the screen does not change shape when a
 * client id appears — only whether the Google row does anything.
 */
export function ProviderButtons(props: ProviderButtonsProps) {
  return GOOGLE_CONFIGURED ? <WithGoogle {...props} /> : <WithoutGoogle {...props} />;
}

function WithGoogle(props: ProviderButtonsProps) {
  const google = useGoogleSignIn(props.onSignedIn);
  return (
    <Rows
      {...props}
      google={{
        state: google.state,
        disabled: !google.ready,
        onPress: google.signIn,
        reset: google.reset,
        cancel: google.cancel,
      }}
    />
  );
}

/**
 * No client id for this platform, so no hook and nothing that can throw. The
 * row says why rather than failing when pressed.
 */
function WithoutGoogle(props: ProviderButtonsProps) {
  return (
    <Rows
      {...props}
      google={{ state: { kind: 'idle' }, disabled: true, hint: 'Not set up on this build' }}
    />
  );
}

interface GoogleSlot {
  state: ProviderState;
  disabled: boolean;
  onPress?: () => void;
  reset?: () => void;
  cancel?: () => void;
  hint?: string;
}

function Rows({
  onEmail,
  showReserved = true,
  onHandoff,
  google,
}: ProviderButtonsProps & { google: GoogleSlot }) {
  const pending = google.state.kind === 'pending';
  const cancel = google.cancel;

  useEffect(() => {
    onHandoff?.(pending && cancel ? { provider: 'google', cancel } : null);
  }, [pending, cancel, onHandoff]);

  return (
    <View style={styles.wrap}>
      {google.state.kind === 'cancelled' ? (
        <Alert
          title="Sign-in cancelled"
          body="No problem — your basket is exactly where you left it. Pick any option to carry on."
        />
      ) : null}
      {google.state.kind === 'error' ? (
        <Alert title="Couldn’t finish sign-in" body={google.state.message} />
      ) : null}

      <Row
        label="Continue with Google"
        mark={<GoogleMark />}
        loading={google.state.kind === 'pending'}
        disabled={google.disabled}
        hint={google.hint}
        onPress={google.onPress}
      />

      {/*
        Hidden on Android, where Apple sign-in cannot work at all. Shown
        disabled on iOS and web: App Store review expects the button wherever
        third-party sign-in is offered, and web is where this screen is being
        reviewed, so omitting it there just makes the screen look wrong.

        Deliberately unmarked: Apple's logo is a brand asset lucide does not
        carry, and standing in a person glyph for it would be both wrong and a
        review risk. When `verifyAppleIdToken` lands this should become
        `expo-apple-authentication`'s own `AppleAuthenticationButton`, which
        renders Apple's compliant button rather than an approximation of it.
      */}
      {Platform.OS !== 'android' ? (
        <Row label="Continue with Apple" tone="dark" disabled hint="Coming soon" />
      ) : null}

      <View style={styles.divider}>
        <View style={styles.rule} />
        <Text variant="labelSm" color="textTertiary">
          or
        </Text>
        <View style={styles.rule} />
      </View>

      <Row
        label="Continue with Email"
        mark={<Icon name="mail-outline" size={19} color={theme.colors.textPrimary} />}
        onPress={() => {
          google.reset?.();
          onEmail();
        }}
      />

      {showReserved ? <ReservedRow /> : null}
    </View>
  );
}

/** Google's mark is four fixed brand colours, so it is drawn, not tinted. */
function GoogleMark() {
  return (
    <View style={styles.googleMark}>
      <Text variant="h3" style={styles.googleG}>
        G
      </Text>
    </View>
  );
}

function Row({
  label,
  mark,
  onPress,
  loading,
  disabled,
  hint,
  tone = 'light',
}: {
  label: string;
  mark?: ReactNode;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  hint?: string;
  /** `dark` is Apple's required black treatment. */
  tone?: 'light' | 'dark';
}) {
  const off = disabled || loading;
  const dark = tone === 'dark';
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        dark ? styles.rowDark : styles.rowLight,
        off && styles.rowOff,
        pressed && !off && styles.rowPressed,
      ]}
      onPress={off ? undefined : onPress}
      // The design's a11y note: the full sentence, never just the mark.
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(off) }}
    >
      {mark}
      <Text variant="h3" color={dark ? 'textInverse' : 'textPrimary'} style={dark ? styles.appleLabel : undefined}>
        {loading ? 'Signing you in…' : label}
      </Text>
      {hint ? (
        <Text variant="caption" color="textTertiary" style={styles.hint}>
          {hint}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * The slot phone OTP will occupy.
 *
 * Not a disabled row: a dashed edge with a pill reads as "reserved", where a
 * greyed row reads as "broken". Deliberately not pressable and not exposed as a
 * button, so a screen reader does not offer a control that does nothing.
 */
function ReservedRow() {
  return (
    <View style={[styles.row, styles.rowReserved]} accessibilityLabel="Continue with Mobile — reserved for a future update">
      <Icon name="call-outline" size={19} color={theme.colors.iconReserved} />
      <Text variant="h3" style={styles.reservedLabel}>
        Continue with Mobile
      </Text>
      <View style={styles.pill}>
        <Text variant="caption" style={styles.pillText}>
          RESERVED SLOT
        </Text>
      </View>
    </View>
  );
}

/**
 * Something went wrong, said on a warm surface.
 *
 * `rust` rather than `error` — see the note on that ramp. A browser-red panel
 * on this screen looks like a system failure; the point is that nothing was
 * lost and they should simply pick another way in.
 */
function Alert({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.alert} accessibilityLiveRegion="polite" accessibilityRole="alert">
      <Icon name="alert-circle-outline" size={17} color={theme.colors.textAlert} />
      <View style={styles.flex}>
        <Text variant="bodyStrong" style={styles.alertTitle}>
          {title}
        </Text>
        <Text variant="bodySm" style={styles.alertBody}>
          {body}
        </Text>
      </View>
    </View>
  );
}

/**
 * Apple's sign-in button is a brand asset, not a themed control: their Human
 * Interface Guidelines allow black, white or outline only, so this is true
 * black rather than the palette's warm near-black `textPrimary`. Same category
 * as Google's blue below — a value we do not get to choose.
 */
const APPLE_BLACK = '#000000';
const APPLE_WHITE = '#FFFFFF';

const ROW_HEIGHT = 54;

const styles = StyleSheet.create({
  wrap: { gap: 11 },
  flex: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 11,
    // The comp's 54, which clears the design's 44×44 minimum.
    height: ROW_HEIGHT,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radii.sm,
  },
  rowLight: {
    borderWidth: 1.4,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surface,
  },
  /** Apple's own guidance: black fill, white label, no border. */
  rowDark: { backgroundColor: APPLE_BLACK },
  appleLabel: { color: APPLE_WHITE },
  rowReserved: {
    borderWidth: 1.4,
    borderStyle: 'dashed',
    borderColor: theme.colors.borderReserved,
    backgroundColor: theme.colors.surfaceAttention,
  },
  rowOff: { opacity: 0.55 },
  rowPressed: { opacity: 0.8 },
  reservedLabel: { color: theme.colors.textReserved },
  hint: { position: 'absolute', right: theme.spacing.lg },
  googleMark: { width: 19, alignItems: 'center' },
  // Google's blue, from their brand guidelines — not a theme colour, and not
  // one to substitute.
  googleG: { color: '#4285F4' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, marginVertical: 5 },
  rule: { flex: 1, height: 1, backgroundColor: theme.colors.border },
  pill: {
    position: 'absolute',
    right: theme.spacing.md,
    top: -8,
    backgroundColor: theme.colors.promo,
    borderRadius: theme.radii.pill,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 3,
  },
  pillText: { color: theme.colors.onPromo, fontSize: 9, letterSpacing: 0.5 },
  alert: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    padding: 13,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    borderColor: theme.colors.borderAlert,
    backgroundColor: theme.colors.surfaceAlert,
  },
  alertTitle: { color: theme.colors.textAlert },
  alertBody: { color: theme.colors.textAlertSoft, marginTop: 4 },
});
