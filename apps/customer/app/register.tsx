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
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brand}>
            <Text variant="h1" align="center">
              Haala
            </Text>
            <Text variant="body" color="textSecondary" align="center">
              Create your account
            </Text>
          </View>

          <View style={styles.card}>
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
            />
          </View>

          <View style={styles.footer}>
            <Text variant="bodySm" color="textSecondary">
              Already have an account?
            </Text>
            <Link href="/login">
              <Text variant="label">Sign In</Text>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: theme.layout.margin,
    gap: theme.spacing.xl,
  },
  brand: { gap: theme.spacing.sm },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.xl,
    gap: theme.spacing.lg,
    ...theme.elevation.card,
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
