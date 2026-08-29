import { useState } from 'react';
import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ProductView } from '@haala/shared';
import { Chip, EmptyState, Icon, ProductCard, SearchBar, Skeleton, Text, theme } from '@haala/ui';
import { catalogApi } from '../../src/api/endpoints';
import { qk } from '../../src/api/queryKeys';
import { useDebouncedValue } from '../../src/hooks/useDebouncedValue';
import { useProductActions } from '../../src/hooks/useProductActions';
import { useSearchStore } from '../../src/store/useSearchStore';
import { useCurrentStore } from '../../src/store/useCurrentStore';

/** Shown before the user has typed anything, alongside their own history. */
const POPULAR = ['Milk', 'Eggs', 'Bread', 'Bananas', 'Rice', 'Chicken', 'Yogurt', 'Tomatoes'];

/** Below this length a query isn't specific enough to be worth a round trip. */
const MIN_QUERY = 2;

export default function SearchScreen() {
  const router = useRouter();
  const { storeId } = useCurrentStore();
  const [term, setTerm] = useState('');
  const debounced = useDebouncedValue(term, 300);
  const { recents, addRecent, removeRecent, clearRecents } = useSearchStore();
  const { qtyByProduct, busyProductId, addOne, setQty } = useProductActions(storeId);

  const query = debounced.trim();
  const active = query.length >= MIN_QUERY;

  const results = useQuery({
    queryKey: qk.products(storeId ?? 'none', undefined, query),
    queryFn: () => catalogApi.products({ storeId: storeId as string, q: query }),
    enabled: !!storeId && active,
  });

  const submit = (value: string) => {
    setTerm(value);
    addRecent(value);
  };

  const items = results.data?.items ?? [];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <SearchBar
          value={term}
          onChangeText={setTerm}
          onClear={() => setTerm('')}
          autoFocus
          placeholder="Search for milk, eggs, bread…"
        />
      </View>

      {!active ? (
        <View style={styles.suggestions}>
          {recents.length > 0 ? (
            <View style={styles.block}>
              <View style={styles.blockHeader}>
                <Text variant="labelCaps" color="textSecondary">
                  Recent
                </Text>
                <Pressable onPress={clearRecents} hitSlop={8}>
                  <Text variant="label" color="textSecondary">
                    Clear
                  </Text>
                </Pressable>
              </View>
              {recents.map((r) => (
                <Pressable key={r} style={styles.recentRow} onPress={() => submit(r)}>
                  <Icon name="time-outline" size={18} color={theme.colors.textTertiary} />
                  <Text variant="body" style={styles.flex} numberOfLines={1}>
                    {r}
                  </Text>
                  <Pressable
                    onPress={() => removeRecent(r)}
                    hitSlop={10}
                    accessibilityLabel={`Remove ${r} from recent searches`}
                  >
                    <Icon name="close" size={16} color={theme.colors.textTertiary} />
                  </Pressable>
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={styles.block}>
            <Text variant="labelCaps" color="textSecondary">
              Popular
            </Text>
            <View style={styles.popular}>
              {POPULAR.map((p) => (
                <Chip key={p} label={p} onPress={() => submit(p)} />
              ))}
            </View>
          </View>
        </View>
      ) : results.isLoading ? (
        <GridSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          emoji="🔍"
          title={`No results for “${query}”`}
          subtitle="Try a different spelling or a broader term."
        />
      ) : (
        <View style={styles.flex}>
          <FlashList
            data={items}
            numColumns={2}
            estimatedItemSize={250}
            keyExtractor={(p) => p.id}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
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
                  onPress={() => {
                    addRecent(query);
                    router.push(`/product/${item.id}`);
                  }}
                  onAdd={() => addOne(item.id)}
                  onIncrement={() => setQty(item.id, (qtyByProduct.get(item.id) ?? 0) + 1)}
                  onDecrement={() => setQty(item.id, (qtyByProduct.get(item.id) ?? 0) - 1)}
                />
              </View>
            )}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

function GridSkeleton() {
  return (
    <View style={styles.skelWrap}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={styles.skelCell}>
          <View style={styles.skelCard}>
            <Skeleton height={120} radius={theme.radii.sm} />
            <Skeleton width="80%" height={14} />
            <Skeleton width="50%" height={12} />
            <Skeleton width="60%" height={18} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  header: { paddingHorizontal: theme.layout.margin, paddingVertical: theme.spacing.md },
  suggestions: { paddingHorizontal: theme.layout.margin, gap: theme.layout.sectionGap },
  block: { gap: theme.spacing.md },
  blockHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  popular: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  list: { paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing['2xl'] },
  cell: { flex: 1, padding: theme.spacing.sm },
  skelWrap: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: theme.spacing.md },
  // `flex: 1` collapses to full width inside a wrapping row — pin to half.
  skelCell: { width: '50%', padding: theme.spacing.sm },
  skelCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    ...theme.elevation.card,
  },
});
