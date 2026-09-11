import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { departmentCopy, formatPKR, type CategoryView, type ProductView } from '@haala/shared';
import {
  CTABar,
  Icon,
  IconButton,
  ProductCard,
  ProductCardSkeleton,
  SearchBar,
  StateView,
  Text,
  theme,
} from '@haala/ui';
import { catalogApi } from '../../api/endpoints';
import { qk } from '../../api/queryKeys';
import { useBasket } from '../../hooks/useCart';
import { useProductActions } from '../../hooks/useProductActions';
import { useCurrentStore } from '../../store/useCurrentStore';
import { useWishlist } from '../../store/useWishlist';
import {
  activeChips as buildActiveChips,
  applyFilters,
  countActive,
  EMPTY_FILTERS,
  SORT_OPTIONS,
  type ClothingFilters,
} from './filters';
import { FilterSheet, type BrandOption } from './FilterSheet';
import { SortSheet } from './SortSheet';

const DEPARTMENT = 'clothing';
/** The comp gives a garment on a person more vertical room than a grocery tin. */
const CARD_IMAGE_HEIGHT = 190;

/**
 * Clothing's browse screen — the filter-driven PLP the comp draws.
 *
 * It is the grocery shell with clothing content: the same header discs, search
 * bar, product card, bottom sheet and cart bar, arranged as a flat filtered
 * listing rather than grocery's hero-and-rails storefront. Brand, price, deals
 * and sort narrow the results here on the device; size and colour are collected
 * for the server (see `filters.ts`).
 */
export function ClothingScreen({ initialBrand }: { initialBrand?: string } = {}) {
  const router = useRouter();
  const { storeId } = useCurrentStore();
  const copy = departmentCopy[DEPARTMENT];

  /** The underlined tab strip — clothing's categories. undefined = "All". */
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [filters, setFilters] = useState<ClothingFilters>(
    initialBrand ? { ...EMPTY_FILTERS, brands: [initialBrand] } : EMPTY_FILTERS,
  );
  const [sheet, setSheet] = useState<'none' | 'sort' | 'filters'>('none');
  const [refreshing, setRefreshing] = useState(false);

  const wishlistIds = useWishlist((s) => s.ids);
  const toggleWish = useWishlist((s) => s.toggle);

  const categories = useQuery({
    queryKey: qk.categories(DEPARTMENT),
    queryFn: () => catalogApi.categories(DEPARTMENT),
  });

  const products = useQuery({
    queryKey: qk.products(storeId ?? 'none', categoryId, undefined, DEPARTMENT),
    // ponytail: the brand rail, filters and counts are derived client-side from
    // the whole department, so pull the max page. 100-row ceiling until the
    // server filters clothing / a brands-with-counts endpoint exists.
    queryFn: () =>
      catalogApi.products({ storeId: storeId as string, department: DEPARTMENT, categoryId, pageSize: 100 }),
    enabled: !!storeId,
  });

  // The promo rail, shared with Home's cache — the department's own banners.
  const home = useQuery({
    queryKey: qk.home(storeId),
    queryFn: () => catalogApi.home(storeId),
    staleTime: 5 * 60_000,
  });
  const banner = (home.data?.banners ?? []).find(
    (b) => b.departmentKey === null || b.departmentKey === DEPARTMENT,
  );

  const { qtyByProduct, busyVariantId, addProduct, setQty } = useProductActions(storeId);
  const { basket, refetch: refetchBaskets } = useBasket(DEPARTMENT);

  const allItems = products.data?.items ?? [];

  // Brands the listing has actually surfaced — feeds the rail, the filter sheet
  // and the active-chip labels. Derived rather than fetched: a brands endpoint
  // with per-brand counts is the backend's; this is the honest stopgap.
  const brands: BrandOption[] = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of allItems) if (!seen.has(p.brandSlug)) seen.set(p.brandSlug, p.brandName);
    return [...seen].map(([slug, name]) => ({ slug, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [allItems]);
  const brandName = useCallback(
    (slug: string) => brands.find((b) => b.slug === slug)?.name ?? slug,
    [brands],
  );

  const items = useMemo(() => applyFilters(allItems, filters), [allItems, filters]);
  const chips = useMemo(() => buildActiveChips(filters, brandName), [filters, brandName]);
  const filterCount = countActive(filters);
  const sortLabel = SORT_OPTIONS.find((o) => o.key === filters.sort)?.label ?? '';
  const title = categories.data?.find((c) => c.id === categoryId)?.name ?? 'Clothing';

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([products.refetch(), refetchBaskets()]);
    setRefreshing(false);
  }, [products, refetchBaskets]);

  const openProduct = (p: ProductView) => router.push(`/product/${p.id}`);

  const header = (
    <View style={styles.headerBlock}>
      <SearchBar onPress={() => router.push('/(tabs)/search')} placeholder={copy.searchHint} />

      {/* Sort / Filters / Deals / Brands — the pill filter row. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        <FilterPill label={sortLabel} trailing="chevron-down" onPress={() => setSheet('sort')} />
        <FilterPill
          label="Filters"
          leading="list-outline"
          badge={filterCount || undefined}
          active={filterCount > 0}
          onPress={() => setSheet('filters')}
        />
        <FilterPill
          label="Deals only"
          active={filters.dealsOnly}
          onPress={() => setFilters((f) => ({ ...f, dealsOnly: !f.dealsOnly }))}
        />
        <FilterPill
          label="Brands"
          trailing="chevron-forward"
          onPress={() => router.push(`/brands?department=${DEPARTMENT}`)}
        />
      </ScrollView>

      {chips.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {chips.map((c) => (
            <Pressable
              key={c.key}
              style={styles.activeChip}
              onPress={() => setFilters(c.clear)}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${c.label}`}
            >
              <Text variant="labelSm" color="primary">
                {c.label}
              </Text>
              <Icon name="close" size={12} color={theme.colors.primary} />
            </Pressable>
          ))}
          <Pressable style={styles.clearAll} onPress={() => setFilters(EMPTY_FILTERS)}>
            <Text variant="labelSm" color="textSecondary">
              Clear all
            </Text>
          </Pressable>
        </ScrollView>
      ) : null}

      {banner ? (
        <Pressable
          style={styles.banner}
          onPress={() => (banner.linkTo ? router.push(banner.linkTo as never) : undefined)}
          disabled={!banner.linkTo}
          accessibilityRole={banner.linkTo ? 'button' : undefined}
          accessibilityLabel={banner.title}
        >
          <Text variant="h3" color="onPrimary" numberOfLines={2} style={styles.bannerTitle}>
            {banner.title}
          </Text>
          {banner.badge ? (
            <View style={styles.bannerBadge}>
              <Text variant="labelSm" style={styles.bannerBadgeText}>
                {banner.badge}
              </Text>
            </View>
          ) : null}
        </Pressable>
      ) : null}

      {brands.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.brandRail}
        >
          {brands.map((b) => {
            const on = filters.brands.includes(b.slug);
            return (
              <Pressable
                key={b.slug}
                style={styles.brandItem}
                onPress={() =>
                  setFilters((f) => ({
                    ...f,
                    brands: on ? f.brands.filter((x) => x !== b.slug) : [...f.brands, b.slug],
                  }))
                }
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${b.name}${on ? ', selected' : ''}`}
              >
                <View style={[styles.brandAvatar, on && styles.brandAvatarOn]}>
                  <Text variant="bodyStrong" color={on ? 'onPrimary' : 'textPrimary'}>
                    {initials(b.name)}
                  </Text>
                </View>
                <Text variant="caption" numberOfLines={1} align="center">
                  {b.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <View style={styles.countRow}>
        <Text variant="bodyStrong">
          {items.length} item{items.length === 1 ? '' : 's'}
        </Text>
        <Text variant="caption" color="textSecondary">
          {sortLabel}
        </Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Sticky chrome: the back/title/search/cart row and the tab strip. */}
      <View style={styles.topRow}>
        <IconButton name="arrow-back" onPress={() => router.push('/(tabs)')} accessibilityLabel="Back to all departments" />
        <Text variant="h2" numberOfLines={1} style={styles.flex}>
          {title}
        </Text>
        <IconButton name="search" onPress={() => router.push('/(tabs)/search')} accessibilityLabel="Search" />
        <View>
          <IconButton
            name="bag-handle-outline"
            onPress={() => router.push(`/(tabs)/cart?department=${DEPARTMENT}`)}
            accessibilityLabel={`Basket, ${basket.itemCount} items`}
          />
          {basket.itemCount > 0 ? (
            <View style={styles.cartBadge} pointerEvents="none">
              <Text variant="labelSm" color="onPrimary">
                {basket.itemCount > 9 ? '9+' : basket.itemCount}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {categories.data && categories.data.length > 0 ? (
        <View style={styles.tabsWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
            <Tab label="All" active={!categoryId} onPress={() => setCategoryId(undefined)} />
            {categories.data.map((c: CategoryView) => (
              <Tab
                key={c.id}
                label={c.name}
                active={categoryId === c.id}
                onPress={() => setCategoryId(c.id)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {products.isLoading ? (
        <View style={styles.skelGrid}>
          {header}
          <View style={styles.skelRow}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={styles.skelCell}>
                <ProductCardSkeleton />
              </View>
            ))}
          </View>
        </View>
      ) : (
        <StateView
          error={products.error}
          isEmpty={allItems.length > 0 && items.length === 0}
          empty={
            <View style={styles.noResults}>
              {header}
              <View style={styles.noResultsBody}>
                <Icon name="search-outline" size={30} color={theme.colors.textTertiary} />
                <Text variant="h3" align="center" style={styles.noResultsTitle}>
                  Nothing matches those filters
                </Text>
                <Text variant="body" color="textSecondary" align="center">
                  Try widening the size or price range.
                </Text>
                <Pressable style={styles.clearBtn} onPress={() => setFilters(EMPTY_FILTERS)}>
                  <Text variant="label" color="onPrimary">
                    Clear filters
                  </Text>
                </Pressable>
              </View>
            </View>
          }
          onRetry={() => products.refetch()}
        >
          <FlashList
            data={items}
            numColumns={2}
            estimatedItemSize={280}
            keyExtractor={(p) => p.id}
            ListHeaderComponent={header}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
            }
            renderItem={({ item }: { item: ProductView }) => (
              <View style={styles.cell}>
                <ProductCard
                  variant="grid"
                  eyebrow={item.brandName}
                  imageHeight={CARD_IMAGE_HEIGHT}
                  name={item.name}
                  unit={item.unit}
                  price={item.price}
                  original={item.basePrice}
                  imageUrl={item.imageUrl}
                  inStock={item.inStock}
                  favorite={wishlistIds.includes(item.id)}
                  onToggleFavorite={() => toggleWish(item.id)}
                  quantity={qtyByProduct.get(item.defaultVariantId ?? '') ?? 0}
                  busy={busyVariantId === item.defaultVariantId}
                  onPress={() => openProduct(item)}
                  onAdd={() => addProduct(item)}
                  onIncrement={() =>
                    setQty(item.defaultVariantId ?? '', (qtyByProduct.get(item.defaultVariantId ?? '') ?? 0) + 1)
                  }
                  onDecrement={() =>
                    setQty(item.defaultVariantId ?? '', (qtyByProduct.get(item.defaultVariantId ?? '') ?? 0) - 1)
                  }
                />
              </View>
            )}
          />
        </StateView>
      )}

      {basket.itemCount > 0 ? (
        <View style={styles.footer}>
          <CTABar
            leftTop={`${basket.itemCount} item${basket.itemCount === 1 ? '' : 's'}`}
            leftBottom={formatPKR(basket.subtotal)}
            buttonLabel="View Cart  →"
            onPress={() => router.push(`/(tabs)/cart?department=${DEPARTMENT}`)}
          />
        </View>
      ) : null}

      <SortSheet
        visible={sheet === 'sort'}
        value={filters.sort}
        onPick={(sort) => setFilters((f) => ({ ...f, sort }))}
        onClose={() => setSheet('none')}
      />
      <FilterSheet
        visible={sheet === 'filters'}
        filters={filters}
        brands={brands}
        resultCount={items.length}
        onChange={setFilters}
        onReset={() => setFilters(EMPTY_FILTERS)}
        onClose={() => setSheet('none')}
      />
    </SafeAreaView>
  );
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={[styles.tab, active && styles.tabActive]}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      // RN Web drops accessibilityState, so carry the selected state in the
      // label too (belt and braces, as in cart.tsx) — otherwise a web screen
      // reader announces a role="tab" with no aria-selected.
      accessibilityLabel={`${label}${active ? ', selected' : ''}`}
    >
      <Text variant="label" color={active ? 'textPrimary' : 'textSecondary'}>
        {label}
      </Text>
    </Pressable>
  );
}

function FilterPill({
  label,
  leading,
  trailing,
  badge,
  active,
  onPress,
}: {
  label: string;
  leading?: 'list-outline';
  trailing?: 'chevron-down' | 'chevron-forward';
  badge?: number;
  active?: boolean;
  onPress: () => void;
}) {
  const ink = active ? theme.colors.primary : theme.colors.textPrimary;
  return (
    <Pressable
      style={[styles.filterPill, active && styles.filterPillActive]}
      onPress={onPress}
      accessibilityRole="button"
    >
      {leading ? <Icon name={leading} size={13} color={ink} /> : null}
      <Text variant="labelSm" style={{ color: ink }}>
        {label}
      </Text>
      {badge ? (
        <View style={styles.pillBadge}>
          <Text variant="labelSm" color="onPrimary" style={styles.pillBadgeText}>
            {badge}
          </Text>
        </View>
      ) : null}
      {trailing ? <Icon name={trailing} size={13} color={ink} /> : null}
    </Pressable>
  );
}

const initials = (name: string): string =>
  name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.layout.margin,
    paddingVertical: theme.spacing.sm,
  },
  cartBadge: {
    position: 'absolute',
    right: -1,
    top: -1,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabsWrap: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  tabs: { gap: theme.spacing.lg, paddingHorizontal: theme.layout.margin },
  tab: { paddingBottom: theme.spacing.md, borderBottomWidth: 2.5, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: theme.colors.textPrimary },

  headerBlock: { gap: theme.spacing.md, paddingTop: theme.spacing.md },
  filterRow: { gap: theme.spacing.sm, paddingHorizontal: theme.layout.margin },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 7,
  },
  filterPillActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.infoSoft },
  pillBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  pillBadgeText: { fontSize: 10, lineHeight: 16 },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.infoSoft,
    borderWidth: 1,
    borderColor: theme.colors.primarySoft,
    borderRadius: theme.radii.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 7,
  },
  clearAll: { justifyContent: 'center', paddingHorizontal: theme.spacing.sm },

  banner: {
    marginHorizontal: theme.layout.margin,
    height: 96,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.accent,
    padding: theme.spacing.lg,
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  bannerTitle: { maxWidth: 220 },
  bannerBadge: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.promo,
    borderRadius: theme.radii.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 4,
  },
  bannerBadgeText: { color: theme.colors.onPromo },

  brandRail: { gap: theme.spacing.lg, paddingHorizontal: theme.layout.margin },
  brandItem: { width: 64, alignItems: 'center', gap: theme.spacing.sm },
  brandAvatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandAvatarOn: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },

  countRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: theme.layout.margin,
    paddingTop: theme.spacing.xs,
  },

  list: { paddingHorizontal: theme.spacing.sm, paddingBottom: 140 },
  cell: { flex: 1, padding: theme.spacing.sm },
  skelGrid: { flex: 1 },
  skelRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: theme.spacing.sm },
  skelCell: { width: '50%', padding: theme.spacing.sm },

  noResults: { flex: 1 },
  noResultsBody: { alignItems: 'center', gap: theme.spacing.sm, paddingHorizontal: theme.layout.margin, paddingTop: theme.spacing['2xl'] },
  noResultsTitle: { marginTop: theme.spacing.md },
  clearBtn: {
    marginTop: theme.spacing.lg,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radii.pill,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
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
