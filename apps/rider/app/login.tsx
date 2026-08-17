import { useState } from 'react';
import { useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Input, Text, theme } from '@haala/ui';
import { ApiError } from '../src/api/client';
import { useAuth } from '../src/auth/AuthContext';

const COUNTRY_CODE = '+92';
const NATIONAL_LENGTH = 10;

/**
 * Rider sign-in. Accounts are provisioned by ops, so there's no sign-up path —
 * just phone + password, the same credentials the customer API uses.
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
      await login({ phone: `${COUNTRY_CODE}${national}`, password });
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
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <Text variant="h1" align="center">
              Haala Rider
            </Text>
            <Text variant="body" color="textSecondary" align="center">
              Sign in to start your shift.
            </Text>
          </View>

          <View style={styles.card}>
            <View style={styles.field}>
              <Text variant="labelSm" color="textSecondary">
                Phone number
              </Text>
              <View style={styles.phoneRow}>
                <View style={styles.affix}>
                  <Text variant="bodyStrong">{COUNTRY_CODE}</Text>
                </View>
                {/* Input's own root View isn't flexed, so the flex lives here. */}
                <View style={styles.flex}>
                  <Input
                    value={national}
                    onChangeText={(t) =>
                      setNational(t.replace(/\D/g, '').slice(0, NATIONAL_LENGTH))
                    }
                    keyboardType="number-pad"
                    placeholder="300 1234567"
                    maxLength={NATIONAL_LENGTH}
                  />
                </View>
              </View>
            </View>

            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Your password"
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
              disabled={national.length < NATIONAL_LENGTH || password.length === 0}
            />
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
  field: { gap: theme.spacing.sm },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  affix: {
    height: theme.controlHeight.lg,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
  },
});
