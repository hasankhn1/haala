import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { NowDotMark } from './BrandMarks';
import { NotificationCategory, NotificationType } from '@haala/shared';
import { theme } from '@haala/ui';

/**
 * The category tile from `Haala Notifications.dc.html`: a filled circle that
 * says what a notification is about before a word of it is read.
 *
 * Paths are the comp's own rather than Lucide equivalents — the tile is drawn
 * to be recognised at 40pt beside the same shapes on the lock screen, and
 * Lucide's bag and card are close but not the same silhouettes.
 */

const GLYPH: Record<Exclude<NotificationCategory, typeof NotificationCategory.Order>, string> = {
  brand: 'M6 8h12l-1 12H7L6 8Z M9.5 8V6.5a2.5 2.5 0 0 1 5 0V8',
  payment: 'M3.5 6.5h17v11h-17z M3.5 10.5h17 M7 14.5h3',
  offer: 'M4 4h7l9 9-7 7-9-9V4Z M8 8h.01',
  service: 'M4 10l1.5-5h13L20 10 M5 10v9h14v-9 M4 10h16 M10 19v-5h4v5',
};

const tintFor = (category: NotificationCategory, type?: string) =>
  type === NotificationType.PaymentFailed
    ? theme.notificationTints.paymentFailed
    : theme.notificationTints[category];

export function NotificationTile({
  category,
  type,
  size = 40,
  badge = false,
}: {
  category: NotificationCategory;
  /** Only to tell a failed payment from a received one. */
  type?: string;
  size?: number;
  /**
   * The small ember Now Dot on the corner. The in-app banner carries it so a
   * refund still reads as Haala's; the inbox doesn't need it — it is already
   * inside the app.
   */
  badge?: boolean;
}) {
  const tint = tintFor(category, type);
  const badgeSize = Math.round(size * 0.425);

  return (
    <View
      style={[
        styles.tile,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: tint.fill },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {category === NotificationCategory.Order ? (
        // Haala's own delivery wears the full mark, with the honey dot.
        <NowDotMark size={size * 0.55} color={tint.ink} dotColor={theme.colors.promo} />
      ) : (
        <Svg
          width={size * 0.5}
          height={size * 0.5}
          viewBox="0 0 24 24"
          fill="none"
          stroke={tint.ink}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Path d={GLYPH[category]} />
        </Svg>
      )}
      {badge && category !== 'order' ? (
        <View
          style={[
            styles.badge,
            { width: badgeSize, height: badgeSize, borderRadius: badgeSize / 2 },
          ]}
        >
          <NowDotMark size={badgeSize * 0.53} color={theme.colors.onPrimary} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    backgroundColor: theme.colors.primary,
    borderWidth: 2,
    borderColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
