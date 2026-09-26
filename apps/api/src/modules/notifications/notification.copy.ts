import { formatPKR, NotificationType } from '@haala/shared';

/**
 * Customer-facing notification copy, from `Haala Notifications.dc.html`.
 *
 * The rules the design sets, which `notification.copy.test.ts` holds us to:
 * - title ≤ 40 characters, body ≤ 90 — the number goes in the title, because
 *   the title is what survives truncation on a lock screen;
 * - Roman Urdu for one phrase at most, never the key fact;
 * - no emoji, no ALL CAPS, no exclamation runs;
 * - a missing rider name reads "Your rider", and a missing duration drops its
 *   "· N min" suffix rather than printing a placeholder.
 *
 * Money uses `formatPKR` ("PKR 2,340"), not the comp's "Rs 2,340": every
 * receipt, basket and order screen already prints PKR, and a push that names
 * the amount differently from the order it links to reads as a different sum.
 */

export interface Copy {
  type: NotificationType;
  title: string;
  body: string;
}

export const TITLE_MAX = 40;
export const BODY_MAX = 90;
const DELIVERED_BOAST_MAX_MIN = 60;

/**
 * First name only: it is what the comp shows ("Salman"), it keeps a title
 * inside 40 characters, and a lock screen is no place for a rider's full name.
 */
const firstName = (name: string | null): string | null => name?.trim().split(/\s+/)[0] || null;

const rider = (name: string | null): string => firstName(name) ?? 'Your rider';

/** "8:14 PM", on the customer's clock rather than the server's. */
const clock = (at: Date): string =>
  at.toLocaleTimeString('en-US', { timeZone: 'Asia/Karachi', hour: 'numeric', minute: '2-digit' });

export const copy = {
  riderAssigned: (riderName: string | null, storeName: string): Copy => ({
    type: NotificationType.RiderAssigned,
    title: firstName(riderName) ? `${firstName(riderName)} is your rider` : 'Rider assigned',
    body: `Collecting your bag from ${storeName} now.`,
  }),

  /**
   * Sent at pickup — the moment the bag physically leaves the store. The comp's
   * "· 7 min" suffix waits on a live ETA, which nothing computes yet; this is
   * the fallback form the design specifies for a missing duration.
   */
  outForDelivery: (riderName: string | null): Copy => ({
    type: NotificationType.OutForDelivery,
    title: 'Raaste mein hai',
    body: `${rider(riderName)} left the store. Track your order live on the map.`,
  }),

  /** The rider is inside `ARRIVING_RADIUS_METERS` of the drop-off. */
  arriving: (riderName: string | null): Copy => ({
    type: NotificationType.Arriving,
    title: 'Arriving in 2 min',
    body: `${rider(riderName)} is almost at your door. Keep your phone handy.`,
  }),

  arrived: (riderName: string | null): Copy => ({
    type: NotificationType.Arrived,
    title: `${rider(riderName)} has arrived`,
    body: 'Outside with your order. Keep your phone handy.',
  }),

  /**
   * `minutes` is placement to hand-over: the promise, measured. Past an hour it
   * is no longer a boast, so the title just says it arrived.
   */
  delivered: (minutes: number | null, itemCount: number, at: Date): Copy => ({
    type: NotificationType.Delivered,
    title:
      minutes !== null && minutes > 0 && minutes <= DELIVERED_BOAST_MAX_MIN
        ? `Delivered in ${minutes} min`
        : 'Delivered',
    body: `Shukriya! ${itemCount} ${itemCount === 1 ? 'item' : 'items'} handed over at ${clock(at)}.`,
  }),

  orderCancelled: (orderNumber: string): Copy => ({
    type: NotificationType.OrderCancelled,
    title: `Order cancelled · ${orderNumber}`,
    body: 'Anything you paid online will be refunded.',
  }),

  deliveryFailed: (orderNumber: string): Copy => ({
    type: NotificationType.DeliveryFailed,
    title: "Delivery didn't go through",
    body: `We couldn't complete order ${orderNumber}. Support will be in touch.`,
  }),

  paymentReceived: (amount: number, orderNumber: string): Copy => ({
    type: NotificationType.PaymentReceived,
    title: `Payment received · ${formatPKR(amount)}`,
    body: `Paid online for order ${orderNumber}.`,
  }),

  /**
   * States the fact and stops. The comp offers "Try again or pay cash", but
   * nothing in the app yet lets a placed order switch payment method, so the
   * push would promise a button that isn't there. "Wasn't completed" rather
   * than "declined": Safepay reports a checkout the customer closed as failed
   * too, and telling them their bank said no would be wrong.
   */
  paymentFailed: (amount: number, orderNumber: string): Copy => ({
    type: NotificationType.PaymentFailed,
    title: "Payment didn't go through",
    body: `${formatPKR(amount)} for order ${orderNumber} wasn't completed.`,
  }),

  refundIssued: (amount: number): Copy => ({
    type: NotificationType.RefundIssued,
    title: `Refund issued · ${formatPKR(amount)}`,
    body: 'Back to your original payment method in 3–5 working days.',
  }),
};
