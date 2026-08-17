import { useState } from 'react';
import { Link, useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Input, Text, theme } from '@haala/ui';
import { ApiError } from '../src/api/client';
import { useAuth } from '../src/auth/AuthContext';
import { PhoneField, toE164 } from '../src/components/PhoneField';

/**
 * Sign in — Onyx & Ink.
 *
 * The Stitch design signs in with a phone number and a one-time code. Our API
 * authenticates on **phone + password** (there is no OTP issuer yet), so the
 * layout, the `+92` phone field and the solid-Onyx CTA are kept exactly, and
 * the code step is replaced by a password. When an OTP endpoint lands, only the
 * second field changes.
 */
export default function LoginScreen() {
  const { login } = useAuth();
  const router = useRouter();
  const [national, setNational] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
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
              Groceries at your door in minutes.
            </Text>
          </View>

          <View style={styles.card}>
            <Text variant="h2">Sign In</Text>

            <PhoneField value={national} onChangeText={setNational} />

            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Your password"
              textContentType="password"
            />

            {error ? (
              <Text variant="bodySm" color="error">
                {error}
              </Text>
            ) : null}

            <Button
              label="Sign In  →"
              onPress={onSubmit}
              loading={loading}
              disabled={national.length < 10 || password.length === 0}
            />
          </View>

          <View style={styles.footer}>
            <Text variant="bodySm" color="textSecondary">
              New to Haala?
            </Text>
            <Link href="/register">
              <Text variant="label">Create Account</Text>
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
  brand: { gap: theme.spacing.sm, marginBottom: theme.spacing.sm },
  /** Gallery-white panel lifted off the canvas by the ambient ink shadow. */
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.xl,
    gap: theme.spacing.lg,
    ...theme.elevation.card,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
});
