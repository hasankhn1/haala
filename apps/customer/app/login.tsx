import { useState } from 'react';
import { Link, useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Icon, Input, Text, theme } from '@haala/ui';
import { ApiError } from '../src/api/client';
import { useAuth } from '../src/auth/AuthContext';
import { PhoneField, toE164 } from '../src/components/PhoneField';

/**
 * Sign in.
 *
 * The Basket comps have no auth screens, so this borrows the system's own
 * language: the ember hero with the 26px sweep from Home, and a white sheet
 * carrying the form. The previous version put a white card on what had become a
 * white canvas after the re-theme, so the card was invisible and the screen read
 * as unstyled.
 *
 * Authentication is **phone + password** — there is no OTP issuer. When one
 * lands, only the second field changes.
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
            <Pressable
              style={styles.back}
              onPress={() => router.back()}
              accessibilityLabel="Back"
            >
              <Icon name="arrow-back" size={16} color={theme.colors.onPrimary} />
            </Pressable>
            <Text variant="h1" color="onPrimary" style={styles.heroTitle}>
              Welcome back
            </Text>
            <Text variant="bodySm" style={styles.heroSub}>
              Sign in to pick up where you left off.
            </Text>
          </SafeAreaView>

          <View style={styles.sheet}>
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
              label="Sign in"
              style={styles.cta}
              onPress={onSubmit}
              loading={loading}
              disabled={national.length < 10 || password.length === 0}
            />

            <View style={styles.footer}>
              <Text variant="bodySm" color="textSecondary">
                New to Haala?
              </Text>
              <Link href="/register">
                <Text variant="label" style={styles.link}>
                  Create an account
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

  /** White sheet sweeping up over the ember, same 26px curve as Home's hero. */
  sheet: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radii.xl,
    borderTopRightRadius: theme.radii.xl,
    padding: theme.spacing.xl,
    paddingTop: theme.spacing['2xl'],
    gap: theme.spacing.lg,
  },
  cta: { borderRadius: theme.radii.pill, height: 52, marginTop: theme.spacing.xs },
  link: { color: theme.colors.primaryPressed },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.sm,
  },
});
