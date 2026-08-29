import { useCallback, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatPKR, type CategoryView, type ProductView } from '@haala/shared';
import {
  COMPACT_CARD_WIDTH,
  CTABar,
  EmptyState,
  Icon,
  ProductCard,
  SearchBar,
  Skeleton,
  Text,
  Thumb,
  theme,
} from '@haala/ui';
import { catalogApi } from '../../src/api/endpoints';
import { qk } from '../../src/api/queryKeys';
import { useProductActions } from '../../src/hooks/useProductActions';
import { useAuth } from '../../src/auth/AuthContext';
import { useCurrentStore } from '../../src/store/useCurrentStore';
import { ETA_MINUTES, FREE_DELIVERY_THRESHOLD } from '../../src/config';

/** How many category rails Home renders before the user has to tap through. */
const SHELF_COUNT = 4;

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { store, storeId, outOfArea, address } = useCurrentStore();
  const [refreshing, setRefreshing] = useState(false);

  const categories = useQuery({ queryKey: qk.categories, queryFn: catalogApi.categories });
  const { cart, qtyByProduct, busyProductId, addOne, setQty } = useProductActions(storeId);

  const shelfCategories = (categories.data ?? []).slice(0, SHELF_COUNT);

  // One query per rail. They run in parallel and cache independently, so
  // pulling to refresh or adding to cart never re-fetches the whole page.
  const shelves = useQueries({
    queries: shelfCategories.map((c) => ({
      queryKey: qk.products(storeId ?? 'none', c.id),
      queryFn: () => catalogApi.products({ storeId: storeId as string, categoryId: c.id }),
      enabled: !!storeId,
    })),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([
      categories.refetch(),
      cart.refetch(),
      ...shelves.map((s) => s.refetch()),
    ]);
    setRefreshing(false);
    // `shelves` is a fresh array each render; depending on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, cart]);

  const initials = (user?.name ?? 'H')
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  // Progress toward free delivery, straight off the shared pricing rule so the
  // bar can never promise a threshold the server doesn't honour.
  const subtotal = cart.data?.subtotal ?? 0;
  const remaining = Math.max(FREE_DELIVERY_THRESHOLD - subtotal, 0);
  const freeDeliveryPct = Math.min(subtotal / FREE_DELIVERY_THRESHOLD, 1);
  const freeDeliveryCopy =
    remaining === 0
      ? 'Delivery is on us 🎉'
      : `${formatPKR(remaining)} away from free delivery`;

  const openCategory = (c: CategoryView) => router.push(`/products?categoryId=${c.id}`);

  return (
    <View style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* Ember hero. Everything above the fold sits on the brand colour and
            sweeps into the canvas on a 26px curve; the search field floats on
            top of it rather than below it. */}
        <View style={styles.heroBlock}>
          <SafeAreaView style={styles.hero} edges={['top', 'left', 'right']}>
            <View style={styles.heroTop}>
              <Pressable
                style={styles.location}
                onPress={() => router.push('/addresses')}
                accessibilityRole="button"
              >
                <Icon name="location-outline" size={15} color={theme.colors.onPrimary} />
                <Text variant="bodySm" style={styles.heroDim} numberOfLines={1}>
                  Deliver to
                </Text>
                <Text variant="bodyStrong" color="onPrimary" numberOfLines={1}>
                  {store
                    ? (address?.area ?? store.area)
                    : outOfArea
                      ? 'Outside our area'
                      : 'Finding your store…'}
                </Text>
                <Icon name="chevron-down" size={13} color={theme.colors.onPrimary} />
              </Pressable>
              <Pressable
                style={styles.avatar}
                onPress={() => router.push('/(tabs)/account')}
                accessibilityLabel="Your account"
              >
                <Text variant="labelSm" color="onPrimary">
                  {initials}
                </Text>
              </Pressable>
            </View>

            <View style={styles.heroSearch}>
              <SearchBar showVoice onPress={() => router.push('/(tabs)/search')} />
            </View>

            <View style={styles.heroMeta}>
              <View style={styles.etaPill}>
                <Icon name="time-outline" size={13} color={theme.colors.onPrimary} />
                <Text variant="labelSm" color="onPrimary">
                  {ETA_MINUTES} min delivery
                </Text>
              </View>
              {store ? (
                <Text variant="bodySm" style={styles.heroDim} numberOfLines={1}>
                  Fresh from {store.area}
                </Text>
              ) : null}
            </View>
          </SafeAreaView>

          {/* Free-delivery progress, overlapping the hero. Driven by the same
              `FREE_DELIVERY_THRESHOLD` the server prices against, so the bar
              cannot promise a threshold checkout won't honour. */}
          <View style={styles.progressCard}>
            <View style={styles.progressTop}>
              <Text variant="labelSm" color="onPrimary" numberOfLines={1} style={styles.flexShrink}>
                {freeDeliveryCopy}
              </Text>
              <Text variant="labelSm" color="onPrimary">
                Free delivery
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${freeDeliveryPct * 100}%` }]} />
            </View>
          </View>
        </View>

        {/* Outside every store's radius is a real answer, not an empty shop —
            show it instead of a promo and category rails that lead nowhere. */}
        {outOfArea ? (
          <EmptyState
            emoji="📍"
            title="We don’t deliver here yet"
            subtitle={`${address?.area ?? 'This address'} is outside every store’s delivery radius. Choose a different delivery address to start shopping.`}
            actionLabel="Change address"
            onAction={() => router.push('/addresses')}
          />
        ) : null}

        {/* Promo panel. Solid ink rather than photography — the Onyx canvas
            stays quiet, so a single dark surface carries the whole banner. */}
        {/* Shop by category — tiles, not chips. The rail is the primary way
            into the catalogue, so it gets image weight rather than text. */}
        {categories.data && categories.data.length > 0 && !outOfArea ? (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text variant="h3">Shop by category</Text>
              <Pressable onPress={() => router.push('/(tabs)/categories')}>
                <Text variant="label" style={styles.seeAll}>
                  See all
                </Text>
              </Pressable>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.rail}
            >
              {categories.data.map((c) => (
                <Pressable key={c.id} style={styles.catTile} onPress={() => openCategory(c)}>
                  <View style={styles.catTileImage}>
                    <Thumb imageUrl={c.imageUrl} name={c.name} fill radius={theme.radii.md} />
                  </View>
                  <Text variant="labelSm" align="center" numberOfLines={2}>
                    {c.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* Twin promo banners. Ember then ink, so the pair reads as one system
            rather than two unrelated adverts. */}
        {!outOfArea ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.rail}
          >
            <Pressable style={[styles.banner, styles.bannerEmber]} onPress={() => router.push('/products')}>
              <Text variant="h3" color="onPrimary" style={styles.bannerTitle}>
                Fresh fruit{'\n'}from Swat
              </Text>
              <View style={styles.bannerTagSun}>
                <Text variant="labelSm" style={styles.bannerTagSunText}>
                  Up to 20% off
                </Text>
              </View>
            </Pressable>
            <Pressable style={[styles.banner, styles.bannerInk]} onPress={() => router.push('/products')}>
              <Text variant="h3" color="onPrimary" style={styles.bannerTitle}>
                Free delivery{'\n'}on your first
              </Text>
              <View style={styles.bannerTagLight}>
                <Text variant="labelSm">Use HAALA100</Text>
              </View>
            </Pressable>
          </ScrollView>
        ) : null}

        {/* One rail per category */}
        {(outOfArea ? [] : shelfCategories).map((category, i) => {
          const shelf = shelves[i];
          const items = shelf?.data?.items ?? [];
          if (!shelf?.isLoading && items.length === 0) return null;
          return (
            <View key={category.id} style={styles.shelf}>
              <View style={styles.shelfHeader}>
                <Text variant="h3">{category.name}</Text>
                <Pressable onPress={() => router.push(`/products?categoryId=${category.id}`)}>
                  <Text variant="label" color="textSecondary">
                    See all
                  </Text>
                </Pressable>
              </View>

              {shelf?.isLoading ? (
                <ShelfSkeleton />
              ) : (
                <FlatList
                  horizontal
                  data={items}
                  keyExtractor={(p) => p.id}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.shelfRow}
                  renderItem={({ item }: { item: ProductView }) => (
                    <ProductCard
                      variant="compact"
                      name={item.name}
                      unit={item.unit}
                      price={item.price}
                    original={item.basePrice}
                      imageUrl={item.imageUrl}
                      inStock={item.inStock}
                      quantity={qtyByProduct.get(item.defaultVariantId ?? "") ?? 0}
                      busy={busyProductId === item.id}
                      onPress={() => router.push(`/product/${item.id}`)}
                      onAdd={() => addOne(item.defaultVariantId)}
                      onIncrement={() =>
                        setQty(item.defaultVariantId ?? "", (qtyByProduct.get(item.defaultVariantId ?? "") ?? 0) + 1)
                      }
                      onDecrement={() =>
                        setQty(item.defaultVariantId ?? "", (qtyByProduct.get(item.defaultVariantId ?? "") ?? 0) - 1)
                      }
                    />
                  )}
                />
              )}
            </View>
          );
        })}
      </ScrollView>

      {cart.data && cart.data.itemCount > 0 ? (
        <View style={styles.footer}>
          <CTABar
            leftTop={`${cart.data.itemCount} items`}
            leftBottom={formatPKR(cart.data.subtotal)}
            buttonLabel="View Cart  →"
            onPress={() => router.push('/(tabs)/cart')}
          />
        </View>
      ) : null}
    </View>
  );
}

function ShelfSkeleton() {
  return (
    <View style={styles.shelfRow}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.skelCard}>
          <Skeleton height={COMPACT_CARD_WIDTH - 32} radius={theme.radii.xs} />
          <Skeleton width="85%" height={12} />
          <Skeleton width="55%" height={10} />
          <Skeleton width="70%" height={16} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  /**
   * Hero and progress card share a wrapper so the content gap doesn't land
   * between them — the card is meant to overlap the hero, not follow it.
   */
  heroBlock: {
    // Break out of the ScrollView's 16px inset so the ember runs edge to edge.
    marginHorizontal: -theme.layout.margin,
  },
  hero: {
    backgroundColor: theme.colors.primary,
    borderBottomLeftRadius: theme.radii.xl,
    borderBottomRightRadius: theme.radii.xl,
    paddingHorizontal: theme.layout.margin,
    paddingBottom: 46,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  heroDim: { color: 'rgba(255,255,255,0.85)' },
  heroSearch: { marginTop: theme.spacing.xs },
  heroMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  etaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 7,
  },
  progressCard: {
    marginTop: -32,
    marginHorizontal: theme.layout.margin,
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    ...theme.elevation.raised,
  },
  progressTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  progressTrack: {
    height: 6,
    borderRadius: theme.radii.pill,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.promo,
  },
  flexShrink: { flexShrink: 1 },
  location: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: theme.radii.pill,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: theme.layout.margin,
    paddingBottom: 140,
    gap: theme.layout.sectionGap,
  },
  section: { gap: theme.spacing.md },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  seeAll: { color: theme.colors.primaryPressed },
  // Rails bleed to the right screen edge; the section header stays on the grid.
  rail: { gap: theme.spacing.md, paddingRight: theme.layout.margin },
  catTile: { width: 74, alignItems: 'center', gap: theme.spacing.sm },
  catTileImage: {
    width: 74,
    height: 74,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.infoSoft,
    padding: 7,
    overflow: 'hidden',
  },
  banner: {
    width: 290,
    height: 104,
    borderRadius: theme.radii.md,
    padding: theme.spacing.lg,
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  bannerEmber: { backgroundColor: theme.colors.primary },
  bannerInk: { backgroundColor: theme.colors.accent },
  bannerTitle: { maxWidth: 150 },
  bannerTagSun: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.promo,
    borderRadius: theme.radii.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 5,
  },
  bannerTagSunText: { color: theme.colors.onPromo },
  bannerTagLight: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 5,
  },
  shelf: { gap: theme.spacing.md },
  shelfHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // Negative margin lets cards bleed to the screen edge while the section
  // header stays aligned to the 16px margin.
  shelfRow: {
    gap: theme.spacing.md,
    paddingRight: theme.layout.margin,
    paddingVertical: theme.spacing.xs,
  },
  skelCard: {
    width: COMPACT_CARD_WIDTH,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.sm,
    gap: theme.spacing.sm,
    ...theme.elevation.card,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: theme.layout.margin,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    ...theme.elevation.raised,
  },
});
