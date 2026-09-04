import { useEffect, useRef, useState } from 'react';
import { StyleSheet, type TextInput, View } from 'react-native';
import { BottomSheet, Button, Icon, Input, Text, theme } from '@haala/ui';
import { ApiError } from '../api/client';
import { authApi } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';

/**
 * "One last thing" — the delivery contact, from `Auth & Checkout.dc.html`.
 *
 * Opened by checkout, and **only** when `user.deliveryPhone` is missing. A
 * customer who signed up by phone already has one; migration 0010 backfilled
 * it for all 31 existing accounts precisely so this never asks them again. The
 * design is explicit: do not request information we already hold.
 *
 * The copy says what the number is for and what it is not for — "no
 * verification code" — because being asked for a phone number mid-checkout
 * otherwise reads as the start of an OTP dance nobody agreed to.
 *
 * Localised from the comps, which are written for the UAE (`+971`, "9 digits").
 * Haala is Pakistan: `+92` and ten digits, validated against the same
 * `phoneSchema` the server uses, so the two cannot disagree about what a valid
 * number is.
 */
const NATIONAL_DIGITS = 10;

/** `+92` then ten digits, matching `phoneSchema`. */
const toE164 = (national: string) => `+92${national}`;

/**
 * Split so the reason is specific. "Invalid input" tells somebody nothing about
 * what to change, and the design's edge-case note asks for the actual reason.
 */
function reasonFor(national: string): string | null {
  if (national.length === 0) return null;
  if (national.length < NATIONAL_DIGITS) {
    return `That is ${national.length} digit${national.length === 1 ? '' : 's'} — a Pakistan mobile has ${NATIONAL_DIGITS} after +92.`;
  }
  if (national.length > NATIONAL_DIGITS) {
    return `That is ${national.length} digits — a Pakistan mobile has ${NATIONAL_DIGITS} after +92.`;
  }
  if (!national.startsWith('3')) {
    return 'Pakistan mobile numbers start with 3 — check the first digit.';
  }
  return null;
}

export function MobileNumberDrawer({
  visible,
  onClose,
  onSaved,
  required = true,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: (deliveryPhone: string) => void;
  /**
   * True for a delivery order, which is every order Haala takes today.
   *
   * The sheet stays dismissible either way. Trapping somebody behind a form is
   * worse than letting them out to a checkout whose pay button explains what is
   * missing — which is what the design's "sheet dismissed" case describes.
   * `required` drives the wording and the note, not an escape hatch.
   */
  required?: boolean;
}) {
  const { user, setUser } = useAuth();
  const field = useRef<TextInput>(null);
  const [national, setNational] = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill when editing an existing number, so "Edit" reopens the same sheet
  // with the same value rather than an empty box.
  useEffect(() => {
    if (!visible) return;
    const existing = user?.deliveryPhone ?? '';
    setNational(existing.startsWith('+92') ? existing.slice(3) : '');
    setTouched(false);
    setError(null);
    // Focus after the sheet has actually appeared; the design's a11y note asks
    // for focus on the field with the reason line read before it.
    const t = setTimeout(() => field.current?.focus(), 250);
    return () => clearTimeout(t);
  }, [visible, user?.deliveryPhone]);

  const reason = reasonFor(national);
  const valid = national.length === NATIONAL_DIGITS && reason === null;

  const save = async () => {
    if (!valid) {
      setTouched(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await authApi.updateProfile({ deliveryPhone: toE164(national) });
      // The canonical customer record, not the order — so the next order does
      // not ask again.
      setUser(updated);
      onSaved(updated.deliveryPhone ?? toE164(national));
    } catch (e) {
      // The sheet stays open and the number stays typed. Losing what somebody
      // just entered because a request failed is the least forgivable outcome
      // here.
      setError(
        e instanceof ApiError ? e.message : 'Could not save that number. Check your connection.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      accessibilityLabel="Delivery contact number"
    >
      <View style={styles.wrap}>
        <View style={styles.head}>
          <View style={styles.icon}>
            <Icon name="call-outline" size={20} color={theme.colors.primary} />
          </View>
          <View style={styles.flex}>
            <Text variant="h3">One last thing</Text>
            <Text variant="bodySm" color="textSecondary">
              We need a mobile number so the rider can reach you about this delivery. Nothing else —
              no verification code.
            </Text>
          </View>
        </View>

        <Input
          ref={field}
          label={`MOBILE NUMBER  ·  ${NATIONAL_DIGITS} DIGITS AFTER +92`}
          value={national}
          onChangeText={(t) => setNational(t.replace(/\D/g, '').slice(0, 11))}
          onBlur={() => setTouched(true)}
          placeholder="3001234567"
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          returnKeyType="done"
          onSubmitEditing={save}
          error={touched && reason ? reason : undefined}
        />

        {error ? (
          <View style={styles.error} accessibilityLiveRegion="polite">
            <Icon name="alert-circle-outline" size={18} color={theme.colors.error} />
            <Text variant="bodySm" style={styles.errorText}>
              {error}
            </Text>
          </View>
        ) : null}

        <Button
          label={saving ? 'Saving…' : 'Save and continue'}
          onPress={save}
          loading={saving}
          // Deliberately enabled while invalid: the design asks for retry in one
          // tap, and pressing it surfaces the specific reason rather than
          // leaving somebody wondering why a button does nothing.
          disabled={saving}
        />

        <Text variant="caption" color="textTertiary" align="center">
          {required
            ? 'Required for delivery orders. Saved to your account — you won’t be asked again.'
            : 'Saved to your account — you won’t be asked again.'}
        </Text>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing.lg },
  flex: { flex: 1 },
  head: { flexDirection: 'row', gap: theme.spacing.md, alignItems: 'flex-start' },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
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
});
