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
