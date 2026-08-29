import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatPKR } from '@haala/shared';
import {
  Button,
  EmptyState,
  Icon,
  ProductCard,
  QuantityStepper,
  StateView,
  Text,
  theme,
  Thumb,
} from '@haala/ui';
import { catalogApi } from '../../src/api/endpoints';
import { ETA_MINUTES, estimateDeliveryFee } from '../../src/config';
import { useCart, useCartMutations } from '../../src/hooks/useCart';
import { useCheckoutDraft } from '../../src/store/useCheckoutDraft';
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

  const cart = useCart();
  const { add, update, remove } = useCartMutations();
  /** Written here, submitted from checkout. */
  const { notes, setNotes } = useCheckoutDraft();

  const data = cart.data;

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
   * What the catalogue would have charged, minus what they actually pay.
   * Display only — `subtotal` is the basis for every calculation and the server
   * re-prices at placement regardless.
   */
  const savings = (data?.items ?? []).reduce(
    (sum, i) => sum + Math.max(i.basePrice - i.unitPrice, 0) * i.quantity,
    0,
  );

  // The basket previews the fee; vouchers and the final bill live on checkout.
  const deliveryFee = estimateDeliveryFee(subtotal);
  const total = subtotal + deliveryFee;


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
            <View>
              <Text variant="h2">Your basket</Text>
              <Text variant="bodySm" color="textSecondary">
                {data?.itemCount ?? 0} {data?.itemCount === 1 ? 'item' : 'items'} ·{' '}
                {ETA_MINUTES} min
              </Text>
            </View>
            <Pressable style={styles.addMore} onPress={() => router.push('/products')}>
              <Text variant="label" style={styles.addMoreText}>
                + Add items
              </Text>
            </Pressable>
          </View>

          <View style={styles.items}>
            {data?.items.map((item) => (
              <View key={item.productId} style={styles.itemCard}>
                <View style={styles.itemThumb}>
                  <Thumb imageUrl={item.imageUrl} name={item.name} fill radius={theme.radii.sm} />
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
            <View style={styles.hairline} />
            <View style={styles.totalRow}>
              <Text variant="title">Total</Text>
              <Text variant="h2">{formatPKR(total)}</Text>
            </View>
          </View>
        </ScrollView>
      </StateView>

      {/* Sticky checkout bar */}
      {!isEmpty && data ? (
        <View style={styles.footer}>
          <Button
            label={`Checkout · ${formatPKR(total)}`}
            style={styles.cta}
            onPress={() => router.push('/checkout')}
            trailingIcon={<Icon name="arrow-forward" size={17} color={theme.colors.onPrimary} />}
          />
        </View>
      ) : null}

    </SafeAreaView>
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

  items: {},
  // The comp separates lines with a rule rather than boxing each one.
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  itemThumb: {
    width: 66,
    height: 66,
    backgroundColor: theme.colors.surfaceSunken,
    borderRadius: theme.radii.sm,
    overflow: 'hidden',
  },
  addMore: {
    borderWidth: 1.4,
    borderColor: theme.colors.primary,
    borderRadius: theme.radii.pill,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 8,
  },
  addMoreText: { color: theme.colors.primaryPressed },
  itemBody: { flex: 1, justifyContent: 'space-between', gap: theme.spacing.sm },
  itemTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  itemBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  hairline: { height: 1, backgroundColor: theme.colors.border },


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
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },

  cta: { borderRadius: theme.radii.pill, height: 52 },
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

});
