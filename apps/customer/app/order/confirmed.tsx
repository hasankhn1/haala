import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatPKR, OrderStatus } from '@haala/shared';
import { Icon, Skeleton, Text, theme } from '@haala/ui';
import { ordersApi } from '../../src/api/endpoints';
import { qk } from '../../src/api/queryKeys';
import { ETA_MINUTES } from '../../src/config';
import { haptics } from '../../src/lib/haptics';

/**
 * Order placed — Basket's full-bleed ember confirmation.
 *
 * The comps build this around one white card shaped like a ticket stub: the
 * arrival promise above a perforation, the bill below it. Everything on it is
 * read from the order rather than passed through the route, because the screen
 * has to state what was actually charged.
 */

/** The four beats the comp's progress bar counts, and where each status sits. */
const STEPS = ['picking your items', 'packed', 'on the way', 'delivered'] as const;
const STEP_INDEX: Record<string, number> = {
  [OrderStatus.Placed]: 0,
  [OrderStatus.Confirmed]: 0,
  [OrderStatus.Preparing]: 0,
  [OrderStatus.Packed]: 1,
  [OrderStatus.PickedUp]: 2,
  [OrderStatus.OutForDelivery]: 2,
  [OrderStatus.Delivered]: 3,
};

export default function OrderConfirmedScreen() {
  const router = useRouter();
  const { id, number } = useLocalSearchParams<{ id: string; number?: string }>();

  useEffect(() => {
    haptics.success();
  }, []);

  const order = useQuery({
    queryKey: qk.order(id),
    queryFn: () => ordersApi.get(id),
    enabled: !!id,
  });
  const o = order.data;

  const step = o ? (STEP_INDEX[o.status] ?? 0) : 0;
  const itemCount = o?.items.reduce((n, i) => n + i.quantity, 0) ?? 0;
  /**
   * The only saving an order can actually evidence is its promo discount.
   * `subtotal` is defined as the sum of the line totals and `order_items`
   * stores no catalogue price, so a "you saved" figure derived from the lines
   * would be exactly zero every time.
   */
  const saved = o?.discount ?? 0;

  // "by 4:42 pm" — the promise as a clock time, which reads as more of a
  // commitment than a duration does.
  const by = new Date(Date.now() + ETA_MINUTES * 60_000).toLocaleTimeString('en-PK', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.topRow}>
            {number ? (
              <View style={styles.orderPill}>
                <Text variant="labelSm" color="onPrimary">
                  Order {number}
                </Text>
              </View>
            ) : (
              <View />
            )}
            <Pressable
              style={styles.close}
              onPress={() => router.replace('/(tabs)')}
              accessibilityLabel="Close"
            >
              <Icon name="close" size={15} color={theme.colors.onPrimary} />
            </Pressable>
          </View>

          <Text variant="display" color="onPrimary" style={styles.headline}>
            We’re on it.
          </Text>
          <Text variant="bodyStrong" style={styles.sub}>
            {itemCount > 0
              ? `We've started picking your ${itemCount} ${itemCount === 1 ? 'item' : 'items'}.`
              : 'Your order is being picked now.'}
          </Text>

          {/* The ticket stub: promise on top, bill underneath, perforated. */}
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <View style={styles.cardHead}>
                <View>
                  <Text variant="labelCaps" color="textTertiary">
                    ARRIVING IN
                  </Text>
                  <View style={styles.etaRow}>
                    <Text variant="display">{ETA_MINUTES}</Text>
                    <Text variant="h3" color="textSecondary" style={styles.etaUnit}>
                      min
                    </Text>
                  </View>
                </View>
                <View style={styles.cardHeadRight}>
                  <Text variant="bodySm" color="textSecondary">
                    by {by}
                  </Text>
                  {o ? (
                    <Text variant="label" numberOfLines={1} style={styles.addr}>
                      {o.deliveryAddress.label} · {o.deliveryAddress.area}
                    </Text>
                  ) : null}
                </View>
              </View>

              <View style={styles.segments}>
                {STEPS.map((label, i) => (
                  <View key={label} style={[styles.segment, i <= step && styles.segmentOn]} />
                ))}
              </View>
              <Text variant="labelSm" style={styles.stepLine}>
                Step {step + 1} of {STEPS.length} · {STEPS[step]}
              </Text>
            </View>

            {/* Perforation — dashed rule with a notch punched out of each edge. */}
            <View style={styles.perforation}>
              <View style={styles.dashes} />
              <View style={[styles.notch, styles.notchLeft]} />
              <View style={[styles.notch, styles.notchRight]} />
            </View>

            <View style={styles.cardBottom}>
              {o ? (
                <View style={styles.billRow}>
                  <Text variant="body" color="textSecondary">
                    {itemCount} {itemCount === 1 ? 'item' : 'items'}
                  </Text>
                  <Text variant="body" color="textSecondary">
                    {formatPKR(o.subtotal)}
                  </Text>
                </View>
              ) : (
                <Skeleton width="60%" height={14} />
              )}

              {saved > 0 || (o?.tipAmount ?? 0) > 0 ? (
                <View style={styles.billRow}>
                  {saved > 0 ? (
                    <View style={styles.savedBadge}>
                      <Text variant="labelSm" style={styles.onPromo}>
                        You saved {formatPKR(saved)}
                      </Text>
                    </View>
                  ) : (
                    <View />
                  )}
                  {(o?.tipAmount ?? 0) > 0 ? (
                    <Text variant="body" color="textSecondary">
                      tip {formatPKR(o!.tipAmount)}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.paidRow}>
                {o ? (
                  <>
                    <Text variant="title">
                      {o.paymentMethod === 'cod' ? 'Cash on delivery' : 'Paid'}
                    </Text>
                    <Text variant="h2">{formatPKR(o.total)}</Text>
                  </>
                ) : (
                  <>
                    <Skeleton width={110} height={16} />
                    <Skeleton width={80} height={20} />
                  </>
                )}
              </View>
            </View>
          </View>

          {/* Who is bringing it. Before dispatch nobody has taken the order, so
              this says that rather than inventing a name. */}
          <View style={styles.shopper}>
            <View style={styles.avatar}>
              <Text variant="label">{o?.rider?.name?.[0]?.toUpperCase() ?? '🛒'}</Text>
            </View>
            <View style={styles.flex}>
              <Text variant="bodyStrong" color="onPrimary">
                {o?.rider ? `${o.rider.name} · your rider` : 'Finding you a rider'}
              </Text>
              <Text variant="bodySm" style={styles.shopperSub}>
                {o?.rider
                  ? 'You can call them from the tracking screen.'
                  : 'We’ll assign one as soon as your items are packed.'}
              </Text>
            </View>
          </View>
        </ScrollView>

        <View style={styles.actions}>
          <Pressable
            style={styles.trackBtn}
            onPress={() => router.replace(`/order/${id}?placed=1`)}
            accessibilityRole="button"
          >
            <Icon name="navigate-outline" size={17} color={theme.colors.onPrimary} />
            <Text variant="title" color="onPrimary">
              Track live
            </Text>
          </Pressable>
          <Pressable
            style={styles.keepBtn}
            onPress={() => router.replace('/(tabs)')}
            accessibilityRole="button"
          >
            <Text variant="label" color="onPrimary">
              Keep shopping
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const NOTCH = 18;
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.primary },
  safe: { flex: 1 },
  flex: { flex: 1 },
  onPromo: { color: theme.colors.onPromo },
  content: { paddingHorizontal: theme.layout.margin, paddingTop: 10, paddingBottom: theme.spacing.lg },

  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderPill: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: theme.radii.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 7,
  },
  close: {
    width: 32,
    height: 32,
    borderRadius: theme.radii.pill,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: { marginTop: theme.spacing.xl },
  sub: { color: 'rgba(255,255,255,0.86)', marginTop: theme.spacing.sm },

  card: {
    marginTop: theme.spacing.xl,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
  },
  cardTop: { padding: theme.spacing.lg, paddingBottom: theme.spacing.md },
  cardHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  cardHeadRight: { alignItems: 'flex-end', gap: 5 },
  addr: { maxWidth: 150, textAlign: 'right' },
  etaRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 6 },
  etaUnit: { marginBottom: 2 },
  segments: { flexDirection: 'row', gap: 5, marginTop: theme.spacing.lg },
  segment: {
    flex: 1,
    height: 5,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.border,
  },
  segmentOn: { backgroundColor: theme.colors.primary },
  stepLine: { color: theme.colors.primaryPressed, marginTop: 9 },

  perforation: { height: 22, justifyContent: 'center' },
  dashes: {
    marginHorizontal: 12,
    borderTopWidth: 2,
    borderTopColor: theme.colors.border,
    borderStyle: 'dashed',
  },
  // Punched out of the card's edge, so the ember behind shows through.
  notch: {
    position: 'absolute',
    top: 2,
    width: NOTCH,
    height: NOTCH,
    borderRadius: NOTCH / 2,
    backgroundColor: theme.colors.primary,
  },
  notchLeft: { left: -NOTCH / 2 },
  notchRight: { right: -NOTCH / 2 },

  cardBottom: { padding: theme.spacing.lg, paddingTop: theme.spacing.xs, gap: 11 },
  billRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  savedBadge: {
    backgroundColor: theme.colors.promo,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  paidRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: 13,
    marginTop: 2,
  },

  shopper: {
    marginTop: theme.spacing.lg,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: theme.radii.md,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shopperSub: { color: 'rgba(255,255,255,0.8)', marginTop: 3 },

  actions: { paddingHorizontal: theme.layout.margin, paddingBottom: theme.spacing.md, gap: 10 },
  trackBtn: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.pill,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  keepBtn: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
    borderRadius: theme.radii.pill,
    paddingVertical: 14,
    alignItems: 'center',
  },
});
