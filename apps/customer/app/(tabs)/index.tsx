import { useCallback, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatPKR, type CategoryView, type ProductView } from '@haala/shared';
import {
  Chip,
  COMPACT_CARD_WIDTH,
  CTABar,
  Icon,
  ProductCard,
  SearchBar,
  Skeleton,
  Text,
  theme,
} from '@haala/ui';
import { catalogApi } from '../../src/api/endpoints';
import { qk } from '../../src/api/queryKeys';
import { useProductActions } from '../../src/hooks/useProductActions';
import { useAuth } from '../../src/auth/AuthContext';
import { useCurrentStore } from '../../src/store/useCurrentStore';

/** How many category rails Home renders before the user has to tap through. */
const SHELF_COUNT = 4;

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { store, storeId } = useCurrentStore();
  const [refreshing, setRefreshing] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

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

  const openCategory = (c: CategoryView | null) => {
    setActiveCategory(c?.id ?? null);
    if (c) router.push(`/products?categoryId=${c.id}`);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Top app bar — deliver-to on the left, account on the right. */}
      <View style={styles.appBar}>
        <Pressable
          style={styles.location}
          onPress={() => router.push('/addresses')}
          accessibilityRole="button"
        >
          <Icon name="location-outline" size={20} color={theme.colors.primary} />
          <Text variant="bodyStrong" numberOfLines={1}>
            {store ? `Deliver to ${store.area}` : 'Finding your store…'}
          </Text>
          <Icon name="chevron-down" size={16} color={theme.colors.textSecondary} />
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
        <SearchBar showVoice onPress={() => router.push('/(tabs)/search')} />

        {/* Promo panel. Solid ink rather than photography — the Onyx canvas
            stays quiet, so a single dark surface carries the whole banner. */}
        <Pressable style={styles.promo} onPress={() => router.push('/products')}>
          <View style={styles.promoTag}>
            <Text variant="labelSm" color="onPrimary">
              LIMITED TIME
            </Text>
          </View>
          <Text variant="h2" color="textInverse" style={styles.promoTitle}>
            Fresh fruit from Swat
          </Text>
          <Text variant="bodySm" style={styles.promoSub}>
            Up to 20% off selected items
          </Text>
        </Pressable>

        {/* Category rail */}
        {categories.data && categories.data.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pills}
          >
            <Chip
              label="All"
              shape="pill"
              selected={activeCategory === null}
              onPress={() => openCategory(null)}
            />
            {categories.data.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                shape="pill"
                selected={activeCategory === c.id}
                onPress={() => openCategory(c)}
              />
            ))}
          </ScrollView>
        ) : null}

        {/* One rail per category */}
        {shelfCategories.map((category, i) => {
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
                      imageUrl={item.imageUrl}
                      inStock={item.inStock}
                      quantity={qtyByProduct.get(item.id) ?? 0}
                      busy={busyProductId === item.id}
                      onPress={() => router.push(`/product/${item.id}`)}
                      onAdd={() => addOne(item.id)}
                      onIncrement={() => setQty(item.id, (qtyByProduct.get(item.id) ?? 0) + 1)}
                      onDecrement={() => setQty(item.id, (qtyByProduct.get(item.id) ?? 0) - 1)}
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
    </SafeAreaView>
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
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    paddingHorizontal: theme.layout.margin,
    paddingVertical: theme.spacing.md,
  },
  location: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: theme.layout.margin,
    paddingBottom: 140,
    gap: theme.layout.sectionGap,
  },
  promo: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.xl,
    minHeight: 132,
    justifyContent: 'center',
    gap: theme.spacing.xs,
  },
  promoTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: theme.radii.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 3,
    marginBottom: theme.spacing.xs,
  },
  promoTitle: { color: theme.colors.textInverse },
  promoSub: { color: 'rgba(255,255,255,0.75)' },
  pills: { gap: theme.spacing.sm, paddingRight: theme.spacing.lg },
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
