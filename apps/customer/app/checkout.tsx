import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatPKR, type PaymentMethod, type PlaceOrderResult } from '@haala/shared';
import {
  BottomSheet,
  Button,
  Icon,
  type IconName,
  StateView,
  Text,
  theme,
  useToast,
} from '@haala/ui';
import { ApiError } from '../src/api/client';
import { addressesApi, ordersApi, promotionsApi } from '../src/api/endpoints';
import { qk } from '../src/api/queryKeys';
import { DeliveryMap } from '../src/components/DeliveryMap';
import { ETA_MINUTES, estimateDeliveryFee } from '../src/config';
import { useAuth } from '../src/auth/AuthContext';
import { useCart } from '../src/hooks/useCart';
import { haptics } from '../src/lib/haptics';
import { runOnlineCheckout } from '../src/lib/onlineCheckout';
import { useCheckoutDraft } from '../src/store/useCheckoutDraft';
import { useCurrentStore } from '../src/store/useCurrentStore';

/**
 * Checkout — where the order is actually placed.
 *
 * The comps make this a screen of its own reached from the basket, and this app
 * previously merged the two because the *Onyx* design did. Splitting them back
 * apart means the basket answers "what am I buying" and this screen answers
 * "where, how, and how much" — which is also why every money decision, the
 * promo re-price and the order mutation live here rather than in the tab.
 */
export default function CheckoutScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const { store } = useCurrentStore();
  const cart = useCart();
  const { notes, reset: resetDraft } = useCheckoutDraft();

  const addresses = useQuery({ queryKey: qk.addresses, queryFn: addressesApi.list });
  const [addressId, setAddressId] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('cod');
  const [sheet, setSheet] = useState(false);
  const [promoInput, setPromoInput] = useState('');
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef(`co-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    if (!addressId && addresses.data && addresses.data.length > 0) {
      setAddressId((addresses.data.find((a) => a.isDefault) ?? addresses.data[0]).id);
    }
  }, [addresses.data, addressId]);

  const data = cart.data;
  const selected = addresses.data?.find((a) => a.id === addressId) ?? null;
  const subtotal = data?.subtotal ?? 0;

  /**
   * Re-price the applied promo whenever the subtotal moves — a discount frozen
   * at apply-time would show a number the server won't honour.
   */
  const promo = useQuery({
    queryKey: [...qk.promo(appliedCode ?? ''), subtotal],
    queryFn: () => promotionsApi.validate(appliedCode as string),
    enabled: !!appliedCode && subtotal > 0,
    retry: false,
  });

  useEffect(() => {
    if (promo.error) {
      setPromoError(
        promo.error instanceof ApiError ? promo.error.message : 'Promo code no longer applies',
      );
      setAppliedCode(null);
    }
  }, [promo.error]);

  const savings = (data?.items ?? []).reduce(
    (sum, i) => sum + Math.max(i.basePrice - i.unitPrice, 0) * i.quantity,
    0,
  );

  const quote = appliedCode && promo.data ? promo.data : null;
  const deliveryFee = quote ? quote.deliveryFee : estimateDeliveryFee(subtotal);
  const discount = quote?.discount ?? 0;
  const total = subtotal + deliveryFee - discount;

  const applyPromo = () => {
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    setPromoError(null);
    setAppliedCode(code);
    setPromoInput('');
  };

  const place = useMutation({
    mutationFn: () =>
      ordersApi.place(
        {
          addressId: addressId as string,
          paymentMethod: method,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          ...(quote ? { promoCode: quote.code } : {}),
        },
        idempotencyKey.current,
      ),
    onSuccess: async (res: PlaceOrderResult) => {
      qc.invalidateQueries({ queryKey: qk.cart });
      qc.invalidateQueries({ queryKey: qk.orders });
      resetDraft();

      // The order exists by now either way, so whatever the payment handoff
      // does we land on the confirmation rather than losing the order.
      const outcome = await runOnlineCheckout(res);
      if (outcome.kind === 'resolved' && outcome.status === 'failed') {
        haptics.error();
        toast.show('Payment was not completed. You can retry from your orders.', 'error');
      } else {
        haptics.success();
      }

      qc.invalidateQueries({ queryKey: qk.order(res.order.id) });
      router.replace(
        `/order/confirmed?id=${res.order.id}&number=${encodeURIComponent(res.order.orderNumber)}`,
      );
    },
    onError: (e) => {
      haptics.error();
      const message = e instanceof ApiError ? e.message : 'Could not place order';
      setError(message);
      toast.show(message, 'error');
    },
  });

  const canPlace = !!addressId && !!data && data.itemCount > 0 && !place.isPending;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable style={styles.backCircle} onPress={() => router.back()} accessibilityLabel="Back">
          <Icon name="arrow-back" size={16} color={theme.colors.textPrimary} />
        </Pressable>
        <View>
          <Text variant="h2">Checkout</Text>
          {store ? (
            <Text variant="bodySm" color="textSecondary">
              {store.name} · {store.area}
            </Text>
          ) : null}
        </View>
      </View>

      <StateView loading={cart.isLoading} error={cart.error} onRetry={() => cart.refetch()}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Address, with the delivery point shown rather than described. */}
          <View style={styles.outlined}>
            {selected ? (
              <>
                <View style={styles.map}>
                  <DeliveryMap
                    destination={{
                      latitude: selected.latitude,
                      longitude: selected.longitude,
                    }}
                  />
                </View>
                <View style={styles.addrBody}>
                  <Icon name="location" size={16} color={theme.colors.primary} />
                  <View style={styles.flex}>
                    <Text variant="bodyStrong" style={styles.capitalize}>
                      {selected.label} · {selected.area}
                    </Text>
                    <Text variant="bodySm" color="textSecondary">
                      {selected.line1}
                      {selected.line2 ? `, ${selected.line2}` : ''}
                      {user?.phone ? `\n${user.phone}` : ''}
                    </Text>
                  </View>
                  <Pressable onPress={() => setSheet(true)} hitSlop={8}>
                    <Text variant="label" style={styles.link}>
                      Change
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <View style={styles.addrBody}>
                <Button
                  label="Add delivery address"
                  variant="secondary"
                  onPress={() => router.push('/address/select')}
                />
              </View>
            )}
          </View>

          {/* Delivery speed. One tier exists, so it states the promise rather
              than offering a choice the backend cannot honour. */}
          <View style={[styles.outlined, styles.speedRow]}>
            <View style={styles.speedIcon}>
              <Icon name="flash-outline" size={16} color={theme.colors.primary} />
            </View>
            <View style={styles.flex}>
              <Text variant="bodyStrong">Express delivery</Text>
              <Text variant="bodySm" color="textSecondary">
                Arrives within {ETA_MINUTES} mins
              </Text>
            </View>
            <View style={styles.fastestBadge}>
              <Text variant="labelSm" style={styles.onPromo}>
                Fastest
              </Text>
            </View>
          </View>

          <Text variant="h3" style={styles.sectionHead}>
            Pay with
          </Text>
          <View style={styles.outlined}>
            <PayRow
              icon="cash-outline"
              name="Cash on delivery"
              sub="Pay the rider when it arrives"
              selected={method === 'cod'}
              onPress={() => setMethod('cod')}
            />
            <PayRow
              icon="card-outline"
              name="Card / wallet"
              sub="Secure hosted checkout"
              selected={method === 'online'}
              onPress={() => setMethod('online')}
              last
            />
            <View style={styles.pciStrip}>
              <Icon name="checkmark-circle-outline" size={14} color={theme.colors.accent} />
              <Text variant="caption" color="textSecondary" style={styles.flex}>
                Card details are never stored on your device
              </Text>
            </View>
          </View>

          {/* Voucher */}
          {quote ? (
            <View style={[styles.voucher, styles.voucherApplied]}>
              <Icon name="pricetag" size={15} color={theme.colors.success} />
              <Text variant="bodySm" style={styles.flex}>
                {quote.code} applied
              </Text>
              <Pressable onPress={() => setAppliedCode(null)} hitSlop={8}>
                <Icon name="close-circle" size={18} color={theme.colors.textTertiary} />
              </Pressable>
            </View>
          ) : (
            <View style={styles.voucher}>
              <Icon name="pricetag-outline" size={15} color={theme.colors.textTertiary} />
              <TextInput
                style={styles.voucherInput}
                value={promoInput}
                onChangeText={setPromoInput}
                placeholder="Enter voucher code"
                placeholderTextColor={theme.colors.textTertiary}
                autoCapitalize="characters"
                autoCorrect={false}
                onSubmitEditing={applyPromo}
                returnKeyType="done"
              />
              <Pressable onPress={applyPromo} hitSlop={8} disabled={!promoInput.trim()}>
                <Text variant="label" style={styles.link}>
                  Apply
                </Text>
              </Pressable>
            </View>
          )}
          {promoError ? (
            <Text variant="bodySm" color="error">
              {promoError}
            </Text>
          ) : null}

          {/* Bill */}
          <View style={styles.bill}>
            <Row label="Subtotal" value={formatPKR(subtotal)} />
            {savings > 0 ? <Row label="Savings" value={`− ${formatPKR(savings)}`} positive /> : null}
            <Row
              label="Delivery fee"
              value={deliveryFee === 0 ? 'Free' : formatPKR(deliveryFee)}
            />
            {discount > 0 ? (
              <Row label={`Discount (${quote?.code})`} value={`− ${formatPKR(discount)}`} positive />
            ) : null}
            <View style={styles.billRule} />
            <View style={styles.totalRow}>
              <Text variant="h3">Total</Text>
              <Text variant="h2">{formatPKR(total)}</Text>
            </View>
          </View>

          {error ? (
            <Text variant="bodySm" color="error">
              {error}
            </Text>
          ) : null}
        </ScrollView>
      </StateView>

      <View style={styles.footer}>
        <Button
          label={place.isPending ? 'Placing…' : `Place order · ${formatPKR(total)}`}
          loading={place.isPending}
          disabled={!canPlace}
          style={styles.cta}
          onPress={() => {
            setError(null);
            place.mutate();
          }}
        />
      </View>

      <BottomSheet visible={sheet} onClose={() => setSheet(false)} title="Choose address">
        {addresses.data?.map((a) => (
          <Pressable
            key={a.id}
            style={styles.sheetRow}
            onPress={() => {
              setAddressId(a.id);
              setSheet(false);
            }}
          >
            <View style={styles.flex}>
              <Text variant="bodyStrong" style={styles.capitalize}>
                {a.label}
              </Text>
              <Text variant="bodySm" color="textSecondary" numberOfLines={1}>
                {a.line1}, {a.area}
              </Text>
            </View>
            {a.id === addressId ? (
              <Icon name="checkmark-circle" size={18} color={theme.colors.primary} />
            ) : null}
          </Pressable>
        ))}
        <Button
          label="Add new address"
          variant="secondary"
          onPress={() => {
            setSheet(false);
            router.push('/address/select');
          }}
        />
      </BottomSheet>
    </SafeAreaView>
  );
}

function PayRow({
  icon,
  name,
  sub,
  selected,
  onPress,
  last = false,
}: {
  icon: IconName;
  name: string;
  sub: string;
  selected: boolean;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.payRow, !last && styles.payRowRule]}
    >
      <View style={styles.payIcon}>
        <Icon name={icon} size={15} color={theme.colors.textSecondary} />
      </View>
      <View style={styles.flex}>
        <Text variant="bodySm" numberOfLines={1}>
          {name}
        </Text>
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <View style={[styles.radio, selected && styles.radioOn]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
    </Pressable>
  );
}

function Row({
  label,
  value,
  positive = false,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <View style={styles.billRow}>
      <Text variant="body" color="textSecondary" numberOfLines={1} style={styles.flex}>
        {label}
      </Text>
      <Text variant="bodyStrong" color={positive ? 'success' : 'textPrimary'}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  capitalize: { textTransform: 'capitalize' },
  link: { color: theme.colors.primaryPressed },
  onPromo: { color: theme.colors.onPromo },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.layout.margin,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backCircle: {
    width: 34,
    height: 34,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: theme.layout.margin,
    paddingBottom: 120,
    gap: theme.spacing.md,
  },

  outlined: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.xl,
    overflow: 'hidden',
  },
  map: { height: 130, backgroundColor: theme.colors.surfaceSunken },
  addrBody: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
  },

  speedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
  },
  speedIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fastestBadge: {
    backgroundColor: theme.colors.promo,
    borderRadius: theme.radii.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 5,
  },

  sectionHead: { marginTop: theme.spacing.sm },
  payRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
  },
  payRowRule: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  payIcon: {
    width: 38,
    height: 26,
    borderRadius: 6,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: theme.radii.pill,
    borderWidth: 2,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: theme.colors.primary },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.primary,
  },
  pciStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.surfaceSunken,
  },

  voucher: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.borderStrong,
    borderRadius: theme.radii.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  voucherApplied: {
    borderStyle: 'solid',
    borderColor: theme.colors.success,
    backgroundColor: theme.colors.successSoft,
  },
  voucherInput: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.fontFamily.semibold,
    fontSize: theme.typography.fontSize.body,
  },

  bill: {
    backgroundColor: theme.colors.infoSoft,
    borderRadius: theme.radii.xl,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  billRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  billRule: { height: 1, backgroundColor: theme.colors.border },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },

  footer: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.layout.margin,
    paddingVertical: theme.spacing.md,
  },
  cta: { borderRadius: theme.radii.pill, height: 52 },

  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
});
