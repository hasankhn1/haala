import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  DeliveryStatus,
  formatPKR,
  type AdvanceDeliveryInput,
  type DeliveryAssignmentView,
  type DeliveryStatus as DeliveryStatusT,
} from '@haala/shared';
import { Button, Icon, IconButton, StateView, Text, theme, useToast } from '@haala/ui';
import { ApiError } from '../../src/api/client';
import { deliveryApi } from '../../src/api/endpoints';
import { qk } from '../../src/api/queryKeys';

/** The subset of statuses a rider may drive, per `advanceDeliverySchema`. */
type AdvanceableStatus = AdvanceDeliveryInput['status'];

/**
 * The delivery run, as one screen with one obvious next action.
 *
 * A rider is on a bike, often in traffic, holding a phone one-handed. So the
 * screen never asks them to choose: it shows where they are in the run and a
 * single full-width button for the next step. `DELIVERY_STATUS_FLOW` on the
 * server is the real gate; this is its rider-legible face.
 */
const STEPS: Array<{ status: DeliveryStatusT; label: string }> = [
  { status: DeliveryStatus.Accepted, label: 'Accepted' },
  { status: DeliveryStatus.EnRouteToStore, label: 'To store' },
  { status: DeliveryStatus.AtStore, label: 'At store' },
  { status: DeliveryStatus.PickedUp, label: 'Picked up' },
  { status: DeliveryStatus.EnRouteToCustomer, label: 'To customer' },
  { status: DeliveryStatus.Arrived, label: 'Arrived' },
  { status: DeliveryStatus.Completed, label: 'Delivered' },
];

/** The single action offered at each state. */
const NEXT_ACTION: Partial<Record<DeliveryStatusT, { next: AdvanceableStatus; label: string }>> = {
  [DeliveryStatus.Accepted]: {
    next: DeliveryStatus.EnRouteToStore,
    label: 'Start — heading to store',
  },
  [DeliveryStatus.EnRouteToStore]: {
    next: DeliveryStatus.AtStore,
    label: 'I’ve arrived at the store',
  },
  [DeliveryStatus.AtStore]: { next: DeliveryStatus.PickedUp, label: 'Order collected' },
  [DeliveryStatus.PickedUp]: {
    next: DeliveryStatus.EnRouteToCustomer,
    label: 'Start — heading to customer',
  },
  [DeliveryStatus.EnRouteToCustomer]: {
    next: DeliveryStatus.Arrived,
    label: 'I’ve arrived at the customer',
  },
  [DeliveryStatus.Arrived]: { next: DeliveryStatus.Completed, label: 'Complete delivery' },
};

export default function DeliveryScreen() {
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();

  // The list is the source of truth for a single assignment — there's no
  // single-assignment GET, and a rider only ever has one in flight.
  const assignments = useQuery({ queryKey: qk.assignments, queryFn: deliveryApi.list });
  const assignment = assignments.data?.find((a) => a.id === id);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qk.assignments });
    qc.invalidateQueries({ queryKey: qk.queue });
    qc.invalidateQueries({ queryKey: qk.rider });
  };

  const advance = useMutation({
    mutationFn: (next: AdvanceableStatus) => deliveryApi.advance(id, { status: next }),
    onSuccess: (updated) => {
      invalidate();
      if (updated.status === DeliveryStatus.Completed) {
        toast.show('Delivery complete');
        router.replace('/(tabs)');
      }
    },
    onError: (e) =>
      toast.show(e instanceof ApiError ? e.message : 'Could not update delivery', 'error'),
  });

  const collectCod = useMutation({
    mutationFn: () => deliveryApi.collectCod(id),
    onSuccess: () => {
      invalidate();
      toast.show('Cash recorded');
    },
    onError: (e) =>
      toast.show(e instanceof ApiError ? e.message : 'Could not record cash', 'error'),
  });

  const call = (phone: string) => {
    Linking.openURL(`tel:${phone}`).catch(() => toast.show('Could not start the call', 'error'));
  };

  const openMaps = (lat: number, lng: number, label: string) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    Linking.openURL(url).catch(() => toast.show(`Could not open ${label}`, 'error'));
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <IconButton name="arrow-back" onPress={() => router.back()} accessibilityLabel="Back" />
        <Text variant="h3" style={styles.flex} numberOfLines={1}>
          {assignment?.order.orderNumber ?? 'Delivery'}
        </Text>
      </View>

      <StateView
        loading={assignments.isLoading}
        error={assignments.error}
        onRetry={() => assignments.refetch()}
        isEmpty={!assignments.isLoading && !assignment}
        empty={
          <View style={styles.center}>
            <Text variant="h3" align="center">
              Delivery not found
            </Text>
            <Button
              label="Back to queue"
              variant="secondary"
              onPress={() => router.replace('/(tabs)')}
            />
          </View>
        }
      >
        {assignment ? (
          <Body
            assignment={assignment}
            advancing={advance.isPending}
            collecting={collectCod.isPending}
            onAdvance={(next) => advance.mutate(next)}
            onCollect={() => collectCod.mutate()}
            onCall={call}
            onNavigate={openMaps}
          />
        ) : null}
      </StateView>
    </SafeAreaView>
  );
}

function Body({
  assignment,
  advancing,
  collecting,
  onAdvance,
  onCollect,
  onCall,
  onNavigate,
}: {
  assignment: DeliveryAssignmentView;
  advancing: boolean;
  collecting: boolean;
  onAdvance: (next: AdvanceableStatus) => void;
  onCollect: () => void;
  onCall: (phone: string) => void;
  onNavigate: (lat: number, lng: number, label: string) => void;
}) {
  const { order } = assignment;
  const stepIndex = STEPS.findIndex((s) => s.status === assignment.status);
  const action = NEXT_ACTION[assignment.status];
  const needsCash = assignment.codAmount !== null && !assignment.codCollected;

  // Before pickup the rider is heading to the store; after, to the customer.
  const headingToStore =
    assignment.status === DeliveryStatus.Accepted ||
    assignment.status === DeliveryStatus.EnRouteToStore ||
    assignment.status === DeliveryStatus.AtStore;

  return (
    <>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Progress rail */}
        <View style={styles.rail}>
          {STEPS.map((s, i) => (
            <View key={s.status} style={styles.railStep}>
              <View
                style={[
                  styles.railDot,
                  i < stepIndex
                    ? styles.railDone
                    : i === stepIndex
                      ? styles.railNow
                      : styles.railTodo,
                ]}
              />
              {i < STEPS.length - 1 ? (
                <View style={[styles.railLine, i < stepIndex ? styles.railLineOn : null]} />
              ) : null}
            </View>
          ))}
        </View>
        <Text variant="h2">{STEPS[stepIndex]?.label ?? assignment.status}</Text>

        {/* Whichever leg is next gets the prominent card */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text variant="labelCaps" color="textSecondary">
              {headingToStore ? 'Pick up from' : 'Deliver to'}
            </Text>
            <Pressable
              onPress={() =>
                headingToStore && order.pickup
                  ? onNavigate(order.pickup.latitude, order.pickup.longitude, 'store')
                  : onNavigate(order.dropoff.latitude, order.dropoff.longitude, 'address')
              }
              hitSlop={8}
            >
              <View style={styles.navLink}>
                <Icon name="navigate" size={14} color={theme.colors.primary} />
                <Text variant="labelSm">Navigate</Text>
              </View>
            </Pressable>
          </View>

          {headingToStore ? (
            <>
              <Text variant="bodyStrong">{order.pickup?.name ?? 'Store'}</Text>
              <Text variant="bodySm" color="textSecondary">
                {order.pickup ? `${order.pickup.area}, ${order.pickup.city}` : '—'}
              </Text>
            </>
          ) : (
            <>
              <Text variant="bodyStrong">{order.customerName}</Text>
              <Text variant="bodySm" color="textSecondary">
                {order.dropoff.line1}
                {order.dropoff.line2 ? `, ${order.dropoff.line2}` : ''}
                {'\n'}
                {order.dropoff.area}, {order.dropoff.city}
              </Text>
              {order.dropoff.notes ? (
                <Text variant="bodySm" color="textSecondary">
                  Note: {order.dropoff.notes}
                </Text>
              ) : null}
              <Button
                label={`Call ${order.customerName.split(' ')[0]}`}
                variant="secondary"
                onPress={() => onCall(order.customerPhone)}
                leadingIcon={<Icon name="call" size={16} color={theme.colors.primary} />}
              />
            </>
          )}
        </View>

        {/* Cash to collect */}
        {assignment.codAmount !== null ? (
          <View style={[styles.card, needsCash ? styles.cashDue : styles.cashDone]}>
            <View style={styles.rowBetween}>
              <View>
                <Text variant="labelCaps" color="textSecondary">
                  Cash on delivery
                </Text>
                <Text variant="display">{formatPKR(assignment.codAmount)}</Text>
                {assignment.tipAmount > 0 ? (
                  <Text variant="bodySm" color="success">
                    Includes {formatPKR(assignment.tipAmount)} tip for you
                  </Text>
                ) : null}
              </View>
              {assignment.codCollected ? (
                <Icon name="checkmark-circle" size={28} color={theme.colors.success} />
              ) : null}
            </View>
            {needsCash ? (
              <Button label="I’ve collected the cash" onPress={onCollect} loading={collecting} />
            ) : (
              <Text variant="bodySm" color="textSecondary">
                Recorded — you can complete the delivery.
              </Text>
            )}
          </View>
        ) : (
          <View style={styles.card}>
            <Text variant="labelCaps" color="textSecondary">
              Payment
            </Text>
            <Text variant="bodyStrong">Prepaid — nothing to collect</Text>
            {assignment.tipAmount > 0 ? (
              <Text variant="bodySm" color="success">
                {formatPKR(assignment.tipAmount)} tip left for you
              </Text>
            ) : null}
          </View>
        )}

        {/* Manifest */}
        <View style={styles.card}>
          <Text variant="labelCaps" color="textSecondary">
            {order.itemCount} {order.itemCount === 1 ? 'item' : 'items'}
          </Text>
          {order.items.map((item) => (
            <View key={`${item.name}-${item.unit}`} style={styles.itemRow}>
              <Text variant="body" style={styles.flex}>
                {item.quantity} × {item.name}
              </Text>
              <Text variant="bodySm" color="textSecondary">
                {item.unit}
              </Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text variant="bodyStrong">Order total</Text>
            <Text variant="price">{formatPKR(order.total)}</Text>
          </View>
        </View>
      </ScrollView>

      {/* One action, always in the same place */}
      {action ? (
        <View style={styles.footer}>
          <Button
            label={action.label}
            onPress={() => onAdvance(action.next)}
            loading={advancing}
            disabled={action.next === DeliveryStatus.Completed && needsCash}
          />
          {action.next === DeliveryStatus.Completed && needsCash ? (
            <Text variant="caption" color="textSecondary" align="center">
              Collect the cash first
            </Text>
          ) : null}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.lg,
    padding: theme.spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.layout.margin,
    paddingVertical: theme.spacing.md,
  },
  content: {
    paddingHorizontal: theme.layout.margin,
    paddingBottom: 140,
    gap: theme.spacing.lg,
  },

  rail: { flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.xs },
  railStep: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  railDot: { width: 10, height: 10, borderRadius: 5 },
  railDone: { backgroundColor: theme.colors.primary },
  railNow: { backgroundColor: theme.colors.primary, width: 14, height: 14, borderRadius: 7 },
  railTodo: { backgroundColor: theme.colors.borderStrong },
  railLine: { flex: 1, height: 2, backgroundColor: theme.colors.border, marginHorizontal: 4 },
  railLineOn: { backgroundColor: theme.colors.primary },

  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
    ...theme.elevation.card,
  },
  cashDue: { borderWidth: 2, borderColor: theme.colors.primary },
  cashDone: { opacity: 0.85 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing.md,
    marginTop: theme.spacing.xs,
  },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: theme.layout.margin,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    backgroundColor: theme.colors.surface,
    gap: theme.spacing.sm,
    ...theme.elevation.raised,
  },
});
