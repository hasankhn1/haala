import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatPKR, type PaymentMethod, type PlaceOrderResult } from '@haala/shared';
import {
  BottomSheet,
  Button,
  EmptyState,
  Icon,
  ProductCard,
  type IconName,
  QuantityStepper,
  StateView,
  Text,
  theme,
  Thumb,
  useToast,
} from '@haala/ui';
import { ApiError } from '../../src/api/client';
import { addressesApi, catalogApi, ordersApi, promotionsApi } from '../../src/api/endpoints';
import { runOnlineCheckout } from '../../src/lib/onlineCheckout';
import { qk } from '../../src/api/queryKeys';
import { ETA_MINUTES, FREE_DELIVERY_THRESHOLD, estimateDeliveryFee } from '../../src/config';
import { DeliveryMap } from '../../src/components/DeliveryMap';
import { useAuth } from '../../src/auth/AuthContext';
import { haptics } from '../../src/lib/haptics';
import { useCart, useCartMutations } from '../../src/hooks/useCart';
import { useCurrentStore } from '../../src/store/useCurrentStore';

/**
 * Cart & Checkout — one screen, as the Onyx comp draws it.
 *
 * The design collapses the old two-step cart → checkout flow: items, delivery
 * details, payment method and the bill all live on this page, with a single
 * Place Order action. `/checkout` now redirects here.
 */
export default function CartScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();

  const cart = useCart();
  const { add, update, remove } = useCartMutations();
  const addresses = useQuery({ queryKey: qk.addresses, queryFn: addressesApi.list });

  const { user } = useAuth();
  const [addressId, setAddressId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cod');
  const [sheet, setSheet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promoInput, setPromoInput] = useState('');
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const idempotencyKey = useRef(`co-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  // Default to the user's default address once loaded.
  useEffect(() => {
    if (!addressId && addresses.data && addresses.data.length > 0) {
      setAddressId((addresses.data.find((a) => a.isDefault) ?? addresses.data[0]).id);
    }
  }, [addresses.data, addressId]);

  const data = cart.data;
  const selected = addresses.data?.find((a) => a.id === addressId) ?? null;

  /**
   * "Forgot something?" — the comp's upsell rail. Suggestions come from the
   * categories already represented in the basket, minus what is in it, which
   * is an honest version of the idea without pretending to a recommender.
   */
  const { storeId } = useCurrentStore();
  const suggestions = useQuery({
    queryKey: ['cart-suggestions', storeId, data?.items.length ?? 0],
    queryFn: () => catalogApi.products({ storeId: storeId as string }),
    enabled: !!storeId && !!data && data.items.length > 0,
    staleTime: 5 * 60_000,
  });
  const inBasket = new Set((data?.items ?? []).map((i) => i.productId));
  const usuals = (suggestions.data?.items ?? [])
    .filter((p) => p.inStock && !inBasket.has(p.id))
    .slice(0, 8);
  const subtotal = data?.subtotal ?? 0;
  const isEmpty = !!data && data.items.length === 0;

  /**
   * Re-price the applied promo whenever the subtotal moves. Editing quantities
   * changes what a percentage code is worth, and can drop the cart below a
   * code's minimum spend — a discount frozen at apply-time would then show a
   * number the server won't honour.
   */
  const promo = useQuery({
    queryKey: [...qk.promo(appliedCode ?? ''), subtotal],
    queryFn: () => promotionsApi.validate(appliedCode as string),
    enabled: !!appliedCode && subtotal > 0,
    retry: false,
  });

  // A code that stops qualifying is dropped rather than left showing stale money.
  useEffect(() => {
    if (promo.error) {
      setPromoError(promo.error instanceof ApiError ? promo.error.message : 'Promo code no longer applies');
      setAppliedCode(null);
    }
  }, [promo.error]);

  // What the catalogue would have charged, minus what they actually pay. The
  // comp gives this its own emphasised line and it is the most persuasive
  // number on the screen — but it is only ever display: `subtotal` remains the
  // basis for every calculation, and the server re-prices at placement anyway.
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

  const clearPromo = () => {
    setAppliedCode(null);
    setPromoError(null);
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

      // An online order comes back with a hosted-checkout handoff. The order
      // already exists at this point either way, so whatever happens next we
      // land on the confirmation screen rather than losing the order.
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
      <StateView
        loading={cart.isLoading}
        error={cart.error}
        isEmpty={isEmpty}
        onRetry={() => cart.refetch()}
        empty={
          <EmptyState
            emoji="🛒"
            title="Your cart is empty"
            subtitle="Add some groceries to get started."
            actionLabel="Browse products"
            onAction={() => router.replace('/(tabs)')}
          />
        }
      >
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Items */}
          <View style={styles.titleRow}>
            <Text variant="h2">Your Cart</Text>
            <Text variant="bodySm" color="textSecondary">
              {data?.itemCount ?? 0} {data?.itemCount === 1 ? 'Item' : 'Items'}
            </Text>
          </View>

          <View style={styles.items}>
            {data?.items.map((item) => (
              <View key={item.productId} style={styles.itemCard}>
                <View style={styles.itemThumb}>
                  <Thumb
                    imageUrl={item.imageUrl}
                    name={item.name}
                    size={72}
                    radius={theme.radii.sm}
                  />
                </View>

                <View style={styles.itemBody}>
                  <View style={styles.itemTop}>
                    <Text variant="bodyStrong" numberOfLines={2} style={styles.flex}>
                      {item.name}
                    </Text>
                    <Pressable
                      onPress={() => remove.mutate(item.productId)}
                      hitSlop={10}
                      accessibilityLabel={`Remove ${item.name}`}
                    >
                      <Icon name="close" size={18} color={theme.colors.textTertiary} />
                    </Pressable>
                  </View>

                  <View style={styles.itemBottom}>
                    <Text variant="price">{formatPKR(item.lineTotal)}</Text>
                    <QuantityStepper
                      value={item.quantity}
                      size="sm"
                      onChange={(next) =>
                        next === 0
                          ? remove.mutate(item.productId)
                          : update.mutate({ productId: item.productId, quantity: next })
                      }
                      loading={update.isPending || remove.isPending}
                    />
                  </View>

                  {!item.inStock ? (
                    <Text variant="caption" color="error">
                      Not enough stock
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>

          {/* Delivery details */}
          <Text variant="labelCaps" color="textSecondary" style={styles.eyebrow}>
            Delivery details
          </Text>
          <View style={styles.card}>
            {selected ? (
              <>
                {/* Where it's going, shown rather than described. The address
                    already carries lat/lng, so this is the existing map with
                    gestures off. */}
                <View style={styles.mapStrip}>
                  <DeliveryMap
                    destination={{
                      latitude: selected.latitude,
                      longitude: selected.longitude,
                    }}
                  />
                </View>

                <View style={styles.addrRow}>
                  <View style={styles.addrIcon}>
                    <Icon name="home" size={18} color={theme.colors.primary} />
                  </View>
                  <View style={styles.flex}>
                    <View style={styles.itemTop}>
                      <Text variant="bodyStrong" style={styles.capitalize}>
                        {selected.label}
                      </Text>
                      <Pressable onPress={() => setSheet(true)} hitSlop={8}>
                        <Text variant="labelSm">EDIT</Text>
                      </Pressable>
                    </View>
                    <Text variant="bodySm" color="textSecondary">
                      {selected.line1}
                      {selected.line2 ? `, ${selected.line2}` : ''}
                      {'\n'}
                      {selected.area}, {selected.city}
                    </Text>
                    {user?.phone ? (
                      <Text variant="bodySm" color="textTertiary">
                        {user.phone}
                      </Text>
                    ) : null}
                  </View>
                </View>

                <View style={styles.hairline} />

                <View style={styles.itemTop}>
                  <View style={styles.etaLabel}>
                    <Icon name="time-outline" size={16} color={theme.colors.textSecondary} />
                    <Text variant="body" color="textSecondary">
                      Estimated arrival in
                    </Text>
                  </View>
                  <Text variant="h3">{ETA_MINUTES} mins</Text>
                </View>
              </>
            ) : (
              <Button
                label="Add delivery address"
                variant="secondary"
                onPress={() => router.push('/address/select')}
              />
            )}
          </View>

          {/* Payment method */}
          <Text variant="labelCaps" color="textSecondary" style={styles.eyebrow}>
            Payment method
          </Text>
          <View style={styles.payRow}>
            <PaymentTile
              icon="cash-outline"
              label="Cash on Delivery"
              selected={method === 'cod'}
              onPress={() => setMethod('cod')}
            />
            <PaymentTile
              icon="card-outline"
              label="Credit Card"
              selected={method === 'online'}
              onPress={() => setMethod('online')}
            />
          </View>

          {/* Promo code */}
          <Text variant="labelCaps" color="textSecondary" style={styles.eyebrow}>
            Promo code
          </Text>
          <View style={styles.card}>
            {quote ? (
              <View style={styles.promoApplied}>
                <View style={styles.promoTag}>
                  <Icon name="pricetag" size={16} color={theme.colors.success} />
                  <Text variant="bodyStrong">{quote.code}</Text>
                </View>
                <View style={styles.flex}>
                  <Text variant="bodySm" color="textSecondary" numberOfLines={2}>
                    {quote.message}
                  </Text>
                </View>
                <Pressable onPress={clearPromo} hitSlop={10} accessibilityLabel="Remove promo code">
                  <Icon name="close-circle" size={20} color={theme.colors.textTertiary} />
                </Pressable>
              </View>
            ) : (
              <View style={styles.promoRow}>
                <TextInput
                  style={styles.promoInput}
                  value={promoInput}
                  onChangeText={setPromoInput}
                  placeholder="Enter code"
                  placeholderTextColor={theme.colors.textTertiary}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  onSubmitEditing={applyPromo}
                  returnKeyType="done"
                />
                <Button
                  label="Apply"
                  loading={promo.isFetching}
                  variant="secondary"
                  size="sm"
                  disabled={!promoInput.trim() || promo.isFetching}
                  onPress={applyPromo}
                />
              </View>
            )}
            {promoError ? (
              <Text variant="caption" color="error">
                {promoError}
              </Text>
            ) : null}
          </View>

          {/* Forgot something? */}
          {usuals.length > 0 ? (
            <View style={styles.usuals}>
              <Text variant="h3">Forgot something?</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.usualsRow}
              >
                {usuals.map((u) => (
                  <ProductCard
                    key={u.id}
                    variant="upsell"
                    name={u.name}
                    unit={u.unit}
                    price={u.price}
                    imageUrl={u.imageUrl}
                    onPress={() => router.push(`/product/${u.id}`)}
                    onAdd={() =>
                      add.mutate({ storeId: storeId as string, productId: u.id, quantity: 1 })
                    }
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}

          {/* How close this basket is to free delivery. Same bar as Home, and
              the same shared threshold the server prices against — the point is
              that the customer sees the fee disappear before they commit. */}
          {deliveryFee > 0 ? (
            <View style={styles.freeDelivery}>
              <View style={styles.freeDeliveryTop}>
                <Text variant="labelSm" color="onPrimary" numberOfLines={1} style={styles.flex}>
                  {formatPKR(Math.max(FREE_DELIVERY_THRESHOLD - subtotal, 0))} away from free
                  delivery
                </Text>
                <Icon name="bicycle-outline" size={16} color={theme.colors.onPrimary} />
              </View>
              <View style={styles.freeDeliveryTrack}>
                <View
                  style={[
                    styles.freeDeliveryFill,
                    { width: `${Math.min(subtotal / FREE_DELIVERY_THRESHOLD, 1) * 100}%` },
                  ]}
                />
              </View>
            </View>
          ) : null}

          {/* Special requests. `placeOrderSchema` has accepted `notes` (max
              240) since the orders module was written and `orders.notes`
              exists — the field was simply never exposed. */}
          <View style={[styles.card, styles.summary]}>
            <Text variant="labelCaps" color="textSecondary">
              Any special requests?
            </Text>
            <TextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Riper bananas, no plastic bags…"
              placeholderTextColor={theme.colors.textTertiary}
              maxLength={240}
              multiline
            />
          </View>

          {/* Order summary */}
          <View style={[styles.card, styles.summary]}>
            <Text variant="labelCaps" color="textSecondary">
              Order summary
            </Text>
            <SummaryRow label="Basket total" value={formatPKR(subtotal)} />
            {savings > 0 ? (
              <View style={styles.summaryRow}>
                <View style={styles.savingsLabel}>
                  <Text variant="bodySm" color="textSecondary">
                    Savings
                  </Text>
                  <View style={styles.savingsBadge}>
                    <Text variant="labelSm" style={styles.savingsBadgeText}>
                      {Math.round((savings / (subtotal + savings)) * 100)}% off
                    </Text>
                  </View>
                </View>
                <Text variant="bodyStrong" color="success">
                  − {formatPKR(savings)}
                </Text>
              </View>
            ) : null}
            <SummaryRow
              label="Delivery fee"
              value={deliveryFee === 0 ? 'Free' : formatPKR(deliveryFee)}
            />
            {discount > 0 ? (
              <SummaryRow
                label={`Discount (${quote?.code})`}
                value={`− ${formatPKR(discount)}`}
                positive
              />
            ) : null}
            <View style={styles.hairline} />
            <View style={styles.totalRow}>
              <Text variant="bodyStrong">Total</Text>
              <Text variant="display">{formatPKR(total)}</Text>
            </View>
          </View>

          {error ? (
            <Text variant="bodySm" color="error">
              {error}
            </Text>
          ) : null}
        </ScrollView>
      </StateView>

      {/* Sticky Place Order bar */}
      {!isEmpty && data ? (
        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            disabled={!canPlace}
            onPress={() => {
              setError(null);
              place.mutate();
            }}
            style={({ pressed }) => [
              styles.placeBtn,
              pressed && { backgroundColor: theme.colors.primaryPressed },
              !canPlace && styles.placeBtnDisabled,
            ]}
          >
            <Text variant="title" color="onPrimary">
              {place.isPending ? 'Placing…' : 'Place Order'}
            </Text>
            <View style={styles.placeRight}>
              <Text variant="bodyStrong" color="onPrimary">
                {formatPKR(total)}
              </Text>
              {/* The arrow becomes the spinner, so the bar keeps its width and
                  the biggest action in the app shows that it is working. */}
              {place.isPending ? (
                <ActivityIndicator size="small" color={theme.colors.onPrimary} />
              ) : (
                <Icon name="arrow-forward" size={18} color={theme.colors.onPrimary} />
              )}
            </View>
          </Pressable>
        </View>
      ) : null}

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
              <Text variant="bodySm" color="textSecondary">
                {a.line1}, {a.area}
              </Text>
            </View>
            {a.id === addressId ? (
              <Icon name="checkmark-circle" size={20} color={theme.colors.primary} />
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

function PaymentTile({
  icon,
  label,
  selected,
  onPress,
}: {
  icon: IconName;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.payTile, selected ? styles.payTileOn : styles.payTileOff]}
    >
      {selected ? (
        <View style={styles.payCheck}>
          <Icon name="checkmark-circle" size={16} color={theme.colors.primary} />
        </View>
      ) : null}
      <Icon
        name={icon}
        size={28}
        color={selected ? theme.colors.primary : theme.colors.textSecondary}
      />
      <Text
        variant="bodySm"
        color={selected ? 'textPrimary' : 'textSecondary'}
        align="center"
        numberOfLines={2}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SummaryRow({
  label,
  value,
  positive = false,
}: {
  label: string;
  value: string;
  /** Money coming *off* the bill — the one place green earns its keep. */
  positive?: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text variant="body" color="textSecondary" numberOfLines={1} style={styles.flex}>
        {label}
      </Text>
      <Text variant="body" color={positive ? 'success' : 'textPrimary'}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  capitalize: { textTransform: 'capitalize' },
  content: {
    paddingHorizontal: theme.layout.margin,
    paddingTop: theme.spacing.md,
    paddingBottom: 160,
    gap: theme.spacing.md,
  },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },

  items: { gap: theme.spacing.md },
  itemCard: {
    flexDirection: 'row',
    gap: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
  },
  itemThumb: { backgroundColor: theme.colors.surfaceSunken, borderRadius: theme.radii.sm },
  itemBody: { flex: 1, justifyContent: 'space-between', gap: theme.spacing.sm },
  itemTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  itemBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  eyebrow: { marginTop: theme.spacing.lg },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  addrRow: { flexDirection: 'row', gap: theme.spacing.md },
  mapStrip: {
    height: 104,
    borderRadius: theme.radii.md,
    overflow: 'hidden',
    marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.surfaceSunken,
  },
  addrIcon: {
    width: 40,
    height: 40,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hairline: { height: 1, backgroundColor: theme.colors.border },
  etaLabel: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },

  payRow: { flexDirection: 'row', gap: theme.spacing.md },
  payTile: {
    flex: 1,
    borderRadius: theme.radii.sm,
    paddingVertical: theme.spacing.xl,
    paddingHorizontal: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    borderWidth: 2,
  },
  payTileOn: { backgroundColor: theme.colors.accentSoft, borderColor: theme.colors.primary },
  payTileOff: {
    backgroundColor: theme.colors.surface,
    borderColor: 'transparent',
    ...theme.elevation.card,
  },
  payCheck: { position: 'absolute', top: theme.spacing.sm, right: theme.spacing.sm },

  promoRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  promoInput: {
    flex: 1,
    height: theme.controlHeight.sm,
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.fontSize.body,
    color: theme.colors.textPrimary,
    padding: 0,
  },
  promoApplied: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  promoTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
  },

  summary: { marginTop: theme.spacing.lg },
  usuals: { marginTop: theme.spacing.lg, gap: theme.spacing.md },
  usualsRow: { gap: theme.spacing.md, paddingRight: theme.layout.margin },
  savingsLabel: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  savingsBadge: {
    backgroundColor: theme.colors.promo,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  savingsBadgeText: { color: theme.colors.onPromo },
  notesInput: {
    minHeight: 64,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.md,
    textAlignVertical: 'top',
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: 14,
  },
  freeDelivery: {
    marginTop: theme.spacing.lg,
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  freeDeliveryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  freeDeliveryTrack: {
    height: 6,
    borderRadius: theme.radii.pill,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  freeDeliveryFill: {
    height: '100%',
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.promo,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: theme.layout.margin,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    ...theme.elevation.raised,
  },
  /** Full-width bar with the label left and the amount right, per the comp. */
  placeBtn: {
    height: 56,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.xl,
  },
  placeBtnDisabled: { opacity: 0.4 },
  placeRight: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },

  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.md,
  },
});
