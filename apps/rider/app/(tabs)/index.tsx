import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RiderAvailability, formatPKR, type DeliveryOrderView } from '@haala/shared';
import { Button, EmptyState, Icon, type IconName, StateView, Text, theme, useToast } from '@haala/ui';
import { ApiError } from '../../src/api/client';
import { deliveryApi, riderApi } from '../../src/api/endpoints';
import { qk } from '../../src/api/queryKeys';
import { useLocationBroadcast } from '../../src/hooks/useLocationBroadcast';

/** Rider-facing labels for the delivery states they move through. */
const STATUS_COPY: Record<string, string> = {
  accepted: 'Head to the store',
  en_route_to_store: 'On the way to store',
  at_store: 'Collect the order',
  picked_up: 'Picked up',
  en_route_to_customer: 'On the way to customer',
  arrived: 'At the customer',
};

export default function QueueScreen() {
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const rider = useQuery({ queryKey: qk.rider, queryFn: riderApi.me });
  const queue = useQuery({ queryKey: qk.queue, queryFn: riderApi.queue });

  const active = queue.data?.active ?? [];
  const available = queue.data?.available ?? [];
  const online = rider.data?.availability !== RiderAvailability.Offline;

  // Which store(s) this rider collects from, for the header and empty states.
  const storeLabel =
    queue.data?.stores.map((s) => s.name).join(', ') || rider.data?.storeName || 'your store';

  // Broadcast position only while actually carrying work.
  const broadcast = useLocationBroadcast(active.length > 0);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qk.queue });
    qc.invalidateQueries({ queryKey: qk.rider });
  };

  const toggleOnline = useMutation({
    mutationFn: (next: RiderAvailability) => riderApi.setAvailability({ availability: next }),
    onSuccess: invalidate,
    onError: (e) =>
      toast.show(e instanceof ApiError ? e.message : 'Could not change availability', 'error'),
  });

  const claim = useMutation({
    mutationFn: (orderId: string) => deliveryApi.claim(orderId),
    onSuccess: (assignment) => {
      invalidate();
      router.push(`/delivery/${assignment.id}`);
    },
    onError: (e) =>
      toast.show(e instanceof ApiError ? e.message : 'Could not take this order', 'error'),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([queue.refetch(), rider.refetch()]);
    setRefreshing(false);
  }, [queue, rider]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Shift header — the single most important control in the app. */}
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text variant="h2">{rider.data?.name ?? 'Rider'}</Text>
          <Text variant="bodySm" color="textSecondary" numberOfLines={1}>
            {online ? storeLabel : 'You’re offline'}
            {broadcast === 'denied' ? ' · location off' : ''}
          </Text>
        </View>
        <Pressable
          onPress={() =>
            toggleOnline.mutate(online ? RiderAvailability.Offline : RiderAvailability.Available)
          }
          disabled={toggleOnline.isPending}
          style={[styles.toggle, online ? styles.toggleOn : styles.toggleOff]}
          accessibilityRole="switch"
          accessibilityState={{ checked: online }}
        >
          <View style={[styles.dot, online ? styles.dotOn : styles.dotOff]} />
          <Text variant="labelSm" color={online ? 'onPrimary' : 'textSecondary'}>
            {online ? 'ONLINE' : 'OFFLINE'}
          </Text>
        </Pressable>
      </View>

      <StateView loading={queue.isLoading} error={queue.error} onRetry={() => queue.refetch()}>
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
          {active.length > 0 ? (
            <View style={styles.block}>
              <Text variant="labelCaps" color="textSecondary">
                Current delivery
              </Text>
              {active.map((a) => (
                <Pressable
                  key={a.id}
                  style={styles.activeCard}
                  onPress={() => router.push(`/delivery/${a.id}`)}
                >
                  <View style={styles.rowBetween}>
                    <Text variant="bodyStrong" color="onPrimary">
                      {a.order.orderNumber}
                    </Text>
                    <Icon name="chevron-forward" size={18} color={theme.colors.onPrimary} />
                  </View>
                  <Text variant="h3" style={styles.activeStatus}>
                    {STATUS_COPY[a.status] ?? a.status}
                  </Text>
                  <Text variant="bodySm" style={styles.activeSub} numberOfLines={2}>
                    {a.order.dropoff.line1}, {a.order.dropoff.area}
                  </Text>
                  {a.codAmount !== null ? (
                    <View style={styles.codChip}>
                      <Text variant="labelSm" color="onPrimary">
                        COLLECT {formatPKR(a.codAmount)}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={styles.block}>
            <Text variant="labelCaps" color="textSecondary">
              Available orders
            </Text>

            {!online ? (
              <EmptyState
                emoji="🛵"
                title="You’re offline"
                subtitle="Go online to start receiving orders."
                actionLabel="Go online"
                onAction={() => toggleOnline.mutate(RiderAvailability.Available)}
              />
            ) : active.length > 0 ? (
              <Text variant="body" color="textSecondary">
                Finish your current delivery to see new orders.
              </Text>
            ) : queue.data?.scope === 'unavailable' ? (
              // No home store and no known position — we genuinely can't say
              // which store this rider could collect from, so say that rather
              // than showing a bare empty list.
              <EmptyState
                emoji="📍"
                title="No store assigned"
                subtitle="Ask ops to assign you to a store, or turn on location so we can match you to the nearest one."
              />
            ) : available.length === 0 ? (
              <EmptyState
                emoji="⏳"
                title="Nothing ready yet"
                subtitle={`Packed orders from ${storeLabel} will appear here. Pull down to refresh.`}
              />
            ) : (
              available.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  busy={claim.isPending}
                  onAccept={() => claim.mutate(order.id)}
                />
              ))
            )}
          </View>
        </ScrollView>
      </StateView>
    </SafeAreaView>
  );
}

function OrderCard({
  order,
  onAccept,
  busy,
}: {
  order: DeliveryOrderView;
  onAccept: () => void;
  busy: boolean;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Text variant="bodyStrong">{order.orderNumber}</Text>
        <Text variant="price">{formatPKR(order.total)}</Text>
      </View>

      <View style={styles.legs}>
        <Leg icon="storefront-outline" label="Pickup" value={order.pickup?.name ?? 'Store'} />
        <Leg
          icon="location-outline"
          label="Drop-off"
          value={`${order.dropoff.line1}, ${order.dropoff.area}`}
        />
      </View>

      <View style={styles.metaRow}>
        <Text variant="caption" color="textSecondary">
          {order.itemCount} {order.itemCount === 1 ? 'item' : 'items'}
        </Text>
        <Text variant="caption" color="textSecondary">
          {order.paymentMethod === 'cod' ? `Collect ${formatPKR(order.total)}` : 'Prepaid'}
        </Text>
      </View>

      <Button label="Accept order" onPress={onAccept} loading={busy} />
    </View>
  );
}

function Leg({
  icon,
  label,
  value,
}: {
  icon: IconName;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.leg}>
      <Icon name={icon} size={18} color={theme.colors.textSecondary} />
      <View style={styles.flex}>
        <Text variant="caption" color="textSecondary">
          {label}
        </Text>
        <Text variant="bodySm" numberOfLines={2}>
          {value}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.layout.margin,
    paddingVertical: theme.spacing.md,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    height: 40,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
  },
  toggleOn: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  toggleOff: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotOn: { backgroundColor: theme.colors.onPrimary },
  dotOff: { backgroundColor: theme.colors.textTertiary },

  content: {
    paddingHorizontal: theme.layout.margin,
    paddingBottom: theme.spacing['3xl'],
    gap: theme.layout.sectionGap,
  },
  block: { gap: theme.spacing.md },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  activeCard: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.xl,
    gap: theme.spacing.xs,
  },
  activeStatus: { color: theme.colors.onPrimary },
  activeSub: { color: 'rgba(255,255,255,0.75)' },
  codChip: {
    alignSelf: 'flex-start',
    marginTop: theme.spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: theme.radii.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 3,
  },

  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    ...theme.elevation.card,
  },
  legs: { gap: theme.spacing.md },
  leg: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing.md,
  },
});
