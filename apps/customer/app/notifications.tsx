import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NotificationView } from '@haala/shared';
import { EmptyState, Icon, type IconName, StateView, Text, theme } from '@haala/ui';
import { notificationsApi } from '../src/api/endpoints';
import { qk } from '../src/api/queryKeys';

/** "3m ago" / "2h ago" / "Yesterday" — precise timestamps aren't the point here. */
const ago = (iso: string): string => {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'Yesterday' : `${days}d ago`;
};

const ICON: Record<string, IconName> = {
  order_update: 'cube-outline',
  promo: 'pricetag-outline',
  system: 'information-circle-outline',
};

export default function NotificationsScreen() {
  const router = useRouter();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: qk.notifications,
    queryFn: notificationsApi.list,
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
            style={markAll.isPending && styles.pending}
          >
            {markAll.isPending ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : (
              <Text variant="labelSm">MARK ALL READ</Text>
            )}
          </Pressable>
        ) : null}
      </View>

      <StateView
        loading={query.isLoading}
        error={query.error}
        isEmpty={items.length === 0}
        onRetry={() => query.refetch()}
        empty={
          <EmptyState
            emoji="🔔"
            title="Nothing yet"
            subtitle="Order updates and offers will show up here."
          />
        }
      >
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          renderItem={({ item }) => {
            const isUnread = item.readAt === null;
            return (
              <Pressable
                onPress={() => open(item)}
                style={[styles.row, isUnread && styles.rowUnread]}
              >
                <View style={styles.icon}>
                  <Icon
                    name={ICON[item.type] ?? ICON.system}
                    size={20}
                    color={isUnread ? theme.colors.primary : theme.colors.textSecondary}
                  />
                </View>
                <View style={styles.flex}>
                  <Text variant={isUnread ? 'bodyStrong' : 'body'}>{item.title}</Text>
                  <Text variant="bodySm" color="textSecondary">
                    {item.body}
                  </Text>
                  <Text variant="caption" color="textTertiary">
                    {ago(item.createdAt)}
                  </Text>
                </View>
                {isUnread ? <View style={styles.dot} /> : null}
              </Pressable>
            );
          }}
        />
      </StateView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pending: { opacity: 0.6 },
  safe: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.layout.margin,
    paddingVertical: theme.spacing.md,
  },
  list: { paddingHorizontal: theme.layout.margin, paddingBottom: theme.spacing['2xl'] },
  sep: { height: theme.spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
  },
  /** Unread reads as a tonal lift, not a colour — consistent with StatusBadge. */
  rowUnread: { backgroundColor: theme.colors.accentSoft },
  icon: {
    width: 36,
    height: 36,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.primary,
    marginTop: 6,
  },
});
