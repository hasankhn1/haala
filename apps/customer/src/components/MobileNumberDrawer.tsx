import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { BottomSheet, Button, Icon, Text, theme } from '@haala/ui';
import { ApiError } from '../api/client';
import { authApi } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { track } from '../lib/analytics';

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
 *
 * **The `+92` box is a label, not a picker.** The comp draws it with a chevron,
 * implying a country list. `phoneSchema` accepts `+92` and nothing else, so
 * every other entry in that list would fail on save — a picker whose options
 * are all invalid is worse than no picker. It is rendered as the comp draws it,
 * minus the chevron, and is not a control.
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
  /** The comp's confirmation state, shown after a successful save. */
  const [saved, setSaved] = useState<string | null>(null);

  // Prefill when editing an existing number, so "Edit" reopens the same sheet
  // with the same value rather than an empty box.
  useEffect(() => {
    if (!visible) return;
    const existing = user?.deliveryPhone ?? '';
    setNational(existing.startsWith('+92') ? existing.slice(3) : '');
    setTouched(false);
    setError(null);
    setSaved(null);
    // Focus after the sheet has actually appeared; the design's a11y note asks
    // for focus on the field with the reason line read before it.
    track({ name: 'mobile_collection_viewed' });
    const t = setTimeout(() => field.current?.focus(), 250);
    return () => clearTimeout(t);
  }, [visible, user?.deliveryPhone]);

  const reason = reasonFor(national);
  const valid = national.length === NATIONAL_DIGITS && reason === null;
  const showReason = touched && reason !== null;

  const save = async () => {
    if (!valid) {
      // The number itself is never in an event — only that it did not pass.
      track({ name: 'mobile_collection_failed', reason: 'invalid' });
      setTouched(true);
      return;
    }
    track({ name: 'mobile_collection_started' });
    setSaving(true);
    setError(null);
    try {
      const updated = await authApi.updateProfile({ deliveryPhone: toE164(national) });
      // The canonical customer record, not the order — so the next order does
      // not ask again.
      setUser(updated);
      track({ name: 'mobile_collection_success' });
      setSaved(updated.deliveryPhone ?? toE164(national));
    } catch (e) {
      track({
        name: 'mobile_collection_failed',
        reason: e instanceof ApiError ? 'server' : 'network',
      });
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

  /** Three states, so the field says what it thinks of what is in it. */
  const fieldBorder = showReason || error
    ? theme.colors.error
    : valid
      ? theme.colors.confirmed
      : theme.colors.primary;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      accessibilityLabel="Delivery contact number"
    >
      {saved ? (
        <View style={styles.savedWrap}>
          <View style={styles.savedTick}>
            <Icon name="checkmark" size={32} color={theme.colors.confirmed} strokeWidth={2.6} />
          </View>
          <Text variant="h2" style={styles.savedTitle}>
            Number saved
          </Text>
          <Text variant="body" color="textSecondary" align="center" style={styles.savedBody}>
            {saved} is on your account. We’ll only use it for delivery updates.
          </Text>
          <Button
            label="Back to checkout"
            onPress={() => onSaved(saved)}
            size="lg"
            style={styles.savedCta}
          />
        </View>
      ) : (
        <View style={styles.wrap}>
          <View style={styles.head}>
            <View style={styles.icon}>
              <Icon name="cube-outline" size={21} color={theme.colors.primary} strokeWidth={1.9} />
            </View>
            <View style={styles.flex}>
              <Text variant="h2">One last thing</Text>
              <Text variant="body" color="textSecondary" style={styles.headSub}>
                We need a mobile number so the rider can reach you about this delivery. Nothing else
                — no verification code.
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              style={styles.close}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Icon name="close" size={14} color={theme.colors.textSecondary} strokeWidth={2.4} />
            </Pressable>
          </View>

          <View style={styles.phoneRow}>
            {/* Rendered as the comp draws it, but not a control — see above. */}
            <View style={styles.prefix} accessibilityLabel="Country code +92 for Pakistan">
              <Text variant="h3">🇵🇰 +92</Text>
            </View>
            <View style={[styles.field, { borderColor: fieldBorder }]}>
              <TextInput
                ref={field}
                value={national}
                onChangeText={(t) => setNational(t.replace(/\D/g, '').slice(0, 11))}
                onBlur={() => setTouched(true)}
                placeholder="3001234567"
                placeholderTextColor={theme.colors.textDisabled}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                autoComplete="tel"
                returnKeyType="done"
                onSubmitEditing={save}
                style={styles.input}
                accessibilityLabel={`Mobile number, ${NATIONAL_DIGITS} digits after +92`}
              />
              {valid ? (
                <Icon name="checkmark" size={18} color={theme.colors.confirmed} strokeWidth={2.6} />
              ) : null}
            </View>
          </View>

          {showReason ? (
            <View style={styles.reason} accessibilityLiveRegion="polite" accessibilityRole="alert">
              <Icon name="alert-circle-outline" size={14} color={theme.colors.error} strokeWidth={2.2} />
              <Text variant="bodySm" style={styles.reasonText}>
                {reason}
              </Text>
            </View>
          ) : (
            <Text variant="bodySm" color="textTertiary">
              Pakistan mobile · {NATIONAL_DIGITS} digits after +92
            </Text>
          )}

          {error ? (
            <View style={styles.reason} accessibilityLiveRegion="polite" accessibilityRole="alert">
              <Icon name="alert-circle-outline" size={14} color={theme.colors.error} strokeWidth={2.2} />
              <Text variant="bodySm" style={styles.reasonText}>
                {error}
              </Text>
            </View>
          ) : null}

          <Button
            label={saving ? 'Saving…' : national.length === 0 ? 'Continue' : 'Save and continue'}
            onPress={save}
            loading={saving}
            size="lg"
            // Deliberately enabled while invalid: the design asks for retry in
            // one tap, and pressing it surfaces the specific reason rather than
            // leaving somebody wondering why a button does nothing. Only the
            // *colour* goes quiet while there is nothing to save, per the comp.
            disabled={saving}
            variant={national.length === 0 ? 'secondary' : 'primary'}
          />

          <Pressable onPress={onClose} style={styles.notNow} hitSlop={8}>
            <Text variant="label" color="textSecondary" align="center">
              Not now
            </Text>
          </Pressable>

          {required ? (
            <Text variant="bodySm" color="textTertiary" align="center">
              Required for delivery orders. Saved to your account — you won’t be asked again.
            </Text>
          ) : null}
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing.md },
  flex: { flex: 1 },
  head: { flexDirection: 'row', gap: theme.spacing.md, alignItems: 'flex-start' },
  headSub: { marginTop: 7 },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: theme.colors.emberTile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  close: {
    width: 32,
    height: 32,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phoneRow: { flexDirection: 'row', alignItems: 'stretch', gap: 9, marginTop: theme.spacing.sm },
  prefix: {
    width: 96,
    borderRadius: theme.radii.sm,
    borderWidth: 1.6,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    height: 56,
    borderRadius: theme.radii.sm,
    borderWidth: 1.8,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.lg,
  },
  input: {
    flex: 1,
    ...theme.typography.textStyles.h2,
    color: theme.colors.textPrimary,
    letterSpacing: 0.3,
    // Android draws its own underline and vertical padding inside TextInput.
    paddingVertical: 0,
  },
  reason: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  reasonText: { flex: 1, color: theme.colors.error },
  notNow: { paddingTop: theme.spacing.md, paddingBottom: theme.spacing.xs },
  savedWrap: { alignItems: 'center', paddingTop: theme.spacing.xl, paddingBottom: theme.spacing.lg },
  savedTick: {
    width: 66,
    height: 66,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.confirmedSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedTitle: { marginTop: 18 },
  savedBody: { marginTop: theme.spacing.sm, maxWidth: 250 },
  savedCta: { marginTop: theme.spacing.xl, alignSelf: 'stretch' },
});
