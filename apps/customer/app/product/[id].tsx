import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FlatList, Image, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatPKR, type ProductView } from '@haala/shared';
import {
  Button,
  Icon,
  IconButton,
  type IconName,
  ProductCard,
  QuantityStepper,
  remoteImageSource,
  Skeleton,
  StateView,
  Text,
  theme,
} from '@haala/ui';
import { catalogApi } from '../../src/api/endpoints';
import { qk } from '../../src/api/queryKeys';
import { ETA_MINUTES } from '../../src/config';
import { useProductActions } from '../../src/hooks/useProductActions';
import { useCurrentStore } from '../../src/store/useCurrentStore';

export default function ProductDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { storeId } = useCurrentStore();

  const product = useQuery({
    queryKey: qk.product(id, storeId ?? 'none'),
    queryFn: () => catalogApi.product(id, storeId as string),
    enabled: !!storeId && !!id,
  });

  const { cart, qtyByProduct, busy, busyVariantId, addProduct, addVariant, setQty } =
    useProductActions(storeId);

  /**
   * The size being bought. Defaults to the first variant — they arrive ordered
   * by `sortOrder`, so that is the product's default. Stock, price and the
   * basket line all hang off this, not off the product.
   */
  const [variantId, setVariantId] = useState<string | null>(null);

  /**
   * The comp calls this rail "Frequently bought together", which implies a
   * recommender we do not have. Other products from the same category is the
   * honest version of the same idea and uses the catalogue we already load.
   */
  const related = useQuery({
    queryKey: qk.products(storeId ?? 'none', product.data?.categoryId ?? 'none'),
    queryFn: () =>
      catalogApi.products({
        storeId: storeId as string,
        categoryId: product.data?.categoryId as string,
      }),
    enabled: !!storeId && !!product.data?.categoryId,
  });
  const relatedItems = (related.data?.items ?? []).filter((r) => r.id !== id).slice(0, 8);
  const p = product.data;
  const variants = p?.variants ?? [];
  const selected = variants.find((v) => v.id === variantId) ?? variants[0] ?? null;
  const qty = selected ? (qtyByProduct.get(selected.id) ?? 0) : 0;

  const cartCount = cart.data?.itemCount ?? 0;

  /** Quantity chosen on this screen before the item exists in the cart. */
  const [pending, setPending] = useState(1);

  // Falls back to the icon panel if the hero photo can't be fetched.
  const [heroFailed, setHeroFailed] = useState(false);
  useEffect(() => setHeroFailed(false), [p?.imageUrl]);

  const share = () => {
    if (!p) return;
    Share.share({ message: `${p.name} (${p.unit}) — ${formatPKR(p.price)} on Haala` }).catch(
      () => undefined,
    );
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Full-bleed product image with the header floating over it.
            The hero uses `cover` to fill the box, matching the comp's
            full-bleed square. `contain` letterboxes here: react-native-web
            renders Image as a centred CSS background, so a landscape photo in
            a fixed-height box leaves empty bands above and below it. */}
        <View style={styles.hero}>
          {p?.imageUrl && !heroFailed ? (
            <Image
              source={remoteImageSource(p.imageUrl)}
              style={styles.heroImage}
              resizeMode="cover"
              onError={() => setHeroFailed(true)}
            />
          ) : (
            <View style={[styles.heroImage, styles.heroFallback]}>
              <Icon name="basket-outline" size={64} color={theme.colors.textTertiary} />
            </View>
          )}

          {p ? (
            <View style={styles.badges}>
              <View style={styles.badgePrimary}>
                <Text variant="labelSm" color="onPrimary">
                  {p.inStock ? 'IN STOCK' : 'OUT OF STOCK'}
                </Text>
              </View>
              <View style={styles.badgeSurface}>
                <Text variant="labelSm" color="textSecondary">
                  {ETA_MINUTES} MIN DELIVERY
                </Text>
              </View>
            </View>
          ) : null}
        </View>

        {/* Info sheet, overlapping the image with a large top radius */}
        <View style={styles.sheet}>
          <StateView
            loading={product.isLoading}
            error={product.error}
            onRetry={() => product.refetch()}
            loadingFallback={<DetailSkeleton />}
          >
            {p ? <ProductBody product={p} /> : null}
          </StateView>

          {/* Pick a size — only when there is a choice to make. */}
          {variants.length > 1 ? (
            <View style={styles.sizes}>
              <Text variant="h3">Pick a size</Text>
              <View style={styles.sizeRow}>
                {variants.map((v) => {
                  const on = selected?.id === v.id;
                  const perUnit = v.label !== v.unit ? v.unit : null;
                  return (
                    <Pressable
                      key={v.id}
                      onPress={() => setVariantId(v.id)}
                      style={[styles.sizeCard, on && styles.sizeCardOn]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                    >
                      <Text variant="bodyStrong">{v.label}</Text>
                      {perUnit ? (
                        <Text variant="caption" color="textSecondary">
                          {perUnit}
                        </Text>
                      ) : null}
                      <View style={styles.sizePrice}>
                        <Text variant="bodyStrong">{formatPKR(v.price)}</Text>
                        {v.basePrice > v.price ? (
                          <Text variant="caption" color="textTertiary" style={styles.strike}>
                            {formatPKR(v.basePrice)}
                          </Text>
                        ) : null}
                      </View>
                      {!v.inStock ? (
                        <Text variant="caption" color="error">
                          Out of stock
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {relatedItems.length > 0 ? (
            <View style={styles.related}>
              <Text variant="h3">More in this aisle</Text>
              <FlatList
                horizontal
                data={relatedItems}
                keyExtractor={(r) => r.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.relatedRow}
                renderItem={({ item }) => (
                  <ProductCard
                    variant="mini"
                    name={item.name}
                    unit={item.unit}
                    price={item.price}
                    original={item.basePrice}
                    imageUrl={item.imageUrl}
                    inStock={item.inStock}
                    quantity={qtyByProduct.get(item.defaultVariantId ?? "") ?? 0}
                    busy={busyVariantId === item.defaultVariantId}
                    onPress={() => router.push(`/product/${item.id}`)}
                    onAdd={() => addProduct(item)}
                    onIncrement={() =>
                        setQty(item.defaultVariantId ?? "", (qtyByProduct.get(item.defaultVariantId ?? "") ?? 0) + 1)
                      }
                    onDecrement={() =>
                        setQty(item.defaultVariantId ?? "", (qtyByProduct.get(item.defaultVariantId ?? "") ?? 0) - 1)
                      }
                  />
                )}
              />
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* Floating header — outside the scroll view so it stays put */}
      <SafeAreaView style={styles.header} edges={['top', 'left', 'right']} pointerEvents="box-none">
        <IconButton name="arrow-back" onPress={() => router.back()} accessibilityLabel="Back" />
        <View>
          <IconButton
            name="cart-outline"
            onPress={() => router.push('/(tabs)/cart')}
            accessibilityLabel="Your cart"
          />
          {cartCount > 0 ? (
            <View style={styles.cartBadge} pointerEvents="none">
              <Text variant="labelSm" color="onPrimary">
                {cartCount}
              </Text>
            </View>
          ) : null}
        </View>
      </SafeAreaView>

      {/* Sticky action bar. Before the item is in the cart the stepper edits a
          local quantity (nothing is sent until Add); once it's in the cart the
          same stepper edits the cart line directly. */}
      {p && p.inStock ? (
        <SafeAreaView style={styles.actionBar} edges={['bottom', 'left', 'right']}>
          <View style={styles.actionRow}>
            <QuantityStepper
              value={qty > 0 ? qty : pending}
              onChange={(next) => (qty > 0 && selected ? setQty(selected.id, next) : setPending(next))}
              min={qty > 0 ? 0 : 1}
              max={Math.max(selected?.availableQty ?? p.availableQty, 1)}
              loading={busy}
            />
            <View style={styles.flex}>
              {qty > 0 ? (
                /* In the cart: confirm it, and show the line total so the
                   amount tracks the stepper the customer is still adjusting. */
                <Button
                  label={`Added to cart  ·  ${formatPKR((selected?.price ?? p.price) * qty)}`}
                  onPress={() => router.push('/(tabs)/cart')}
                  loading={busy}
                  leadingIcon={
                    <Icon name="checkmark-circle" size={18} color={theme.colors.onPrimary} />
                  }
                />
              ) : (
                <Button
                  label={`Add  ·  ${formatPKR((selected?.price ?? p.price) * pending)}`}
                  onPress={() => (selected ? addVariant(p, selected, pending) : undefined)}
                  loading={busy}
                  leadingIcon={
                    <Icon name="cart-outline" size={18} color={theme.colors.onPrimary} />
                  }
                />
              )}
            </View>
          </View>
        </SafeAreaView>
      ) : null}
    </View>
  );
}

function ProductBody({ product: p }: { product: ProductView }) {
  const savings = p.basePrice > p.price ? p.basePrice - p.price : 0;

  return (
    <View>
      <View style={styles.titleRow}>
        <Text variant="h2" style={styles.title}>
          {p.name}
        </Text>
        <View style={styles.priceCol}>
          <Text variant="h3">{formatPKR(p.price)}</Text>
          {savings > 0 ? (
            <Text variant="caption" color="textTertiary" style={styles.strike}>
              {formatPKR(p.basePrice)}
            </Text>
          ) : null}
        </View>
      </View>

      <Text variant="body" color="textSecondary" style={styles.unit}>
        {p.unit}
      </Text>

      {/* Trust pills. Basket states these as a soft ember row rather than a
          tile grid — but the content is still only what the catalogue knows.
          The comp's "Freshness promise" and "Best seller in Fruit" are claims
          with nothing behind them, so they are not here. */}
      <View style={styles.pills}>
        <FactPill icon="cube-outline" label={p.unit} />
        <FactPill
          icon={p.inStock ? 'checkmark-circle-outline' : 'close-circle-outline'}
          label={p.inStock ? `In stock · ${p.availableQty} left` : 'Sold out'}
        />
        <FactPill icon="flash-outline" label={`${ETA_MINUTES} min delivery`} />
      </View>

      {p.description ? (
        <View style={styles.block}>
          <Text variant="h3">Description</Text>
          <Text variant="body" color="textSecondary">
            {p.description}
          </Text>
        </View>
      ) : null}

      <View style={styles.block}>
        <Text variant="h3">Details</Text>
        <View>
          <DetailRow label="Unit" value={p.unit} />
          <DetailRow label="Price" value={formatPKR(p.price)} />
          {savings > 0 ? <DetailRow label="You save" value={formatPKR(savings)} /> : null}
          <DetailRow
            label="Availability"
            value={p.inStock ? `${p.availableQty} in stock` : 'Out of stock'}
            last
          />
        </View>
      </View>
    </View>
  );
}

function FactPill({ icon, label }: { icon: IconName; label: string }) {
  return (
    <View style={styles.pill}>
      <Icon name={icon} size={13} color={theme.colors.accent} />
      <Text variant="labelSm" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function DetailRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.detailRow, last ? styles.detailRowLast : null]}>
      <Text variant="body" color="textSecondary">
        {label}
      </Text>
      <Text variant="bodyStrong">{value}</Text>
    </View>
  );
}

function DetailSkeleton() {
  return (
    <View style={styles.skel}>
      <Skeleton width="75%" height={26} />
      <Skeleton width="35%" height={16} />
      <View style={styles.pills}>
        {[92, 116, 104].map((w) => (
          <Skeleton key={w} width={w} height={28} radius={theme.radii.pill} />
        ))}
      </View>
      <Skeleton width="45%" height={20} />
      <Skeleton height={14} />
      <Skeleton height={14} />
      <Skeleton width="60%" height={14} />
    </View>
  );
}

const HERO_HEIGHT = 340;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  scroll: { paddingBottom: 120 },

  sizes: { marginTop: theme.spacing.xl, gap: theme.spacing.md },
  sizeRow: { flexDirection: 'row', gap: theme.spacing.md },
  sizeCard: {
    flex: 1,
    borderRadius: theme.radii.sm,
    borderWidth: 2,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: 5,
  },
  sizeCardOn: { borderColor: theme.colors.primary, backgroundColor: theme.colors.infoSoft },
  sizePrice: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  related: { marginTop: theme.spacing.xl, gap: theme.spacing.md },
  relatedRow: { gap: theme.spacing.md, paddingRight: theme.layout.margin },
  cartBadge: {
    position: 'absolute',
    right: -3,
    top: -3,
    minWidth: 18,
    height: 18,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.layout.margin,
    paddingTop: theme.spacing.sm,
  },

  hero: { height: HERO_HEIGHT, backgroundColor: theme.colors.surfaceMuted },
  heroImage: { width: '100%', height: '100%' },
  heroFallback: { alignItems: 'center', justifyContent: 'center' },
  badges: {
    position: 'absolute',
    left: theme.layout.margin,
    bottom: theme.spacing['3xl'],
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  badgePrimary: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radii.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 5,
  },
  badgeSurface: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 5,
  },

  /** Pulled up over the image — the comp's rounded-t-[32px] lift. */
  sheet: {
    marginTop: -theme.spacing['2xl'],
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radii.xl,
    borderTopRightRadius: theme.radii.xl,
    paddingHorizontal: theme.layout.margin,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing['3xl'],
    minHeight: 420,
  },

  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.lg },
  title: { flex: 1 },
  priceCol: { alignItems: 'flex-end' },
  strike: { textDecorationLine: 'line-through' },
  unit: { marginTop: theme.spacing.xs },

  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: theme.colors.infoSoft,
    borderRadius: theme.radii.pill,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },

  block: { marginTop: theme.layout.sectionGap, gap: theme.spacing.md },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  detailRowLast: { borderBottomWidth: 0 },

  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.surface,
    ...theme.elevation.raised,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.lg,
    paddingHorizontal: theme.layout.margin,
    paddingVertical: theme.spacing.md,
  },

  skel: { gap: theme.spacing.md },
});
