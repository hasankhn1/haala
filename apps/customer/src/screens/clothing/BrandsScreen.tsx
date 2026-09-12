import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ProductView } from '@haala/shared';
import { Icon, IconButton, SearchBar, StateView, Text, theme } from '@haala/ui';
import { catalogApi } from '../../api/endpoints';
import { qk } from '../../api/queryKeys';
import { useCurrentStore } from '../../store/useCurrentStore';

interface BrandRow {
  slug: string;
  name: string;
  count: number;
  hasDeal: boolean;
}

/**
 * The Brands directory — one of the three ways into a brand the comp draws
 * (the others are the listing's brand rail and search). Featured cards on top,
 * a full A–Z list below.
 *
 * Brands and their counts are derived from the department's product listing.
 * A dedicated `/categories/:dept/brands` endpoint with authoritative counts is
 * the backend's to add; this reads what the catalogue already returns.
 */
export function BrandsScreen({ department }: { department: string }) {
  const router = useRouter();
  const { storeId } = useCurrentStore();

  const products = useQuery({
    queryKey: qk.products(storeId ?? 'none', undefined, undefined, department),
    // The whole directory is derived from this listing — pull the max page so
    // brands past the default 20-row slice still appear. See ClothingScreen.
    queryFn: () => catalogApi.products({ storeId: storeId as string, department, pageSize: 100 }),
    enabled: !!storeId,
  });

  const brands: BrandRow[] = useMemo(() => {
    const by = new Map<string, BrandRow>();
    for (const p of products.data?.items ?? []) {
      const row = by.get(p.brandSlug) ?? { slug: p.brandSlug, name: p.brandName, count: 0, hasDeal: false };
      row.count += 1;
      if (p.basePrice > p.price) row.hasDeal = true;
      by.set(p.brandSlug, row);
    }
    return [...by.values()];
  }, [products.data]);

  const featured = useMemo(
    () => [...brands].sort((a, b) => b.count - a.count).slice(0, 4),
    [brands],
  );
  const alphabetical = useMemo(
    () => [...brands].sort((a, b) => a.name.localeCompare(b.name)),
    [brands],
  );

  const openBrand = (b: BrandRow) =>
    router.push(`/(tabs)/department/${department}?brand=${b.slug}`);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <IconButton name="arrow-back" onPress={() => router.back()} accessibilityLabel="Back" />
          <Text variant="h2" style={styles.flex}>
            Brands
          </Text>
        </View>
        <SearchBar onPress={() => router.push('/(tabs)/search')} placeholder="Search brands" />
      </View>

      <StateView
        loading={products.isLoading}
        error={products.error}
        isEmpty={brands.length === 0}
        onRetry={() => products.refetch()}
      >
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Text variant="bodyStrong">Featured</Text>
          <View style={styles.featuredGrid}>
            {featured.map((b) => (
              <Pressable key={b.slug} style={styles.featuredCard} onPress={() => openBrand(b)}>
                <View style={styles.avatar}>
                  <Text variant="bodyStrong">{initials(b.name)}</Text>
                </View>
                <Text variant="bodyStrong" numberOfLines={1} style={styles.featuredName}>
                  {b.name}
                </Text>
                <Text variant="caption" color="textSecondary">
                  {b.count} item{b.count === 1 ? '' : 's'}
                </Text>
                {b.hasDeal ? (
                  <View style={styles.dealBadge}>
                    <Text variant="labelSm" style={styles.dealBadgeText}>
                      On sale
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            ))}
          </View>

          <Text variant="bodyStrong" style={styles.azHead}>
            All brands · A–Z
          </Text>
          <View>
            {alphabetical.map((b) => (
              <Pressable key={b.slug} style={styles.row} onPress={() => openBrand(b)}>
                <View style={styles.avatarSm}>
                  <Text variant="labelSm">{initials(b.name)}</Text>
                </View>
                <View style={styles.flex}>
                  <Text variant="bodyStrong">{b.name}</Text>
                  <Text variant="caption" color="textSecondary">
                    {b.count} item{b.count === 1 ? '' : 's'}
                  </Text>
                </View>
                <Icon name="chevron-forward" size={16} color={theme.colors.textTertiary} />
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </StateView>
    </SafeAreaView>
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
  header: { paddingHorizontal: theme.layout.margin, paddingBottom: theme.spacing.md, gap: theme.spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  body: { paddingHorizontal: theme.layout.margin, paddingBottom: theme.spacing['3xl'], gap: theme.spacing.md },
  featuredGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md },
  featuredCard: {
    width: '47%',
    flexGrow: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: 5,
  },
  featuredName: { marginTop: theme.spacing.sm },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dealBadge: {
    alignSelf: 'flex-start',
    marginTop: theme.spacing.sm,
    backgroundColor: theme.colors.promo,
    borderRadius: theme.radii.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 3,
  },
  dealBadgeText: { color: theme.colors.onPromo },
  azHead: { marginTop: theme.spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  avatarSm: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
