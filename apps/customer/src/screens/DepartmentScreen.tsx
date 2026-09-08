import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Animated, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BusinessTypeKey, departmentCopy, formatPKR, type CategoryView, type DepartmentCopy, type ProductView } from '@haala/shared';
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
import { catalogApi } from '../api/endpoints';
import { qk } from '../api/queryKeys';
import { useBasket } from '../hooks/useCart';
import { useProductActions } from '../hooks/useProductActions';
import { useAuth } from '../auth/AuthContext';
import { useCurrentStore } from '../store/useCurrentStore';
import { ETA_MINUTES, FREE_DELIVERY_THRESHOLD } from '../config';

/** How many category rails Home renders before the user has to tap through. */
const SHELF_COUNT = 4;

/**
 * A department's storefront — today, the grocery catalogue.
 *
 * This is the screen that used to be the app's Home. It did not change when
 * Haala became a marketplace; it moved. The design's own note is that "Home is
 * the only screen that is genuinely new — everything below it is the grocery
 * shell with different content", so the shell stays exactly as it was and the
 * marketplace home now sits above it.
 *
 * Rendered by `app/department/[key].tsx`, which passes the business-type key.
 *
 * **Everything on this screen is scoped to that key**, and both queries need
 * telling separately — the categories and the products behind each shelf. While
 * the shell was grocery-only that scoping did not exist, so opening Clothing
 * showed the grocery aisles and grocery's products under them. A department is
 * a shop, not a filtered view of everything.
 */
/** How long the basket bar stays up after a change. */
const BAR_VISIBLE_MS = 3000;

/**
 * Show the basket bar briefly whenever the basket changes, then get out of the
 * way.
 *
 * It used to sit there permanently, covering the bottom of every shelf while
 * somebody was still shopping. It is feedback — "that went in, here is the
 * running total" — and feedback that never leaves is just furniture.
 *
 * Keyed on the count rather than on the add handler so it reacts to a stepper
 * and a remove as well, and skips the first render: arriving at a department
 * with a basket already full should not flash a bar nobody asked for.
 */
function useTransientBar(itemCount: number, ready: boolean) {
  const opacity = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);
  const previous = useRef<number | null>(null);

  useEffect(() => {
    // Nothing is a "change" until the basket has actually loaded. Without this
    // the count goes 0 → N as the query resolves, and every arrival at a
    // department flashed a bar the customer had not done anything to earn.
    if (!ready) return;

    if (previous.current === null || previous.current === itemCount) {
      previous.current = itemCount;
      return;
    }
    previous.current = itemCount;
    if (itemCount === 0) return;

    setMounted(true);
    // `useNativeDriver` so the fade runs off the JS thread — this happens while
    // the customer is scrolling a shelf, which is exactly when the JS thread is
    // busiest.
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();

    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 260, useNativeDriver: true }).start(
        ({ finished }) => {
          // Unmounted only once it is actually invisible, and only if the fade
          // ran to completion — a new add restarts it and must not be
          // unmounted by the previous timer's callback.
          if (finished) setMounted(false);
        },
      );
    }, BAR_VISIBLE_MS);

    return () => clearTimeout(timer);
  }, [itemCount, ready, opacity]);

  return { mounted, opacity };
}

export function DepartmentScreen({ department }: { department: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const { store, storeId, outOfArea, address } = useCurrentStore();
  const [refreshing, setRefreshing] = useState(false);

  const copy = departmentCopy[department as BusinessTypeKey] as DepartmentCopy | undefined;
  const tint = theme.departmentTints[department] ?? theme.colors.primary;

  const categories = useQuery({
    queryKey: qk.categories(department),
    queryFn: () => catalogApi.categories(department),
  });

  /*
   * The promo rail, from the banners ops manages — not the two hardcoded
   * grocery adverts that used to sit here and appeared, unchanged, on every
   * department. Same query key the home screen uses, so this is a cache hit
   * rather than a second request.
   */
  const home = useQuery({
    queryKey: qk.home(storeId),
    queryFn: () => catalogApi.home(storeId),
    staleTime: 5 * 60_000,
  });
  const banners = (home.data?.banners ?? []).filter(
    // A banner with no department belongs to the platform and shows everywhere.
    (b) => b.departmentKey === null || b.departmentKey === department,
  );
  const { qtyByProduct, busyVariantId, addProduct, setQty } = useProductActions(storeId);
  /*
   * This department's basket, not every basket. The bar at the foot of a shop
   * should count what is in *that* shop — showing a grocery total while
   * standing in Clothing, on a button that then opens the clothing basket,
   * would be three kinds of wrong at once.
   */
  const { basket, refetch: refetchBaskets, isLoading: basketsLoading } = useBasket(department);
  const bar = useTransientBar(basket.itemCount, !basketsLoading);

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
      refetchBaskets(),
      ...shelves.map((s) => s.refetch()),
    ]);
    setRefreshing(false);
    // `shelves` is a fresh array each render; depending on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, refetchBaskets]);

  const initials = (user?.name ?? 'H')
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  // Progress toward free delivery, straight off the shared pricing rule so the
  // bar can never promise a threshold the server doesn't honour.
  const subtotal = basket.subtotal;
  const remaining = Math.max(FREE_DELIVERY_THRESHOLD - subtotal, 0);
  const freeDeliveryPct = Math.min(subtotal / FREE_DELIVERY_THRESHOLD, 1);
  const freeDeliveryCopy =
    remaining === 0
      ? 'Delivery is on us 🎉'
      : `${formatPKR(remaining)} away from free delivery`;

  const openCategory = (c: CategoryView) =>
    router.push(`/products?categoryId=${c.id}&department=${department}`);

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
          <SafeAreaView style={[styles.hero, { backgroundColor: tint }]} edges={['top', 'left', 'right']}>
            <View style={styles.heroTop}>
              {/*
                Out of the shop and back to the marketplace.
              
                The comp's department view opens with exactly this — a round translucent
                disc holding a back arrow, top left. Without it a department was a
                one-way door: the tab bar was absent and the only way home was the
                system back gesture, which is not a control anybody can see.
              */}
              <Pressable
                style={styles.heroBack}
                onPress={() => router.push('/(tabs)')}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Back to all departments"
              >
                <Icon name="arrow-back" size={16} color={theme.colors.onPrimary} />
              </Pressable>
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
              {/*
                The basket, in the header.
              
                The Cart tab came out of the bar, so a shop needs its own way through to
                it — and the count belongs where a shopper's eye already goes when they
                want to know what they have picked up.
              */}
              <Pressable
                style={styles.heroCart}
                onPress={() => router.push(`/(tabs)/cart?department=${department}`)}
                accessibilityRole="button"
                accessibilityLabel={`Basket, ${basket.itemCount} ${basket.itemCount === 1 ? 'item' : 'items'}`}
              >
                <Icon name="bag-handle-outline" size={17} color={theme.colors.onPrimary} />
                {basket.itemCount > 0 ? (
                  <View style={styles.heroCartBadge}>
                    <Text variant="caption" style={styles.heroCartBadgeText}>
                      {basket.itemCount > 9 ? '9+' : basket.itemCount}
                    </Text>
                  </View>
                ) : null}
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
              <SearchBar
                  showVoice
                  placeholder={copy?.searchHint}
                  onPress={() => router.push('/(tabs)/search')}
                />
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
                  From {store.area}
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
            subtitle={`${address?.area ?? 'This address'} is outside every store’s delivery area. Choose a different delivery address to start shopping.`}
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

        {/*
          Promos, from the dashboard. Absent when this department has none —
          previously two grocery adverts ("Fresh fruit from Swat") appeared on
          every department, which is what the department screen was before it
          was a department screen.
        */}
        {!outOfArea && banners.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.rail}
          >
            {banners.map((b) => (
              <Pressable
                key={b.id}
                style={[styles.banner, styles.bannerEmber, { backgroundColor: tint }]}
                onPress={() => (b.linkTo ? router.push(b.linkTo as never) : undefined)}
                disabled={!b.linkTo}
                accessibilityRole={b.linkTo ? 'button' : undefined}
                accessibilityLabel={b.title}
              >
                <Text variant="h3" color="onPrimary" style={styles.bannerTitle} numberOfLines={2}>
                  {b.title}
                </Text>
                {b.badge ? (
                  <View style={styles.bannerTagSun}>
                    <Text variant="labelSm" style={styles.bannerTagSunText}>
                      {b.badge}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            ))}
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
                <Pressable onPress={() => router.push(`/products?categoryId=${category.id}&department=${department}`)}>
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
              )}
            </View>
          );
        })}
      </ScrollView>

      {bar.mounted && basket.itemCount > 0 ? (
        <Animated.View style={[styles.footer, { opacity: bar.opacity }]}>
          <CTABar
            leftTop={`${basket.itemCount} item${basket.itemCount === 1 ? '' : 's'}`}
            leftBottom={formatPKR(basket.subtotal)}
            buttonLabel="View Cart  →"
            // Opens the switcher already on this department, so the basket the
            // bar was describing is the one that appears.
            onPress={() => router.push(`/(tabs)/cart?department=${department}`)}
          />
        </Animated.View>
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
    // Overridden per department at the call site; ember is grocery's identity,
    // and a clothing shop under a grocery-orange header reads as the wrong app.
    backgroundColor: theme.colors.primary,
    borderBottomLeftRadius: theme.radii.xl,
    borderBottomRightRadius: theme.radii.xl,
    paddingHorizontal: theme.layout.margin,
    paddingBottom: 46,
  },
  /** The comp's 34px disc: translucent white, so it reads on any tint. */
  heroBack: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
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
    /*
     * Translucent white rather than `accent`, because the header behind it is
     * now the department's colour and `accent` *is* clothing's colour — the
     * pill vanished into its own background. A white wash reads as a chip on
     * every tint, and is the idiom the comp uses for chips on tinted grounds.
     */
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: theme.radii.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 7,
  },
  progressCard: {
    marginTop: -32,
    marginHorizontal: theme.layout.margin,
    backgroundColor: theme.colors.accent,
    // Same problem as the pill, but this card keeps its ink fill — half of it
    // overhangs the white below, where a translucent wash would look grubby.
    // A hairline separates it from a dark header instead.
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
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
  heroActions: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  heroCart: {
    width: 34,
    height: 34,
    borderRadius: theme.radii.pill,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCartBadge: {
    position: 'absolute',
    right: -3,
    top: -3,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: theme.colors.promo,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  heroCartBadgeText: { color: theme.colors.onPromo, fontSize: 9.5, lineHeight: 17 },
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
  catTile: { width: 64, alignItems: 'center', gap: theme.spacing.sm },
  catTileImage: {
    width: 64,
    height: 64,
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
  bannerTitle: { maxWidth: 150 },
  bannerTagSun: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.promo,
    borderRadius: theme.radii.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 5,
  },
  bannerTagSunText: { color: theme.colors.onPromo },
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
