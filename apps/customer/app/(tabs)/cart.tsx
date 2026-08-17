import { useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatPKR, type PaymentMethod, type PlaceOrderResult } from '@haala/shared';
import {
  BottomSheet,
  Button,
  EmptyState,
  QuantityStepper,
  StateView,
  Text,
  Thumb,
  theme,
  useToast,
} from '@haala/ui';
import { ApiError } from '../../src/api/client';
import { addressesApi, ordersApi } from '../../src/api/endpoints';
import { qk } from '../../src/api/queryKeys';
import { ETA_MINUTES, estimateDeliveryFee } from '../../src/config';
import { haptics } from '../../src/lib/haptics';
import { useCart, useCartMutations } from '../../src/hooks/useCart';

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
  const { update, remove } = useCartMutations();
  const addresses = useQuery({ queryKey: qk.addresses, queryFn: addressesApi.list });

  const [addressId, setAddressId] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('cod');
  const [sheet, setSheet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef(`co-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  // Default to the user's default address once loaded.
  useEffect(() => {
    if (!addressId && addresses.data && addresses.data.length > 0) {
      setAddressId((addresses.data.find((a) => a.isDefault) ?? addresses.data[0]).id);
    }
  }, [addresses.data, addressId]);

  const data = cart.data;
  const selected = addresses.data?.find((a) => a.id === addressId) ?? null;
  const subtotal = data?.subtotal ?? 0;
  const deliveryFee = estimateDeliveryFee(subtotal);
  const total = subtotal + deliveryFee;
  const isEmpty = !!data && data.items.length === 0;

  const place = useMutation({
    mutationFn: () =>
      ordersApi.place(
        { addressId: addressId as string, paymentMethod: method },
        idempotencyKey.current,
      ),
    onSuccess: (res: PlaceOrderResult) => {
      haptics.success();
      qc.invalidateQueries({ queryKey: qk.cart });
      qc.invalidateQueries({ queryKey: qk.orders });
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
                      <Ionicons name="close" size={18} color={theme.colors.textTertiary} />
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
                <View style={styles.addrRow}>
                  <View style={styles.addrIcon}>
                    <Ionicons name="home" size={18} color={theme.colors.primary} />
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
                  </View>
                </View>

                <View style={styles.hairline} />

                <View style={styles.itemTop}>
                  <View style={styles.etaLabel}>
                    <Ionicons name="time-outline" size={16} color={theme.colors.textSecondary} />
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

          {/* Order summary */}
          <View style={[styles.card, styles.summary]}>
            <Text variant="labelCaps" color="textSecondary">
              Order summary
            </Text>
            <SummaryRow label="Subtotal" value={formatPKR(subtotal)} />
            <SummaryRow
              label="Delivery Fee"
              value={deliveryFee === 0 ? 'Free' : formatPKR(deliveryFee)}
            />
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
              <Ionicons name="arrow-forward" size={18} color={theme.colors.onPrimary} />
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
              <Ionicons name="checkmark-circle" size={20} color={theme.colors.primary} />
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
  icon: keyof typeof Ionicons.glyphMap;
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
          <Ionicons name="checkmark-circle" size={16} color={theme.colors.primary} />
        </View>
      ) : null}
      <Ionicons
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

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text variant="body" color="textSecondary">
        {label}
      </Text>
      <Text variant="body">{value}</Text>
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
    borderRadius: theme.radii.sm,
    padding: theme.spacing.lg,
    ...theme.elevation.card,
  },
  itemThumb: { backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radii.sm },
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
    borderRadius: theme.radii.sm,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    ...theme.elevation.card,
  },
  addrRow: { flexDirection: 'row', gap: theme.spacing.md },
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

  summary: { marginTop: theme.spacing.lg },
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
