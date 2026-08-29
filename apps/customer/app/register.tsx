import { useState } from 'react';
import { Link, useRouter } from 'expo-router';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Button, Icon, Input, Text, theme } from '@haala/ui';
import { ApiError } from '../src/api/client';
import { useAuth } from '../src/auth/AuthContext';
import { PhoneField, isCompletePhone, toE164 } from '../src/components/PhoneField';

/**
 * Create account — Onyx & Ink. Mirrors the Stitch sign-up: stacked fields on a
 * white panel, a terms checkbox gating the CTA, and the solid-Onyx action.
 * Email is optional on the API, so it stays optional here.
 */
export default function RegisterScreen() {
  const { register } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [national, setNational] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canSubmit =
    name.trim().length >= 2 && isCompletePhone(national) && password.length >= 8 && agreed;

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      // No `role` here by design — sign-up always creates a customer, and the
      // schema is strict, so sending one is a 422.
      await register({
        name: name.trim(),
        phone: toE164(national),
        password,
        // The contract takes `email?`, so omit it rather than sending "".
        ...(email.trim() ? { email: email.trim() } : {}),
      });
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create account');
    } finally {
      setLoading(false);
    }
  };

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
            <Pressable style={styles.back} onPress={() => router.back()} accessibilityLabel="Back">
              <Icon name="arrow-back" size={16} color={theme.colors.onPrimary} />
            </Pressable>
            <Text variant="h1" color="onPrimary" style={styles.heroTitle}>
              Create your account
            </Text>
            <Text variant="bodySm" style={styles.heroSub}>
              Your first delivery is on us.
            </Text>
          </SafeAreaView>

          <View style={styles.sheet}>
            <Input
              label="Full name"
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              autoCapitalize="words"
              textContentType="name"
            />
            <PhoneField value={national} onChangeText={setNational} />
            <Input
              label="Email address (optional)"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              textContentType="emailAddress"
            />
            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="At least 8 characters"
              textContentType="newPassword"
            />

            <Pressable
              style={styles.terms}
              onPress={() => setAgreed((v) => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: agreed }}
            >
              <View style={[styles.checkbox, agreed && styles.checkboxOn]}>
                {agreed ? (
                  <Icon name="checkmark" size={14} color={theme.colors.onPrimary} />
                ) : null}
              </View>
              <Text variant="bodySm" color="textSecondary" style={styles.flex}>
                I agree to the Terms & Conditions
              </Text>
            </Pressable>

            {error ? (
              <Text variant="bodySm" color="error">
                {error}
              </Text>
            ) : null}

            <Button
              label="Create Account"
              onPress={onSubmit}
              loading={loading}
              disabled={!canSubmit}
              style={styles.cta}
            />

            <View style={styles.footer}>
              <Text variant="bodySm" color="textSecondary">
                Already have an account?
              </Text>
              <Link href="/login">
                <Text variant="label" style={styles.link}>
                  Sign in
                </Text>
              </Link>
            </View>
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
    gap: theme.spacing.xs,
  },
  back: {
    width: 34,
    height: 34,
    borderRadius: theme.radii.pill,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.xl,
    marginTop: theme.spacing.md,
  },
  heroTitle: { marginTop: theme.spacing.sm },
  heroSub: { color: 'rgba(255,255,255,0.86)' },
  link: { color: theme.colors.primaryPressed },
  cta: { borderRadius: theme.radii.pill, height: 52, marginTop: theme.spacing.xs },
  /** Same white sheet and 26px sweep as sign-in, so the pair reads as one flow. */
  sheet: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radii.xl,
    borderTopRightRadius: theme.radii.xl,
    padding: theme.spacing.xl,
    paddingTop: theme.spacing['2xl'],
    gap: theme.spacing.lg,
  },
  terms: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: theme.radii.xs,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
});
