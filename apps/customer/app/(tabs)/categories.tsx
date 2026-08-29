import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CategoryView } from '@haala/shared';
import { StateView, Text, theme } from '@haala/ui';
import { catalogApi } from '../../src/api/endpoints';
import { qk } from '../../src/api/queryKeys';

// Order matters — first match wins, so the specific patterns come first.
const EMOJI: Array<[RegExp, string]> = [
  [/dry\s*fruit|nut|almond/i, '🥜'],
  [/dairy|milk|egg/i, '🥛'],
  [/bakery|bread/i, '🍞'],
  [/fruit|veg/i, '🥬'],
  [/lentil|pulse|daal|dal|bean/i, '🫘'],
  [/toiletr|hygiene|personal\s*care|soap/i, '🧼'],
  [/sport|fitness/i, '🏏'],
  [/grocer|staple|rice|grain|flour|atta/i, '🍚'],
  [/drink|beverage|juice/i, '🥤'],
  [/snack|biscuit/i, '🍪'],
  [/meat|chicken/i, '🍗'],
  [/clean|detergent|household/i, '🧽'],
  [/baby|diaper/i, '🍼'],
];
const emojiFor = (name: string) => EMOJI.find(([re]) => re.test(name))?.[1] ?? '🛒';

export default function CategoriesScreen() {
  const router = useRouter();
  const categories = useQuery({ queryKey: qk.categories, queryFn: catalogApi.categories });

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text variant="h1">Categories</Text>
      </View>
      <StateView
        loading={categories.isLoading}
        error={categories.error}
        isEmpty={!!categories.data && categories.data.length === 0}
        onRetry={() => categories.refetch()}
      >
        <View style={styles.flex}>
          <FlashList
            data={categories.data ?? []}
            numColumns={3}
            estimatedItemSize={112}
            keyExtractor={(c) => c.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }: { item: CategoryView }) => (
              <View style={styles.cell}>
                <Pressable
                  style={({ pressed }) => [styles.tile, pressed && { opacity: 0.9 }]}
                  onPress={() => router.push(`/products?categoryId=${item.id}`)}
                >
                  <View style={styles.emojiWrap}>
                    <Text style={styles.emoji}>{emojiFor(item.name)}</Text>
                  </View>
                  <Text variant="labelSm" align="center" numberOfLines={2}>
                    {item.name}
                  </Text>
                </Pressable>
              </View>
            )}
          />
        </View>
      </StateView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  header: { padding: theme.spacing.lg },
  list: { paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing['2xl'] },
  cell: { flex: 1, padding: theme.spacing.xs },
  /**
   * Three across rather than two, and sized so a 7-category catalogue is
   * visible without scrolling — the previous 64px medallion plus `xl` vertical
   * padding made a ~150px tile, so only four fitted on screen.
   */
  tile: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.sm,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: 104,
    ...theme.elevation.card,
  },
  emojiWrap: {
    width: 44,
    height: 44,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 22, lineHeight: 28 },
});
