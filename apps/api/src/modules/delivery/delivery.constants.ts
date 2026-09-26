/**
 * Delivery-domain constants.
 *
 * Split out from `delivery.service.ts` so other modules can import them without
 * pulling in the service — the notification fan-out needs the pickup radius, and
 * importing the delivery service from there would close an
 * order → delivery → order cycle.
 */

/**
 * How far an *unassigned* rider may be from a store and still be offered its
 * pickups. Riders with a home store ignore this — their assignment is the
 * scope. Generous enough to cover a city sector, tight enough that a rider is
 * never offered a pickup across town.
 */
export const RIDER_PICKUP_RADIUS_METERS = 8_000;

/**
 * How close a rider carrying an order must be to the drop-off before the
 * customer hears "Arriving in 2 min" — the design's trigger. About two minutes
 * at motorbike speed through DHA's blocks.
 */
export const ARRIVING_RADIUS_METERS = 400;
