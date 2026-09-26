import {
  QUIET_HOURS,
  type NotificationCategory,
  type NotificationPreferencesView,
} from '@haala/shared';

/** Pakistan has one zone and no daylight saving, so a fixed offset is exact. */
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

/** What a customer who has never opened the settings screen gets. */
export const DEFAULT_PREFERENCES: NotificationPreferencesView = {
  categories: { order: true, brand: true, payment: true, offer: false, service: true },
  quietHours: true,
};

/** 11 PM – 8 AM every day, and Jummah on Friday, in Pakistan time. */
export const isQuietTime = (now: Date): boolean => {
  const local = new Date(now.getTime() + PKT_OFFSET_MS);
  const hour = local.getUTCHours();
  if (hour >= QUIET_HOURS.startHour || hour < QUIET_HOURS.endHour) return true;
  const { day, startHour, endHour } = QUIET_HOURS.jummah;
  return local.getUTCDay() === day && hour >= startHour && hour < endHour;
};

/**
 * Whether a notification in `category` should reach the customer's phone.
 *
 * Only the push is gated. The inbox row is written either way: a muted
 * category is one the customer doesn't want to be interrupted by, not one they
 * want erased.
 */
export const shouldPush = (
  category: NotificationCategory,
  prefs: NotificationPreferencesView,
  now: Date,
): boolean => {
  if (!prefs.categories[category]) return false;
  return !(prefs.quietHours && QUIET_HOURS.mutes.includes(category) && isQuietTime(now));
};
