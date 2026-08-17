import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatPKR, type OrderView } from '@haala/shared';
import {
  Button,
  Card,
  DeliveryTracker,
  Divider,
  IconButton,
  PriceText,
  StateView,
  StatusBadge,
  Text,
  theme,
  useToast,
} from '@haala/ui';
import { ApiError } from '../../src/api/client';
import { ordersApi } from '../../src/api/endpoints';
import { qk } from '../../src/api/queryKeys';
import { DeliveryMap } from '../../src/components/DeliveryMap';
import { haptics } from '../../src/lib/haptics';
import { useOrderSocket } from '../../src/realtime/useOrderSocket';
import { useCurrentStore } from '../../src/store/useCurrentStore';

/** The four beats the customer-facing rail collapses the order status into. */
const RAIL = [
  { label: 'Placed' },
  { label: 'Picking' },
  { label: 'On the way' },
  { label: 'Delivered' },
];

/** OrderStatus → index on the four-beat rail. */
const RAIL_INDEX: Record<string, number> = {
  placed: 0,
  confirmed: 1,
  preparing: 1,
  packed: 1,
  picked_up: 2,
  out_for_delivery: 2,
  delivered: 3,
};

const CANCELLABLE = new Set(['placed', 'confirmed', 'preparing', 'packed']);
const TERMINAL = new Set(['cancelled', 'failed']);

/**
 * Rough promise per remaining beat, in minutes. Still an estimate — a real ETA
 * needs routing/traffic data we don't have.
 */
const MINUTES_PER_BEAT = 5;

const fmtTime = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const etaMinutes = (order: OrderView): number => {
  const beat = RAIL_INDEX[order.status] ?? 0;
  return Math.max(RAIL.length - 1 - beat, 0) * MINUTES_PER_BEAT;
};

export default function OrderScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const { id, placed } = useLocalSearchParams<{ id: string; placed?: string }>();
  const { store } = useCurrentStore();

  const order = useQuery({
    queryKey: qk.order(id),
    queryFn: () => ordersApi.get(id),
    enabled: !!id,
  });
  const livePosition = useOrderSocket(id, () =>
    qc.invalidateQueries({ queryKey: qk.order(id) }),
  );

  const cancel = useMutation({
    mutationFn: () => ordersApi.cancel(id),
    onSuccess: () => {
      haptics.success();
      toast.show('Order cancelled');
      qc.invalidateQueries({ queryKey: qk.order(id) });
      qc.invalidateQueries({ queryKey: qk.orders });
    },
    onError: (e) => {
      haptics.error();
      toast.show(e instanceof ApiError ? e.message : 'Could not cancel order', 'error');
    },
  });

  const o = order.data;
  const canCancel = o ? CANCELLABLE.has(o.status) : false;
  const live = o ? !TERMINAL.has(o.status) && o.status !== 'delivered' : false;
  const beat = o ? (RAIL_INDEX[o.status] ?? 0) : 0;
  const eta = o ? etaMinutes(o) : 0;

  const rider = o?.rider ?? null;

  // Prefer the live socket ping over the snapshot on the order payload — the
  // order is only refetched on status changes, so its coordinates go stale
  // between them.
  const riderPoint =
    livePosition ??
    (rider?.lat != null && rider?.lng != null
      ? { latitude: rider.lat, longitude: rider.lng }
      : null);

  const callRider = () => {
    if (!rider?.phone) {
      toast.show('Rider details arrive once a rider takes your order');
      return;
    }
    Linking.openURL(`tel:${rider.phone}`).catch(() =>
      toast.show('Could not start the call', 'error'),
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <StateView loading={order.isLoading} error={order.error} onRetry={() => order.refetch()}>
        {o ? (
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            stickyHeaderIndices={[0]}
          >
            {/* Floating app bar over the map */}
            <View style={styles.appBar}>
              <IconButton
                name="arrow-back"
                onPress={() => router.replace('/(tabs)')}
                accessibilityLabel="Back to home"
              />
              <View style={styles.appBarTitle}>
                <Ionicons name="location" size={14} color={theme.colors.primary} />
                <Text variant="labelSm" numberOfLines={1}>
                  {o.deliveryAddress.area}
                </Text>
              </View>
              <View style={styles.appBarSpacer} />
            </View>

            {/* Map canvas — real store + destination; the rider pin lands in Phase 2. */}
            <View style={styles.mapWrap}>
              <DeliveryMap
                destination={{
                  latitude: o.deliveryAddress.latitude,
                  longitude: o.deliveryAddress.longitude,
                }}
                origin={store ? { latitude: store.latitude, longitude: store.longitude } : null}
                rider={riderPoint}
              />
            </View>

            {/* Tracking sheet */}
            <View style={styles.sheet}>
              {placed === '1' ? (
                <View style={styles.placedBanner}>
                  <Ionicons name="checkmark-circle" size={18} color={theme.colors.primary} />
                  <Text variant="labelSm">Order placed — we’ve sent it to the store</Text>
                </View>
              ) : null}

              <View style={styles.etaRow}>
                <View style={styles.flex}>
                  <Text variant="labelCaps" color="textSecondary">
                    {live ? 'Arriving in' : 'Status'}
                  </Text>
                  <Text variant="display">
                    {live ? `${eta || MINUTES_PER_BEAT} mins` : statusHeadline(o.status)}
                  </Text>
                  <Text variant="body" color="textSecondary">
                    {subtitleFor(o.status)}
                  </Text>
                </View>
                <View style={styles.clock}>
                  <Ionicons name="time-outline" size={22} color={theme.colors.primary} />
                </View>
              </View>

              {!TERMINAL.has(o.status) ? (
                <View style={styles.tracker}>
                  <DeliveryTracker steps={RAIL} current={beat} />
                </View>
              ) : (
                <View style={styles.terminal}>
                  <StatusBadge status={o.status} />
                </View>
              )}

              {/* Driver card */}
              <View style={styles.driver}>
                <View style={styles.driverAvatar}>
                  <Ionicons name="person" size={20} color={theme.colors.textSecondary} />
                </View>
                <View style={styles.flex}>
                  <Text variant="bodyStrong">{rider?.name ?? 'Finding a rider'}</Text>
                  <View style={styles.rating}>
                    <Ionicons
                      name={rider ? 'bicycle-outline' : 'time-outline'}
                      size={12}
                      color={theme.colors.textSecondary}
                    />
                    <Text variant="caption" color="textSecondary">
                      {rider
                        ? `${rider.vehicleType ?? 'Rider'} · ${rider.trips} ${
                            rider.trips === 1 ? 'delivery' : 'deliveries'
                          }`
                        : 'Assigned once your order is packed'}
                    </Text>
                  </View>
                </View>
                <IconButton
                  name="call"
                  variant="primary"
                  dimension={44}
                  onPress={callRider}
                  disabled={!rider?.phone}
                  accessibilityLabel="Call rider"
                />
              </View>

              <View style={styles.orderMeta}>
                <View style={styles.metaLeft}>
                  <Ionicons
                    name="bag-handle-outline"
                    size={16}
                    color={theme.colors.textSecondary}
                  />
                  <Text variant="bodySm" color="textSecondary">
                    Order {o.orderNumber}
                  </Text>
                </View>
                <View style={styles.itemsChip}>
                  <Text variant="labelSm" color="textSecondary">
                    {o.items.length} {o.items.length === 1 ? 'Item' : 'Items'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Details below the fold */}
            <View style={styles.details}>
              <Text variant="labelCaps" color="textSecondary">
                Items
              </Text>
              <Card>
                {o.items.map((it, idx) => (
                  <View key={it.productId}>
                    <View style={styles.itemRow}>
                      <Text variant="body" style={styles.flex}>
                        {it.quantity} × {it.name}
                      </Text>
                      <Text variant="body">{formatPKR(it.lineTotal)}</Text>
                    </View>
                    {idx < o.items.length - 1 ? (
                      <Divider style={{ marginVertical: theme.spacing.sm }} />
                    ) : null}
                  </View>
                ))}
                <Divider style={{ marginVertical: theme.spacing.md }} />
                <Row label="Subtotal" value={formatPKR(o.subtotal)} />
                <Row
                  label="Delivery"
                  value={o.deliveryFee === 0 ? 'Free' : formatPKR(o.deliveryFee)}
                />
                <View style={styles.totalRow}>
                  <Text variant="title">Total</Text>
                  <PriceText amount={o.total} variant="price" />
                </View>
                <Text variant="caption" color="textSecondary" style={styles.payNote}>
                  {o.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Paid online'} ·{' '}
                  {o.paymentStatus ?? 'pending'}
                </Text>
              </Card>

              <Text variant="labelCaps" color="textSecondary">
                Delivery address
              </Text>
              <Card>
                <Text variant="bodyStrong" style={styles.capitalize}>
                  {o.deliveryAddress.label}
                </Text>
                <Text variant="bodySm" color="textSecondary">
                  {o.deliveryAddress.line1}, {o.deliveryAddress.area}, {o.deliveryAddress.city}
                </Text>
              </Card>

              <Text variant="caption" color="textTertiary">
                Placed {fmtTime(o.createdAt)}
              </Text>

              {canCancel ? (
                <Button
                  label="Cancel order"
                  variant="secondary"
                  loading={cancel.isPending}
                  onPress={() => cancel.mutate()}
                />
              ) : null}
            </View>
          </ScrollView>
        ) : null}
      </StateView>
    </SafeAreaView>
  );
}

const statusHeadline = (status: string): string =>
  status === 'delivered' ? 'Delivered' : status === 'cancelled' ? 'Cancelled' : 'Failed';

const subtitleFor = (status: string): string => {
  switch (status) {
    case 'placed':
      return 'Waiting for the store to confirm';
    case 'confirmed':
    case 'preparing':
      return 'Your groceries are being picked';
    case 'packed':
      return 'Packed and waiting for a rider';
    case 'picked_up':
    case 'out_for_delivery':
      return 'Driver is on the way';
    case 'delivered':
      return 'Enjoy your groceries';
    case 'cancelled':
      return 'This order was cancelled';
    default:
      return 'This order could not be completed';
  }
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={[styles.itemRow, { marginBottom: theme.spacing.xs }]}>
      <Text variant="body" color="textSecondary" style={styles.flex}>
        {label}
      </Text>
      <Text variant="body">{value}</Text>
    </View>
  );
}

const MAP_HEIGHT = 320;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  scroll: { paddingBottom: theme.spacing['2xl'] },
  capitalize: { textTransform: 'capitalize' },

  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.layout.margin,
    paddingBottom: theme.spacing.md,
    backgroundColor: theme.colors.background,
  },
  appBarTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    ...theme.elevation.card,
  },
  appBarSpacer: { width: 40 },

  mapWrap: {
    height: MAP_HEIGHT,
    marginHorizontal: theme.layout.margin,
    borderRadius: theme.radii.md,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceMuted,
  },

  /** Sheet overlaps the map so the card reads as lifted off it. */
  sheet: {
    marginTop: -theme.spacing['2xl'],
    marginHorizontal: theme.layout.margin,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.xl,
    gap: theme.spacing.lg,
    ...theme.elevation.sheet,
  },
  placedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.xs,
    padding: theme.spacing.md,
  },
  etaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md },
  clock: {
    width: 44,
    height: 44,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tracker: { paddingVertical: theme.spacing.sm },
  terminal: { alignItems: 'flex-start' },

  driver: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.md,
  },
  driverAvatar: {
    width: 44,
    height: 44,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },

  orderMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metaLeft: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  itemsChip: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 3,
  },

  details: {
    paddingHorizontal: theme.layout.margin,
    paddingTop: theme.layout.sectionGap,
    gap: theme.spacing.md,
  },
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing.xs,
  },
  payNote: { marginTop: theme.spacing.sm },
});
