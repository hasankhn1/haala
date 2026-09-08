import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatPKR, type BannerView, type ProductView } from '@haala/shared';
import { Icon, ProductCard, Text, Thumb, theme } from '@haala/ui';
import { catalogApi, ordersApi } from '../../src/api/endpoints';
import { qk } from '../../src/api/queryKeys';
import { useAuth } from '../../src/auth/AuthContext';
import { DepartmentsSheet } from '../../src/components/DepartmentsSheet';
import { useProductActions } from '../../src/hooks/useProductActions';
import { toDepartment, type Department } from '../../src/lib/departments';
import { useCurrentStore } from '../../src/store/useCurrentStore';

/**
 * The marketplace home, from `Haala Home.dc.html`.
 *
 * The design states the idea in one line: **"Haala is the brand. Grocery is a
 * department."** So this screen is a directory of departments rather than a
 * grocery catalogue — the catalogue moved, unchanged, to
 * `src/screens/DepartmentScreen.tsx`.
 *
 * The order below is the comp's, and each section is real data or absent:
 *
 *   1. a **horizontal rail** of 210px department cards, live departments only
 *   2. **All N** → every department including the unavailable ones, in a sheet
 *   3. **Popular categories** — chips, tinted by the department they belong to
 *   4. **Promos** — the banners ops manages on the dashboard's Homepage page
 *   5. **Popular right now** — a two-column grid across every live department
 *
 * One request feeds all five (`GET /catalog/home`), so the screen settles once
 * rather than in five separate jerks, and the payload is cached per store.
 *
 * **Corrections to an earlier version of this file, worth naming because they
 * were mine.** It stacked the department cards full-width instead of the comp's
 * rail; it replaced "All 3" with a plain count; and it invented a "Coming soon"
 * section on the home itself, which is information architecture the design does
 * not have — the sheet is where the full range belongs.
 *
 * **Localised, not copied.** The comp is written for Dubai in AED; this is
 * Peshawar in PKR through `formatPKR`. Same call as `+971` → `+92` in the auth
 * comps.
 */

/*
 * A note on image height, because the comp says something this screen cannot do.
 *
 * The comp draws grocery's photos at 150px and everything else at 180px, and
 * the reason is sound — a garment photographed on a person needs vertical room
 * a tin does not. It works there because the comp is a CSS grid, where the row
 * decides its own height and the cells align regardless.
 *
 * React Native has no grid. This is `flexWrap`, where a taller card pushes only
 * its own column down, and mixing 150 with 180 on the one screen that is
 * deliberately cross-department produced a visibly staggered mess. So the
 * marketplace grid uses one height for every card. `ProductCard` keeps the
 * `imageHeight` prop for a department's own grid, where every card shares a
 * department and the rows stay square.
 */

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { address, outOfArea, storeId } = useCurrentStore();
  const [refreshing, setRefreshing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const home = useQuery({
    queryKey: qk.home(storeId),
    queryFn: () => catalogApi.home(storeId),
    staleTime: 5 * 60_000,
  });

  const { cart, qtyByProduct, busyVariantId, addProduct } = useProductActions(storeId);

  /*
   * "Buy it again", on its own request rather than inside the home payload.
   *
   * That payload is cached per store and shared by everyone near it; order
   * history in it would serve one customer's shopping to the next person to
   * open the app. Signed out, or before a store resolves, the query does not
   * run and the row is simply absent.
   */
  const recommended = useQuery({
    queryKey: qk.recentlyOrdered(storeId),
    queryFn: () => ordersApi.recentlyOrdered(storeId as string),
    enabled: Boolean(user && storeId),
    staleTime: 5 * 60_000,
  });

  const departments: Department[] = useMemo(
    () => (home.data?.departments ?? []).map(toDepartment),
    [home.data],
  );
  const live = departments.filter((d) => d.isLive);
  const nameByKey = useMemo(
    () => new Map(departments.map((d) => [d.key, d.name])),
    [departments],
  );
  const tintFor = (key: string) =>
    departments.find((d) => d.key === key)?.tint ?? theme.departmentTintMuted;

  const banners = home.data?.banners ?? [];
  const chips = home.data?.popularCategories ?? [];
  const popular = home.data?.popularProducts ?? [];
  const itemCount = (cart.data?.baskets ?? []).reduce((n, b) => n + b.itemCount, 0);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await home.refetch();
    setRefreshing(false);
  }, [home]);

  const city = address?.area ?? 'DHA Peshawar';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <View style={styles.brand}>
            <View style={styles.mark}>
              <Text variant="bodyStrong" color="onPrimary">
                H
              </Text>
            </View>
            <Text variant="h2" style={styles.wordmark}>
              HAALA
            </Text>
          </View>

          <View style={styles.headerActions}>
            <Pressable
              style={styles.circle}
              onPress={() => router.push('/notifications')}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
            >
              <Icon name="notifications-outline" size={16} color={theme.colors.textPrimary} />
            </Pressable>
            <Pressable
              style={styles.circle}
              onPress={() => router.push('/(tabs)/cart')}
              accessibilityRole="button"
              accessibilityLabel={`Basket, ${itemCount} ${itemCount === 1 ? 'item' : 'items'}`}
            >
              <Icon name="bag-handle-outline" size={16} color={theme.colors.textPrimary} />
              {itemCount > 0 ? (
                <View style={styles.badge}>
                  <Text variant="caption" color="onPrimary" style={styles.badgeText}>
                    {itemCount > 9 ? '9+' : itemCount}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </View>
        </View>

        {/* Where it is going, which is the first thing that decides whether any
            of this is even orderable. */}
        <Pressable
          style={styles.deliverTo}
          onPress={() => router.push(user ? '/addresses' : '/login')}
          accessibilityRole="button"
        >
          <Icon name="location-outline" size={15} color={theme.colors.primary} />
          <Text variant="bodySm" color="textSecondary">
            Delivering to
          </Text>
          <Text variant="bodyStrong" numberOfLines={1} style={styles.deliverToWhere}>
            {address?.area ?? (user ? 'Add an address' : 'DHA Peshawar')}
          </Text>
          <Icon name="chevron-down" size={13} color={theme.colors.textPrimary} />
        </Pressable>

        <Pressable
          style={styles.search}
          onPress={() => router.push('/(tabs)/search')}
          accessibilityRole="search"
          accessibilityLabel="Search products or shops"
        >
          <Icon name="search-outline" size={17} color={theme.colors.textSecondary} />
          <Text variant="body" color="textTertiary">
            Search products or shops
          </Text>
        </Pressable>

        {outOfArea ? (
          <View style={styles.notice}>
            <Icon name="alert-circle-outline" size={17} color={theme.colors.textAlert} />
            <Text variant="bodySm" style={styles.noticeText}>
              We don’t deliver to your saved address yet. You can still browse everything below.
            </Text>
          </View>
        ) : null}

        {/* ── Departments ─────────────────────────────────────────────────── */}
        <View style={styles.deptSection}>
          <View style={styles.sectionHead}>
            <Text variant="h2">What are you shopping for?</Text>
            {departments.length > 0 ? (
              <Pressable
                onPress={() => setSheetOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={`See all ${departments.length} departments`}
              >
                <Text variant="labelSm" style={styles.allLink}>
                  All {departments.length}
                </Text>
              </Pressable>
            ) : null}
          </View>

          {home.isLoading ? (
            <Text variant="bodySm" color="textTertiary" style={styles.gutter}>
              Loading departments…
            </Text>
          ) : null}

          {/*
            Live departments only. A card in the rail is a door; a department
            with nothing in it is a promise, and the two do not belong in the
            same row. The promises are in the sheet behind "All N".
          */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.rail}
          >
            {live.map((d) => (
              <DepartmentCard
                key={d.key}
                dept={d}
                onPress={() => router.push(`/department/${d.key}`)}
              />
            ))}
          </ScrollView>
        </View>

        {/* ── Popular categories ──────────────────────────────────────────── */}
        {chips.length > 0 ? (
          <View style={styles.section}>
            <Text variant="h3" style={styles.sectionTitle}>
              Popular categories
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {chips.map((c) => (
                <Pressable
                  key={c.id}
                  style={styles.chip}
                  onPress={() => router.push(`/department/${c.departmentKey}?categoryId=${c.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`${c.name} in ${nameByKey.get(c.departmentKey) ?? c.departmentKey}`}
                >
                  <View style={[styles.chipTile, { backgroundColor: tintFor(c.departmentKey) }]}>
                    <Icon
                      name="pricetag-outline"
                      size={13}
                      color={theme.colors.textInverse}
                      strokeWidth={2}
                    />
                  </View>
                  {/* Bold, per the comp: the chip is a control, and its label
                      carries the same weight as the button text it behaves like. */}
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {c.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* ── Promos ──────────────────────────────────────────────────────── */}
        {/* Fed by the banners ops manages on the dashboard. No banners means no
            row — a placeholder promo is an advertisement for nothing. */}
        {banners.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.promoRow}
          >
            {banners.map((b) => (
              <PromoCard
                key={b.id}
                banner={b}
                tint={b.departmentKey ? tintFor(b.departmentKey) : theme.colors.primary}
                departmentName={b.departmentKey ? nameByKey.get(b.departmentKey) : undefined}
                onPress={b.linkTo ? () => router.push(b.linkTo as never) : undefined}
              />
            ))}
          </ScrollView>
        ) : null}

        {/* ── Popular right now ───────────────────────────────────────────── */}
        {popular.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text variant="h3">Popular right now</Text>
              <Text variant="labelSm" color="textSecondary">
                across {live.length} {live.length === 1 ? 'department' : 'departments'}
              </Text>
            </View>
            <View style={styles.grid}>
              {popular.map((p) => (
                <View key={p.id} style={styles.gridCell}>
                  <ProductCard
                    name={p.name}
                    // The comp puts the department where the unit usually goes.
                    unit=""
                    eyebrow={nameByKey.get(p.departmentKey) ?? p.departmentKey}
                    price={p.price}
                    original={p.basePrice > p.price ? p.basePrice : undefined}
                    imageUrl={p.imageUrl}
                    inStock={p.inStock}
                    quantity={qtyByProduct.get(p.defaultVariantId ?? '') ?? 0}
                    busy={busyVariantId === p.defaultVariantId}
                    onPress={() => router.push(`/product/${p.id}`)}
                    onAdd={() => addProduct(p as ProductView)}
                  />
                </View>
              ))}
            </View>
          </View>
        ) : null}
        {/* ── Recommended ─────────────────────────────────────────────────── */}
        {(recommended.data?.items.length ?? 0) > 0 ? (
          <View style={styles.recommend}>
            <View style={styles.recommendHead}>
              <View style={styles.recommendTile}>
                <Icon
                  name="cube-outline"
                  size={19}
                  color={theme.colors.onPromo}
                  strokeWidth={2.2}
                />
              </View>
              <View style={styles.flex}>
                <Text variant="h3">Recommended for you</Text>
                <Text variant="bodySm" color="textSecondary" style={styles.recommendSub}>
                  From your last {recommended.data?.orderCount}{' '}
                  {recommended.data?.orderCount === 1 ? 'order' : 'orders'} across Haala
                </Text>
              </View>
            </View>

            <View style={styles.recommendRow}>
              {recommended.data?.items.map((p) => (
                <Pressable
                  key={p.id}
                  style={({ pressed }) => [styles.recommendCard, pressed && styles.cardPressed]}
                  onPress={() => router.push(`/product/${p.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`${p.name}, ${nameByKey.get(p.departmentKey) ?? p.departmentKey}, ${formatPKR(p.price)}`}
                >
                  <View style={styles.recommendImage}>
                    <Thumb imageUrl={p.imageUrl} name={p.name} fill radius={theme.radii.xs} />
                  </View>
                  <Text variant="labelCaps" color="textTertiary" numberOfLines={1}>
                    {nameByKey.get(p.departmentKey) ?? p.departmentKey}
                  </Text>
                  {/*
                    A deliberate departure from the comp, which draws only a
                    photo, a department and a price. That card is photo-led and
                    works when every product has photography; ours often do not,
                    and two cards then read as an identical "GROCERY, PKR 1,250".
                    Two lines, so a long name is not truncated into ambiguity.
                  */}
                  <Text variant="bodySm" numberOfLines={2}>
                    {p.name}
                  </Text>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {formatPKR(p.price)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>

      <DepartmentsSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        departments={departments}
        city={city}
        onOpen={(key) => {
          setSheetOpen(false);
          router.push(`/department/${key}`);
        }}
      />
    </SafeAreaView>
  );
}

/**
 * One department, as a shopfront.
 *
 * Full-bleed colour in the department's own tint, 210px wide in a horizontal
 * rail — the card *is* the department's identity, which is why the tint comes
 * from the token map rather than from a semantic role.
 */
function DepartmentCard({ dept, onPress }: { dept: Department; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: dept.tint },
        pressed && styles.cardPressed,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${dept.name}. ${dept.examples}`}
    >
      {/* The comp's soft disc, catching the light in the top corner. */}
      <View style={styles.disc} pointerEvents="none" />

      <View style={styles.cardIcon}>
        <Icon name={dept.icon} size={22} color={theme.colors.textInverse} strokeWidth={1.9} />
      </View>

      <Text variant="h2" color="textInverse" style={styles.cardName}>
        {dept.name}
      </Text>
      <Text variant="bodySm" style={styles.cardExamples} numberOfLines={2}>
        {dept.examples}
      </Text>

      <View style={styles.cardFoot}>
        <View style={styles.cardCta}>
          <Text variant="labelSm" style={{ color: dept.tint }}>
            {dept.cta}
          </Text>
        </View>
        <Icon name="chevron-forward" size={15} color="rgba(255,255,255,0.85)" />
      </View>

      {dept.flag ? (
        <View style={styles.flag}>
          {/* `labelSm` for the weight, then overridden down to the comp's 9.5px.
              `caption` is the right size but regular, and the flag is the one
              thing on the card that has to read at a glance. */}
          <Text variant="labelSm" style={styles.flagText}>
            {dept.flag}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** A promo card, 290×104, its artwork bleeding off the right edge. */
function PromoCard({
  banner,
  tint,
  departmentName,
  onPress,
}: {
  banner: BannerView;
  tint: string;
  departmentName?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.promo,
        { backgroundColor: tint },
        pressed && onPress ? styles.cardPressed : null,
      ]}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={banner.title}
    >
      <Text variant="labelCaps" style={styles.promoDept}>
        {departmentName ?? 'Haala'}
      </Text>
      {/* The comp caps the caption at 150px because artwork occupies the right
          120px of the card. With no artwork there is nothing to make room for,
          so the caption gets the card — otherwise a perfectly short line like
          "Free delivery on your first order" truncates against empty space. */}
      <Text
        variant="h3"
        color="textInverse"
        style={[styles.promoTitle, banner.imageUrl ? styles.promoTitleNarrow : null]}
        numberOfLines={2}
      >
        {banner.title}
      </Text>
      {banner.badge ? (
        <View style={styles.promoBadge}>
          <Text variant="labelSm" style={styles.promoBadgeText}>
            {banner.badge}
          </Text>
        </View>
      ) : null}

      {banner.imageUrl ? (
        <Image source={{ uri: banner.imageUrl }} style={styles.promoImage} resizeMode="cover" />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  content: { paddingBottom: theme.spacing['2xl'] },
  gutter: { marginHorizontal: theme.layout.margin },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.layout.margin,
    paddingTop: theme.spacing.sm,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mark: {
    width: 28,
    height: 28,
    borderRadius: theme.radii.sm - 4,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: { letterSpacing: 1.2 },
  headerActions: { flexDirection: 'row', gap: 8 },
  circle: {
    width: 34,
    height: 34,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    right: -3,
    top: -3,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { fontSize: 9.5, lineHeight: 17 },

  deliverTo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginHorizontal: theme.layout.margin,
    marginTop: 14,
  },
  deliverToWhere: { flexShrink: 1 },

  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginHorizontal: theme.layout.margin,
    marginTop: 13,
    backgroundColor: theme.colors.surfaceSunken,
    borderRadius: theme.radii.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  notice: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    marginHorizontal: theme.layout.margin,
    marginTop: 14,
    padding: 12,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surfaceAlert,
    borderWidth: 1,
    borderColor: theme.colors.borderAlert,
  },
  noticeText: { flex: 1, color: theme.colors.textAlert, lineHeight: 17 },

  deptSection: { paddingTop: 22 },
  section: { paddingTop: 24 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: theme.layout.margin,
    paddingBottom: 12,
  },
  sectionTitle: { paddingHorizontal: theme.layout.margin, paddingBottom: 12 },
  allLink: { color: theme.colors.info },

  rail: { flexDirection: 'row', gap: 12, paddingHorizontal: theme.layout.margin, paddingBottom: 4 },
  card: {
    width: 210,
    borderRadius: theme.radii.lg,
    padding: 15,
    overflow: 'hidden',
  },
  cardPressed: { opacity: 0.92 },
  disc: {
    position: 'absolute',
    right: -26,
    top: -30,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  cardIcon: {
    width: 42,
    height: 42,
    borderRadius: theme.radii.sm,
    backgroundColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardName: { marginTop: 14 },
  cardExamples: {
    marginTop: 7,
    minHeight: 32,
    lineHeight: 16,
    color: 'rgba(255,255,255,0.82)',
  },
  cardFoot: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 13 },
  cardCta: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.pill,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  flag: {
    position: 'absolute',
    right: 13,
    top: 13,
    backgroundColor: theme.colors.promo,
    borderRadius: theme.radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  flagText: { color: theme.colors.onPromo, fontSize: 9.5, lineHeight: 13, letterSpacing: 0.2 },

  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: theme.layout.margin,
    paddingBottom: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.pill,
    paddingLeft: 9,
    paddingRight: 13,
    paddingVertical: 8,
  },
  chipTile: {
    width: 24,
    height: 24,
    borderRadius: theme.radii.xs - 2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  promoRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: theme.layout.margin,
    paddingTop: 22,
  },
  promo: {
    width: 290,
    height: 104,
    borderRadius: theme.radii.md,
    padding: 14,
    overflow: 'hidden',
  },
  promoDept: { color: 'rgba(255,255,255,0.78)' },
  promoTitle: { marginTop: 8 },
  promoTitleNarrow: { maxWidth: 150 },
  promoBadge: {
    marginTop: 9,
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.promo,
    borderRadius: theme.radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  promoBadgeText: { color: theme.colors.onPromo },
  promoImage: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 120 },

  recommend: {
    marginTop: 24,
    marginHorizontal: theme.layout.margin,
    backgroundColor: theme.colors.infoSoft,
    borderRadius: theme.radii.lg,
    padding: 16,
  },
  recommendHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  recommendTile: {
    width: 38,
    height: 38,
    borderRadius: theme.radii.sm - 2,
    backgroundColor: theme.colors.promo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recommendSub: { marginTop: 3 },
  recommendRow: { flexDirection: 'row', gap: 10, marginTop: 13 },
  recommendCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.sm,
    padding: 8,
    gap: 6,
  },
  recommendImage: {
    height: 66,
    borderRadius: theme.radii.xs,
    backgroundColor: theme.colors.surfaceMuted,
    overflow: 'hidden',
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    paddingHorizontal: theme.layout.margin,
  },
  /** Two per row, accounting for the 14px gap between the columns. */
  gridCell: { width: '47%', flexGrow: 1 },
});
