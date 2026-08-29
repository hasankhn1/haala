import { useCallback, useMemo, useState } from 'react';
import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatPKR, type ProductView } from '@haala/shared';
import {
  CTABar,
  Chip,
  IconButton,
  ProductCard,
  ProductCardSkeleton,
  SearchBar,
  StateView,
  Text,
  theme,
} from '@haala/ui';
import { catalogApi } from '../../src/api/endpoints';
import { qk } from '../../src/api/queryKeys';
import { useDebouncedValue } from '../../src/hooks/useDebouncedValue';
import { useProductActions } from '../../src/hooks/useProductActions';
import { useCurrentStore } from '../../src/store/useCurrentStore';

export default function ProductsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ categoryId?: string }>();
  const { storeId } = useCurrentStore();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 350);
  const [refreshing, setRefreshing] = useState(false);

  // The route can arrive with a category preselected; the chip rail can then
  // move within categories without leaving the screen.
  const [categoryId, setCategoryId] = useState<string | undefined>(params.categoryId);

  const categories = useQuery({ queryKey: qk.categories, queryFn: catalogApi.categories });

  const products = useQuery({
    queryKey: qk.products(storeId ?? 'none', categoryId, debouncedSearch),
    queryFn: () =>
      catalogApi.products({
        storeId: storeId as string,
        categoryId,
        q: debouncedSearch || undefined,
      }),
    enabled: !!storeId,
    placeholderData: (prev) => prev, // keep old results visible while searching
  });

  const { qtyByProduct, busyProductId, addOne, setQty, cart } = useProductActions(storeId);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await products.refetch();
    setRefreshing(false);
  }, [products]);

  const title = useMemo(
    () => categories.data?.find((c) => c.id === categoryId)?.name ?? 'All products',
    [categories.data, categoryId],
  );

  const [dealsOnly, setDealsOnly] = useState(false);
  const all = products.data?.items ?? [];
  const items = dealsOnly ? all.filter((p) => p.basePrice > p.price) : all;
  const dealCount = all.filter((p) => p.basePrice > p.price).length;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <IconButton name="arrow-back" onPress={() => router.back()} accessibilityLabel="Back" />
          <Text variant="h2" numberOfLines={1} style={styles.flex}>
            {title}
          </Text>
        </View>

        <SearchBar
          value={search}
          onChangeText={setSearch}
          onClear={() => setSearch('')}
          placeholder="Search products"
        />

        {categories.data && categories.data.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {/* Savings first — the comp puts "Deals only" ahead of the
                category filters because it is the one people reach for. */}
            {dealCount > 0 ? (
              <Pressable
                onPress={() => setDealsOnly((v) => !v)}
                style={[styles.dealsPill, dealsOnly && styles.dealsPillOn]}
                accessibilityRole="button"
              >
                <Text variant="labelSm" style={dealsOnly ? styles.dealsOnText : undefined}>
                  Deals only · {dealCount}
                </Text>
              </Pressable>
            ) : null}
            <Chip
              label="All"
              shape="pill"
              selected={!categoryId}
              onPress={() => setCategoryId(undefined)}
            />
            {categories.data.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                shape="pill"
                selected={categoryId === c.id}
                onPress={() => setCategoryId(c.id)}
              />
            ))}
          </ScrollView>
        ) : null}
      </View>

      {products.isLoading ? (
        <View style={styles.skelGrid}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <View key={i} style={styles.skelCell}>
              <ProductCardSkeleton />
            </View>
          ))}
        </View>
      ) : (
        <StateView
          error={products.error}
          isEmpty={!!products.data && items.length === 0}
          onRetry={() => products.refetch()}
        >
          <View style={styles.flex}>
            <FlashList
              data={items}
              numColumns={2}
              estimatedItemSize={250}
              keyExtractor={(p) => p.id}
              contentContainerStyle={styles.list}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={theme.colors.primary}
                />
              }
              renderItem={({ item }: { item: ProductView }) => (
                <View style={styles.cell}>
                  <ProductCard
                    name={item.name}
                    unit={item.unit}
                    price={item.price}
                    original={item.basePrice}
                    imageUrl={item.imageUrl}
                    inStock={item.inStock}
                    quantity={qtyByProduct.get(item.id) ?? 0}
                    busy={busyProductId === item.id}
                    onPress={() => router.push(`/product/${item.id}`)}
                    onAdd={() => addOne(item.id)}
                    onIncrement={() => setQty(item.id, (qtyByProduct.get(item.id) ?? 0) + 1)}
                    onDecrement={() => setQty(item.id, (qtyByProduct.get(item.id) ?? 0) - 1)}
                  />
                </View>
              )}
            />
          </View>
        </StateView>
      )}

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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  header: {
    paddingHorizontal: theme.layout.margin,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.md,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  /** Sun-yellow when on, hairline pill when off — savings colour is reserved. */
  dealsPill: {
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 7,
    justifyContent: 'center',
  },
  dealsPillOn: {
    backgroundColor: theme.colors.promo,
    borderColor: theme.colors.promo,
  },
  dealsOnText: { color: theme.colors.onPromo },
  chips: { gap: theme.spacing.sm, paddingRight: theme.spacing.lg },
  list: { paddingHorizontal: theme.spacing.md, paddingBottom: 140 },
  cell: { flex: 1, padding: theme.spacing.sm },
  skelGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: theme.spacing.md },
  // `flex: 1` collapses to full width inside a wrapping row — pin to half.
  skelCell: { width: '50%', padding: theme.spacing.sm },
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
