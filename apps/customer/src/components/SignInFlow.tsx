import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomSheet, Button, Icon, Input, Text, theme } from '@haala/ui';
import { ApiError } from '../api/client';
import { track } from '../lib/analytics';
import { useAuth } from '../auth/AuthContext';
import { useCart, useMergeGuestCart } from '../hooks/useCart';
import { ProviderButtons } from './ProviderButtons';
import { ProviderHandoff } from './ProviderHandoff';

/**
 * The sign-in flow, from `Auth & Checkout.dc.html`.
 *
 * A landing offering every way in, then the email route as two steps: the
 * address, then the password. There is deliberately **no sign-up screen** — an
 * address we have never seen becomes an account when the password is submitted,
 * which is the design's central idea and the reason nothing else is asked for.
 * No name, no phone: checkout collects a delivery number when it needs one.
 *
 * In Phase 5 this same set of steps becomes a modal over checkout, which is why
 * the provider rows live in `ProviderButtons` rather than inline here.
 *
 * **Why the password label does not change before you type it.** The design
 * shows a "we already know this email" badge at step two, which needs the
 * server to answer "does this address have an account" before a password is
 * given — an enumeration oracle, and the brief forbids adding one. So the badge
 * is rendered from the *response* on the confirmation step instead, and the
 * password step stays neutral about which it is.
 *
 * **Phone sign-in is no longer offered here**, per the comp, which has no such
 * row — the Mobile slot is reserved for OTP. `POST /auth/login` still accepts
 * phone + password and the rider and ops apps still use it, so this is the
 * removal of an affordance rather than of a capability.
 *
 * It has a consequence worth stating: the existing customers who signed up by
 * phone have no `users.email`, so entering one here would **create a second
 * account** rather than reach theirs. They need an address attached through ops,
 * or phone OTP, before they can sign in to this app again.
 *
 * **On type sizes.** The comp sets the landing title at 28px and the email
 * title at 24px, and the scale has no step between `h1` (20) and `display`
 * (30) — these comps are drawn in a 428pt frame, wider than most phones, so its
 * pixels run a little large against real dp. Rather than introduce two one-off
 * sizes, this uses `display` and `h1`, which keeps the step-down between the
 * two screens that the comp is actually expressing.
 */
type Step = 'landing' | 'email' | 'password' | 'created';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** The server's only password rule, and the client must not invent others. */
const MIN_PASSWORD = 8;

export function SignInFlow({
  onSignedIn,
  onDismiss,
  headline,
}: {
  /** Called once signed in **and** the guest basket has been handed over. */
  onSignedIn: (created: boolean) => void;
  /** The back button at the first step. */
  onDismiss: () => void;
  /** Overrides the landing title, so checkout can say why it is asking. */
  headline?: { title: string; sub: string };
}) {
  const { emailAuth } = useAuth();
  const mergeGuestCart = useMergeGuestCart();
  const cart = useCart();
  const basketCount = cart.data?.itemCount ?? 0;
  const passwordRef = useRef<TextInput>(null);

  const [step, setStep] = useState<Step>('landing');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  /**
   * Set while a provider round trip is in flight, which swaps this whole screen
   * for the hand-off. `useCallback` because `ProviderButtons` reports through an
   * effect — an unstable setter there would loop.
   */
  const [handoff, setHandoff] = useState<{
    provider: 'google' | 'apple';
    cancel: () => void;
  } | null>(null);

  const emailValid = EMAIL_RE.test(email.trim());

  // Once per mount, and named for where it was opened from — the funnel reads
  // very differently for somebody interrupted at checkout.
  useEffect(() => {
    track({ name: 'auth_screen_viewed', from: headline ? 'checkout' : 'account' });
  }, [headline]);

  const goPassword = () => {
    if (!emailValid) {
      setError('That doesn’t look like an email address.');
      return;
    }
    setError(null);
    setStep('password');
    // The field is not mounted until this render lands.
    requestAnimationFrame(() => passwordRef.current?.focus());
  };

  const submitEmail = async () => {
    setError(null);
    setLoading(true);
    track({ name: 'email_sign_in_started' });
    try {
      const created = await emailAuth({ email: email.trim().toLowerCase(), password });
      track({ name: 'email_sign_in_success', created });
      await handOverBasket();
      // A new account is confirmed rather than slipped past — a mistyped
      // address would otherwise silently become a second account.
      if (created) setStep('created');
      else onSignedIn(false);
    } catch (e) {
      track({
        name: 'email_sign_in_failed',
        reason: e instanceof ApiError ? (e.status === 401 ? 'password' : 'validation') : 'network',
      });
      setError(e instanceof ApiError ? e.message : 'Could not sign in');
    } finally {
      setLoading(false);
    }
  };


  /**
   * Hand the device basket to the account that just signed in.
   *
   * A failure here must not block the sign-in that already succeeded — the
   * basket stays on the device (it is only cleared once the server confirms),
   * so the worst case is that it merges on the next attempt rather than being
   * lost. Throwing would strand somebody who is, in fact, signed in.
   */
  const handOverBasket = async () => {
    try {
      await mergeGuestCart();
    } catch {
      // Deliberately swallowed; see above.
    }
  };

  const back = () => {
    setError(null);
    if (step === 'password') {
      setPassword('');
      setReveal(false);
      setStep('email');
    } else if (step === 'email') {
      setPassword('');
      setStep('landing');
    } else {
      onDismiss();
    }
  };

  const onLanding = step === 'landing';

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <SafeAreaView style={styles.flex} edges={['top', 'left', 'right']}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {onLanding ? (
              <View style={styles.brand}>
                <Text variant="h1" color="textInverse" style={styles.brandMark}>
                  H
                </Text>
              </View>
            ) : (
              <Pressable style={styles.back} onPress={back} accessibilityLabel="Back">
                <Icon name="arrow-back" size={17} color={theme.colors.textPrimary} strokeWidth={2.3} />
              </Pressable>
            )}

            <Text variant={onLanding ? 'display' : 'h1'} style={styles.title}>
              {titleFor(step, headline)}
            </Text>
            <Text variant="body" color="textSecondary" style={styles.sub}>
              {subFor(step, headline, email)}
            </Text>

            {/* The reassurance the design leads with — and the real line count,
                not the comp's hard-coded four. */}
            {onLanding && basketCount > 0 ? (
              <View style={styles.keepCard}>
                <Icon name="bag-handle-outline" size={17} color={theme.colors.info} />
                <Text variant="bodySm" style={styles.keepText}>
                  Your basket of {basketCount} {basketCount === 1 ? 'item' : 'items'} is saved —
                  you’ll come straight back to checkout.
                </Text>
              </View>
            ) : null}

            {/* Errors this screen raises itself. Provider failures render their
                own card inside `ProviderButtons`, in the same treatment. */}
            {error ? (
              <View style={styles.alert} accessibilityLiveRegion="polite" accessibilityRole="alert">
                <Icon name="alert-circle-outline" size={17} color={theme.colors.textAlert} />
                <Text variant="bodySm" style={styles.alertBody}>
                  {error}
                </Text>
              </View>
            ) : null}

            {step === 'landing' ? (
              <>
                <View style={styles.providers}>
                  <ProviderButtons
                    onSignedIn={async (created) => {
                      await handOverBasket();
                      if (created) setStep('created');
                      else onSignedIn(false);
                    }}
                    onEmail={() => setStep('email')}
                    onHandoff={setHandoff}
                  />
                </View>
                <View style={styles.spacer} />
                <Pressable onPress={onDismiss} style={styles.textLink}>
                  <Text variant="label" style={styles.textLinkLabel}>
                    Continue as guest
                  </Text>
                </Pressable>
                <Text variant="caption" color="textTertiary" align="center" style={styles.legal}>
                  By continuing you agree to our Terms and Privacy Policy. We never post anything.
                </Text>
              </>
            ) : null}

            {step === 'email' ? (
              <>
                <View style={styles.fields}>
                  <Input
                    label="EMAIL"
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@example.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    textContentType="emailAddress"
                    returnKeyType="next"
                    onSubmitEditing={goPassword}
                  />
                </View>
                <View style={styles.spacer} />
                <Button label="Continue" onPress={goPassword} disabled={!emailValid} size="lg" />
                <Text variant="bodySm" color="textTertiary" align="center" style={styles.footnote}>
                  We never send marketing without asking first.
                </Text>
              </>
            ) : null}

            {step === 'password' ? (
              <>
                <View style={styles.fields}>
                  {/* The address, locked, so it is clear which account this
                      password belongs to. */}
                  <View>
                    <Text variant="labelSm" color="textSecondary">
                      EMAIL
                    </Text>
                    <View style={styles.locked}>
                      <Text variant="body" numberOfLines={1}>
                        {email.trim()}
                      </Text>
                    </View>
                  </View>

                  <View>
                    <View style={styles.fieldHead}>
                      <Text variant="labelSm" color="textSecondary">
                        PASSWORD
                      </Text>
                      <Pressable onPress={() => setForgotOpen(true)} hitSlop={8}>
                        <Text variant="labelSm" color="primaryPressed">
                          Forgot?
                        </Text>
                      </Pressable>
                    </View>
                    {/* The eye is positioned against this wrapper, which holds
                        the field and nothing else — anchoring it to the outer
                        column would drop it below the strength meter. */}
                    <View style={styles.passwordWrap}>
                      <Input
                        ref={passwordRef}
                        value={password}
                        onChangeText={setPassword}
                        placeholder="At least 8 characters"
                        secureTextEntry={!reveal}
                        autoCapitalize="none"
                        autoComplete="password"
                        textContentType="password"
                        returnKeyType="go"
                        onSubmitEditing={submitEmail}
                        style={styles.passwordInput}
                      />
                      <Pressable
                        onPress={() => setReveal((r) => !r)}
                        style={styles.reveal}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={reveal ? 'Hide password' : 'Show password'}
                      >
                        <Icon
                          name={reveal ? 'eye-off-outline' : 'eye-outline'}
                          size={18}
                          color={theme.colors.textTertiary}
                          strokeWidth={1.9}
                        />
                      </Pressable>
                    </View>

                    <StrengthMeter length={password.length} />
                  </View>
                </View>

                {/* True whether this signs in or creates — which is the point;
                    the screen does not have to know which yet. */}
                <View style={styles.reassure}>
                  <Icon name="shield-checkmark-outline" size={17} color={theme.colors.info} />
                  <Text variant="bodySm" style={styles.reassureText}>
                    That’s everything we need. No phone number, no profile forms — we’ll ask for
                    delivery details when they matter.
                  </Text>
                </View>

                <View style={styles.spacer} />
                <Button
                  label="Continue"
                  onPress={submitEmail}
                  loading={loading}
                  disabled={password.length < MIN_PASSWORD}
                  size="lg"
                />
                <Text variant="bodySm" color="textTertiary" align="center" style={styles.footnote}>
                  If you already shop with us this signs you in. If not, it creates your account.
                </Text>
              </>
            ) : null}

            {step === 'created' ? (
              <>
                <View style={styles.tickWrap}>
                  <View style={styles.tick}>
                    <Icon name="checkmark" size={32} color={theme.colors.confirmed} strokeWidth={2.6} />
                  </View>
                  {/* Rendered from the response, never from a pre-check. */}
                  <View style={styles.newPill}>
                    <Text variant="caption" style={styles.newPillText}>
                      NEW ACCOUNT
                    </Text>
                  </View>
                </View>
                <View style={styles.spacer} />
                <Button label="Continue" onPress={() => onSignedIn(true)} size="lg" />
              </>
            ) : null}

          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>

      {/*
        There is no password-reset flow, and the comp draws a "Forgot?" link. A
        visible affordance that silently does nothing is worse than one that
        explains itself, so it says what to do instead of dead-ending.
      */}
      <BottomSheet
        visible={forgotOpen}
        onClose={() => setForgotOpen(false)}
        title="Resetting a password"
        accessibilityLabel="Resetting a password"
      >
        <View style={styles.forgot}>
          <Text variant="bodySm" color="textSecondary">
            We haven’t built self-service resets yet. Message us on WhatsApp and we’ll get you back
            in — usually within a few minutes during shop hours.
          </Text>
          <Button label="Got it" onPress={() => setForgotOpen(false)} variant="secondary" />
        </View>
      </BottomSheet>

      {/*
        The hand-off covers the screen but does **not** replace it, and the
        difference matters. Returning it from here early unmounted
        `ProviderButtons`, which is where the provider's own state lives — so
        every outcome was destroyed on the way back and the landing reappeared
        blank. A cancelled sign-in silently lost its "Sign-in cancelled" notice,
        and a *failed* one lost its reason, which is worse.

        Kept mounted underneath, the notices survive and appear as soon as the
        cover goes.
      */}
      {handoff ? (
        <View style={styles.handoff}>
          <ProviderHandoff
            provider={handoff.provider}
            onCancel={() => {
              handoff.cancel();
              setHandoff(null);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

/**
 * Password length as three bars.
 *
 * **Presentational only.** The server's rule is an 8-character minimum and
 * nothing else, so this must not gate the button or imply extra requirements —
 * the copy underneath says so outright. It exists because a bare password field
 * gives no feedback that anything is being registered at all.
 */
function StrengthMeter({ length }: { length: number }) {
  const filled = length >= 12 ? 3 : length >= MIN_PASSWORD ? 2 : length >= 4 ? 1 : 0;
  return (
    <View accessible accessibilityLabel={`Password length: ${length} characters`}>
      <View style={styles.bars}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.bar, i < filled && styles.barOn]} />
        ))}
      </View>
      <Text variant="bodySm" color="textSecondary" style={styles.barsNote}>
        {MIN_PASSWORD} characters minimum. That’s the only rule.
      </Text>
    </View>
  );
}

function titleFor(step: Step, headline?: { title: string; sub: string }): string {
  if (step === 'landing') return headline?.title ?? 'Welcome back';
  if (step === 'email') return 'What’s your email?';
  if (step === 'password') return 'And a password';
  return 'You’re all set';
}

function subFor(step: Step, headline: { title: string; sub: string } | undefined, email: string): string {
  if (step === 'landing')
    return (
      headline?.sub ??
      'Sign in to make checkout faster and keep track of your orders. It takes one tap.'
    );
  if (step === 'email')
    return 'We’ll check if you already shop with us — no separate sign-up needed.';
  if (step === 'password') return `Signing in restores your basket and saved addresses.`;
  return `Your account is set up under ${email.trim()}. Nothing else to fill in.`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 22, paddingTop: theme.spacing.lg, paddingBottom: 20 },
  brand: {
    width: 54,
    height: 54,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    // The comp's `0 8px 20px rgba(255,90,31,.28)` — an ember-tinted lift, not
    // the neutral one in `elevation`.
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.28,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  brandMark: { fontSize: 26, lineHeight: 30 },
  back: {
    width: 38,
    height: 38,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { marginTop: theme.spacing.xl },
  sub: { marginTop: 10, maxWidth: 300 },
  keepCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 20,
    padding: 13,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    borderColor: theme.colors.borderWarm,
    backgroundColor: theme.colors.infoSoft,
  },
  keepText: { flex: 1, color: theme.colors.textPrimary },
  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: 20,
    padding: 13,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    borderColor: theme.colors.borderAlert,
    backgroundColor: theme.colors.surfaceAlert,
  },
  alertBody: { flex: 1, color: theme.colors.textAlertSoft },
  providers: { marginTop: theme.spacing.xl },
  fields: { marginTop: theme.spacing.xl, gap: theme.spacing.md },
  fieldHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  locked: {
    marginTop: 9,
    height: theme.controlHeight.lg,
    borderRadius: theme.radii.sm,
    borderWidth: 1.6,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSunken,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  passwordWrap: { marginTop: 9 },
  passwordInput: { paddingRight: 44 },
  reveal: {
    position: 'absolute',
    right: theme.spacing.md,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  bars: { flexDirection: 'row', gap: 6, marginTop: 11 },
  bar: { flex: 1, height: 4, borderRadius: theme.radii.pill, backgroundColor: theme.colors.border },
  barOn: { backgroundColor: theme.colors.primary },
  barsNote: { marginTop: theme.spacing.sm },
  reassure: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
    padding: 13,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.infoSoft,
  },
  reassureText: { flex: 1, color: theme.colors.textPrimary },
  spacer: { flex: 1, minHeight: 18 },
  textLink: { alignItems: 'center', paddingVertical: 14 },
  textLinkLabel: { color: theme.colors.textPrimary, fontSize: 13 },
  legal: { maxWidth: 290, alignSelf: 'center' },
  footnote: { marginTop: 14 },
  tickWrap: { alignItems: 'center', marginTop: theme.spacing['2xl'], gap: theme.spacing.md },
  tick: {
    width: 66,
    height: 66,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.confirmedSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newPill: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.pill,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
  },
  newPillText: { color: theme.colors.textSecondary, fontSize: 9.5, letterSpacing: 0.5 },
  forgot: { gap: theme.spacing.lg },
  handoff: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.colors.background },
});
