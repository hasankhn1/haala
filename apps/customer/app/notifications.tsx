import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NotificationCategory, NotificationType, type NotificationView } from '@haala/shared';
import { Button, Chip, Icon, StateView, Text, theme } from '@haala/ui';
import { notificationsApi } from '../src/api/endpoints';
import { qk } from '../src/api/queryKeys';
import { NotificationTile, NowDotMark } from '../src/components/NotificationTile';

/**
 * The inbox, from `Haala Notifications.dc.html`: category filters, Today and
 * Earlier, a tile per category, and an unread wash with a dot.
 *
 * One deliberate difference from the comp: its phone frames paint the screen
 * ember-50. The canvas here stays white, per the design system's fourth
 * non-negotiable — warmth arrives as the unread wash, not as a page tint.
 */

type Filter = 'all' | NotificationCategory;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: NotificationCategory.Order, label: 'Orders' },
  { key: NotificationCategory.Brand, label: 'Brands' },
  { key: NotificationCategory.Payment, label: 'Payments' },
  { key: NotificationCategory.Offer, label: 'Offers' },
  { key: NotificationCategory.Service, label: 'Service' },
];

/** Types a Haala rider carries out — the comp tags them so nobody waits on a brand. */
const RIDER_TYPES = new Set<string>([
  NotificationType.RiderAssigned,
  NotificationType.OutForDelivery,
  NotificationType.Arriving,
  NotificationType.Arrived,
  NotificationType.Delivered,
]);

const sameDay = (a: Date, b: Date): boolean => a.toDateString() === b.toDateString();

/** "now" · "12m" · "3h" · "Yesterday" · "Mon" · "12 Sep" — as the comp abbreviates. */
const when = (iso: string, now: Date): string => {
  const at = new Date(iso);
  const mins = Math.floor((now.getTime() - at.getTime()) / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  if (sameDay(at, now)) return `${Math.floor(mins / 60)}h`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(at, yesterday)) return 'Yesterday';
  if (mins < 7 * 24 * 60) return at.toLocaleDateString('en-US', { weekday: 'short' });
  return at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

export default function NotificationsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');

  // "All" shares its key with the account tab's badge, so the two stay in step.
  const query = useQuery({
    queryKey: filter === 'all' ? qk.notifications : qk.notificationsIn(filter),
    queryFn: () => (filter === 'all' ? notificationsApi.list() : notificationsApi.listIn(filter)),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notifications }),
  });

  const markAll = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notifications }),
  });

  const items = query.data?.items ?? [];
  const unread = query.data?.unreadCount ?? 0;
  const now = new Date();
  const sections = [
    { title: 'Today', data: items.filter((n) => sameDay(new Date(n.createdAt), now)) },
    { title: 'Earlier', data: items.filter((n) => !sameDay(new Date(n.createdAt), now)) },
  ].filter((s) => s.data.length > 0);

  // Nothing at all, as opposed to nothing in this category, gets the full
  // welcome — and no header action or filters, which would have nothing to act on.
  const neverNotified = filter === 'all' && query.isSuccess && items.length === 0;

  const open = (n: NotificationView) => {
    if (!n.readAt) markRead.mutate(n.id);
    const orderId = typeof n.data?.orderId === 'string' ? n.data.orderId : null;
    if (orderId) router.push(`/order/${orderId}`);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Go back">
          <Icon name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </Pressable>
        <Text variant="h2" style={styles.flex}>
          Notifications
        </Text>
        {unread > 0 ? (
          <Pressable
            onPress={() => markAll.mutate()}
            hitSlop={8}
            disabled={markAll.isPending}
            accessibilityRole="button"
          >
            {markAll.isPending ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : (
              <Text variant="labelSm" color="primaryPressed">
                Mark all read
              </Text>
            )}
          </Pressable>
        ) : null}
      </View>

      {neverNotified ? (
        <NeverNotified onShop={() => router.replace('/')} />
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filters}
            style={styles.filterRail}
          >
            {FILTERS.map((f) => (
              <Chip
                key={f.key}
                label={f.label}
                shape="pill"
                tone="accent"
                selected={filter === f.key}
                onPress={() => setFilter(f.key)}
              />
            ))}
          </ScrollView>

          <StateView
            loading={query.isLoading}
            error={query.error}
            isEmpty={items.length === 0}
            onRetry={() => query.refetch()}
            empty={<NothingHere />}
          >
            <SectionList
              sections={sections}
              keyExtractor={(n) => n.id}
              stickySectionHeadersEnabled={false}
              contentContainerStyle={styles.list}
              renderSectionHeader={({ section }) => (
                <Text variant="labelCaps" color="textSecondary" style={styles.sectionHeader}>
                  {section.title}
                </Text>
              )}
              renderItem={({ item }) => <Row item={item} now={now} onPress={() => open(item)} />}
            />
          </StateView>
        </>
      )}
    </SafeAreaView>
  );
}

function Row({ item, now, onPress }: { item: NotificationView; now: Date; onPress: () => void }) {
  const isUnread = item.readAt === null;
  const time = when(item.createdAt, now);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      // The dot and the wash are visual only; say it.
      accessibilityLabel={`${isUnread ? 'Unread. ' : ''}${item.title}. ${item.body}. ${time}`}
      style={({ pressed }) => [styles.row, isUnread && styles.rowUnread, pressed && styles.pressed]}
    >
      <NotificationTile category={item.category} type={item.type} />
      <View style={styles.flex}>
        <View style={styles.titleLine}>
          <Text variant="title" style={styles.flex} numberOfLines={2}>
            {item.title}
          </Text>
          <Text variant="labelSm" color="textTertiary">
            {time}
          </Text>
        </View>
        <Text variant="body" color="textSecondary" style={styles.body}>
          {item.body}
        </Text>
        {RIDER_TYPES.has(item.type) ? (
          <View style={styles.tag}>
            <Text variant="labelSm" color="primaryPressed">
              Haala rider
            </Text>
          </View>
        ) : null}
      </View>
      {isUnread ? <View style={styles.dot} /> : null}
    </Pressable>
  );
}

/** A category with nothing in it yet. */
function NothingHere() {
  return (
    <View style={styles.nothing}>
      <NowDotMark size={64} color={theme.colors.primarySoft} dotColor={theme.colors.primary} />
      <Text variant="title" style={styles.nothingTitle}>
        Nothing here yet
      </Text>
      <Text variant="body" color="textSecondary" style={styles.centered}>
        We'll ping you the moment something needs you.
      </Text>
    </View>
  );
}

/** No notifications ever — the comp's "Sab khair hai". */
function NeverNotified({ onShop }: { onShop: () => void }) {
  return (
    <View style={styles.never}>
      <View style={styles.neverArt}>
        <NowDotMark size={64} color={theme.colors.primary} dotColor={theme.colors.promo} />
      </View>
      <Text variant="h2" style={styles.neverTitle}>
        Sab khair hai
      </Text>
      <Text variant="body" color="textSecondary" style={styles.centered}>
        No notifications yet. Order updates, deals and refunds will land here.
      </Text>
      <Button label="Start shopping" onPress={onShop} style={styles.neverCta} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  pressed: { opacity: 0.85 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.layout.margin,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.layout.elementGap,
  },
  filterRail: { flexGrow: 0 },
  filters: {
    gap: 6,
    paddingHorizontal: theme.layout.margin,
    paddingBottom: theme.spacing.md,
  },
  list: { paddingBottom: theme.spacing['2xl'] },
  sectionHeader: {
    paddingHorizontal: theme.layout.margin,
    paddingTop: theme.spacing.lg,
    paddingBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    paddingHorizontal: theme.layout.margin,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  rowUnread: { backgroundColor: theme.colors.primarySoft },
  titleLine: { flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.sm },
  body: { marginTop: 2 },
  tag: {
    alignSelf: 'flex-start',
    marginTop: 7,
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: theme.colors.primaryTag,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    backgroundColor: theme.colors.primary,
  },
  nothing: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 30 },
  nothingTitle: { marginTop: 14, marginBottom: theme.spacing.xs },
  centered: { textAlign: 'center' },
  never: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  neverArt: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  neverTitle: { marginTop: theme.spacing.xl, marginBottom: 6 },
  neverCta: { marginTop: 22, alignSelf: 'center', paddingHorizontal: 22 },
});
