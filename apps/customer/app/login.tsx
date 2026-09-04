import { useRef, useState } from 'react';
import { useRouter } from 'expo-router';
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
import { Button, Icon, Input, Text, theme } from '@haala/ui';
import { ApiError } from '../src/api/client';
import { useAuth } from '../src/auth/AuthContext';
import { PhoneField, toE164 } from '../src/components/PhoneField';
import { ProviderButtons } from '../src/components/ProviderButtons';

/**
 * Sign in, from `Auth & Checkout.dc.html`.
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
 * given — an enumeration oracle, and the brief forbids adding one. So the label
 * stays neutral and the *server* decides on submit; a created account is then
 * confirmed on screen rather than happening silently.
 *
 * Phone sign-in still works and is reachable from the bottom of the screen. It
 * is not offered first because everything new is email-first, but 22 of the 23
 * existing customers have no email address and must not be locked out.
 */
type Step = 'landing' | 'email' | 'password' | 'created' | 'phone';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function LoginScreen() {
  const { emailAuth, login } = useAuth();
  const router = useRouter();
  const passwordRef = useRef<TextInput>(null);

  const [step, setStep] = useState<Step>('landing');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [national, setNational] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const emailValid = EMAIL_RE.test(email.trim());

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
    try {
      const created = await emailAuth({ email: email.trim().toLowerCase(), password });
      // A new account is confirmed rather than slipped past — a mistyped
      // address would otherwise silently become a second account.
      if (created) setStep('created');
      else router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not sign in');
    } finally {
      setLoading(false);
    }
  };

  const submitPhone = async () => {
    setError(null);
    setLoading(true);
    try {
      await login({ phone: toE164(national), password });
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not sign in');
    } finally {
      setLoading(false);
    }
  };

  const back = () => {
    setError(null);
    if (step === 'password') {
      setPassword('');
      setStep('email');
    } else if (step === 'email' || step === 'phone') {
      setPassword('');
      setStep('landing');
    } else {
      router.back();
    }
  };

  const title =
    step === 'landing'
      ? 'Welcome back'
      : step === 'email'
      ? 'What’s your email?'
      : step === 'password'
        ? 'And a password'
        : step === 'created'
          ? 'You’re all set'
          : 'Sign in with your number';

  const sub =
    step === 'landing'
      ? 'Pick any way in — if you’re new we’ll set the account up as you go.'
      : step === 'email'
      ? 'No separate sign-up — if you’re new we’ll set the account up as you go.'
      : step === 'password'
        ? email.trim()
        : step === 'created'
          ? 'That’s everything we need. No phone number, no profile forms — we’ll ask for delivery details when they matter.'
          : 'For accounts made before we added email sign-in.';

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <SafeAreaView style={styles.hero} edges={['top', 'left', 'right']}>
            <Pressable style={styles.back} onPress={back} accessibilityLabel="Back">
              <Icon name="arrow-back" size={20} color={theme.colors.onPrimary} />
            </Pressable>
            <Text variant="display" color="onPrimary" style={styles.title}>
              {title}
            </Text>
            <Text variant="bodySm" style={styles.sub}>
              {sub}
            </Text>
          </SafeAreaView>

          <View style={styles.sheet}>
            {error ? (
              <View style={styles.error} accessibilityLiveRegion="polite">
                <Icon name="alert-circle-outline" size={18} color={theme.colors.error} />
                <Text variant="bodySm" style={styles.errorText}>
                  {error}
                </Text>
              </View>
            ) : null}

            {step === 'landing' ? (
              <>
                <ProviderButtons
                  onSignedIn={(created) =>
                    created ? setStep('created') : router.replace('/(tabs)')
                  }
                  onEmail={() => setStep('email')}
                />
                <Text variant="caption" color="textTertiary" align="center">
                  By continuing you agree to our Terms and Privacy Policy. We never post anything.
                </Text>
                <Pressable onPress={() => setStep('phone')} style={styles.altLink}>
                  <Text variant="label" color="primary">
                    Sign in with a phone number instead
                  </Text>
                </Pressable>
              </>
            ) : null}

            {step === 'email' ? (
              <>
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
                <Button label="Continue" onPress={goPassword} disabled={!emailValid} />
                <Text variant="caption" color="textTertiary" align="center">
                  We never send marketing without asking first.
                </Text>
              </>
            ) : null}

            {step === 'password' ? (
              <>
                <Input
                  ref={passwordRef}
                  label="PASSWORD"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="At least 8 characters"
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="password"
                  textContentType="password"
                  returnKeyType="go"
                  onSubmitEditing={submitEmail}
                />
                <Button
                  label="Continue"
                  onPress={submitEmail}
                  loading={loading}
                  disabled={password.length < 8}
                />
                <Text variant="caption" color="textTertiary" align="center">
                  If you already shop with us this signs you in. If not, it creates your account.
                </Text>
              </>
            ) : null}

            {step === 'created' ? (
              <>
                <View style={styles.tick}>
                  <Icon name="checkmark" size={26} color={theme.colors.onPrimary} />
                </View>
                <Button label="Start shopping" onPress={() => router.replace('/(tabs)')} />
              </>
            ) : null}

            {step === 'phone' ? (
              <>
                <PhoneField value={national} onChangeText={setNational} />
                <Input
                  label="PASSWORD"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="password"
                  returnKeyType="go"
                  onSubmitEditing={submitPhone}
                />
                <Button
                  label="Sign in"
                  onPress={submitPhone}
                  loading={loading}
                  disabled={national.length < 10 || password.length < 1}
                />
                <Pressable onPress={() => setStep('landing')} style={styles.altLink}>
                  <Text variant="label" color="primary">
                    Use another way to sign in
                  </Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.primary },
  flex: { flex: 1 },
  content: { flexGrow: 1 },
  hero: {
    paddingHorizontal: theme.layout.margin,
    paddingBottom: theme.spacing['2xl'],
    gap: theme.spacing.sm,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: theme.radii.pill,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: theme.spacing.md,
  },
  title: { lineHeight: 34 },
  sub: { color: 'rgba(255,255,255,0.86)' },
  sheet: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: theme.layout.margin,
    gap: theme.spacing.lg,
  },
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.errorSoft,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.md,
  },
  errorText: { flex: 1, color: theme.colors.error },
  altLink: { alignItems: 'center', paddingVertical: theme.spacing.sm },
  tick: {
    width: 56,
    height: 56,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
});
