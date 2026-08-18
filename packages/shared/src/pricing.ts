/**
 * Order pricing rules, in one place.
 *
 * These were previously duplicated between the API's Orders service and the
 * customer app's config. The API remains authoritative — it re-prices every
 * order at placement — but the app needs the same rule to show an honest
 * pre-order estimate, and promo quoting needs it too. Three copies of a money
 * rule is three chances to quote a customer a total we don't charge.
 */

import { rupees } from './money';

/** Flat delivery fee in paisa, applied below the free-delivery threshold. */
export const DELIVERY_FEE = rupees(79);

/** Order subtotal (paisa) at or above which delivery is free. */
export const FREE_DELIVERY_THRESHOLD = rupees(2000);

/** Delivery fee for a given subtotal, both in paisa. */
export const deliveryFeeFor = (subtotal: number): number =>
  subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE;
