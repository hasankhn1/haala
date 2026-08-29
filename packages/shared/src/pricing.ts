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

/**
 * Flat service fee in paisa.
 *
 * **Zero today**, deliberately: the comps show a service-fee line, so the line
 * exists and is computed and stored on every order — but charging one is a
 * pricing decision, not a design decision. Set this and every surface picks it
 * up at once, because the rule lives here rather than in three places.
 */
export const SERVICE_FEE = 0;

/** Service fee for a given subtotal, both in paisa. Free on an empty basket. */
export const serviceFeeFor = (subtotal: number): number => (subtotal > 0 ? SERVICE_FEE : 0);

/**
 * Largest tip we accept, in paisa. An unbounded amount field is one fat finger
 * away from a support ticket and a refund.
 */
export const MAX_TIP = rupees(2000);
