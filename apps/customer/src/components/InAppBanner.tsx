import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'expo-router';
import {
  NOTIFICATION_CATEGORIES,
  NotificationCategory,
  NotificationType,
  notificationCategory,
} from '@haala/shared';
import { onNotificationReceived, Text, theme } from '@haala/ui';
import { notificationsApi } from '../api/endpoints';
import { qk } from '../api/queryKeys';
import { NotificationTile } from './NotificationTile';

/**
 * The in-app top banner from `Haala Notifications.dc.html`: what a push looks
 * like when the app is already open.
 *
 * The comp's rules, all here: slides down in 240ms; dismisses itself after 5s
 * with a bar counting the time down — except an order update, which waits to be
 * tapped, because "your rider is outside" must not vanish while someone is
 * looking the other way; swipe up to dismiss; and an offer never interrupts the
 * basket or checkout.
 *
 * Fed by foreground pushes rather than the socket: a customer who declined
 * notifications gets no banner, but has the inbox, and the app needs no
 * app-wide socket connection kept alive just for this.
 */

const SLIDE_MS = 240;
const DISMISS_AFTER_MS = 5_000;
/** Enough to clear the status bar and the card's own height on any phone. */
const OFFSCREEN = -220;
/** Routes an offer must never interrupt: the customer is about to pay. */
const NO_OFFERS_ON = ['/cart', '/checkout'];

/**
 * Where an order update sits on the comp's four stages — Packed, Picked up,
 * On the way, Here — for the bar along the banner's foot.
 */
const ORDER_PROGRESS: Partial<Record<string, number>> = {
  [NotificationType.RiderAssigned]: 0.25,
  [NotificationType.OutForDelivery]: 0.5,
  [NotificationType.Arriving]: 0.75,
  [NotificationType.Arrived]: 1,
  [NotificationType.Delivered]: 1,
};

interface BannerItem {
  key: string;
  title: string;
  body: string;
  category: NotificationCategory;
  type: string;
  orderId: string | null;
  notificationId: string | null;
}

const isCategory = (value: unknown): value is NotificationCategory =>
  NOTIFICATION_CATEGORIES.includes(value as NotificationCategory);

export function InAppBanner() {
  const [item, setItem] = useState<BannerItem | null>(null);
  const pathname = usePathname();
  const path = useRef(pathname);
  path.current = pathname;

  useEffect(
    () =>
      onNotificationReceived(({ title, body, data }) => {
        const type = typeof data.type === 'string' ? data.type : '';
        const category = isCategory(data.category) ? data.category : notificationCategory(type);
        if (
          category === NotificationCategory.Offer &&
          NO_OFFERS_ON.some((p) => path.current.startsWith(p))
        ) {
          return;
        }
        const notificationId = typeof data.notificationId === 'string' ? data.notificationId : null;
        setItem({
          // A new push replaces the one showing, and the key restarts its timers.
          key: notificationId ?? `${Date.now()}`,
          title,
          body,
          category,
          type,
          orderId: typeof data.orderId === 'string' ? data.orderId : null,
          notificationId,
        });
      }),
    [],
  );

  if (!item) return null;
  // Guarded by key: a banner that was replaced mid-exit must not clear its successor.
  const gone = (key: string) => setItem((current) => (current?.key === key ? null : current));
  return <Banner key={item.key} item={item} onGone={() => gone(item.key)} />;
}

function Banner({ item, onGone }: { item: BannerItem; onGone: () => void }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const offset = useRef(new Animated.Value(OFFSCREEN)).current;
  const remaining = useRef(new Animated.Value(1)).current;

  const isOrder = item.category === NotificationCategory.Order;
  const progress = isOrder ? ORDER_PROGRESS[item.type] : undefined;
  const canTrack = isOrder && item.orderId !== null;

  const dismiss = useRef(() => {
    remaining.stopAnimation();
    Animated.timing(offset, {
      toValue: OFFSCREEN,
      duration: 200,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => finished && onGone());
  }).current;

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(`${item.title}. ${item.body}`);
    Animated.timing(offset, {
      toValue: 0,
      duration: SLIDE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    if (isOrder) return;
    // Width can't run on the native driver, so the countdown bar is JS-driven.
    Animated.timing(remaining, {
      toValue: 0,
      duration: DISMISS_AFTER_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start(({ finished }) => finished && dismiss());
  }, [offset, remaining, isOrder, dismiss, item.title, item.body]);

  // Replaced or unmounted: stop the clocks, or a leftover countdown dismisses
  // whatever is showing next.
  useEffect(
    () => () => {
      offset.stopAnimation();
      remaining.stopAnimation();
    },
    [offset, remaining],
  );

  const swipe = useRef(
    PanResponder.create({
      // Only a vertical drag is a swipe; a tap must still reach the Pressable.
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => offset.setValue(Math.min(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy < -30 || g.vy < -0.5) dismiss();
        else Animated.spring(offset, { toValue: 0, useNativeDriver: true }).start();
      },
    }),
  ).current;

  const open = () => {
    if (item.notificationId) {
      notificationsApi
        .markRead(item.notificationId)
        .then(() => qc.invalidateQueries({ queryKey: qk.notifications }))
        .catch(() => undefined);
    }
    router.push(item.orderId ? `/order/${item.orderId}` : '/notifications');
    dismiss();
  };

  return (
    <Animated.View
      {...swipe.panHandlers}
      style={[
        styles.wrap,
        { top: insets.top + theme.spacing.sm, transform: [{ translateY: offset }] },
      ]}
    >
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}. ${item.body}`}
        accessibilityHint={item.orderId ? 'Opens the order' : 'Opens your notifications'}
        style={styles.card}
      >
        <NotificationTile category={item.category} type={item.type} badge />
        <View style={styles.text}>
          <Text variant="title" numberOfLines={1}>
            {item.title}
          </Text>
          <Text variant="bodySm" color="textSecondary" numberOfLines={2}>
            {item.body}
          </Text>
        </View>
        {canTrack ? (
          <View style={styles.track}>
            <Text variant="labelSm" color="onPrimary">
              Track
            </Text>
          </View>
        ) : (
          <Text variant="labelSm" color="primaryPressed" style={styles.view}>
            View
          </Text>
        )}

        {isOrder ? (
          progress !== undefined ? (
            <View style={styles.bar}>
              <View style={[styles.fill, { width: `${progress * 100}%` }]} />
            </View>
          ) : null
        ) : (
          <View style={styles.bar}>
            <Animated.View
              style={[
                styles.fill,
                {
                  width: remaining.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                },
              ]}
            />
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: theme.spacing.md,
    right: theme.spacing.md,
    zIndex: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.layout.elementGap,
    padding: theme.spacing.md,
    borderRadius: 18,
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    ...theme.elevation.sheet,
  },
  text: { flex: 1, minWidth: 0 },
  track: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radii.pill,
    paddingVertical: 9,
    paddingHorizontal: theme.spacing.md,
  },
  view: { paddingVertical: 9, paddingHorizontal: theme.spacing.xs },
  bar: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: theme.colors.primarySoft,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: theme.colors.primary },
});
