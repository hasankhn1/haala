/** Great-circle distance between two lat/lng points, in metres. */
export const haversineMeters = (
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number => {
  const R = 6_371_000; // earth radius (m)
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
};

/**
 * Whether a point is inside a store's delivery radius.
 *
 * The single definition of "we deliver here". `GET /stores` uses it to flag
 * `isServiceable` for the app, and order placement uses it to refuse an
 * undeliverable address. Written twice, these two would drift — and the drift
 * would show the customer a shop they can't be delivered from, or take an
 * order that can't be fulfilled. The rider-location gate taught this lesson
 * once already (`isCarryingForCustomer`); any new surface that asks "do we
 * deliver here?" must call this rather than re-derive it.
 */
export const isWithinDeliveryRadius = (
  store: { latitude: number; longitude: number; deliveryRadiusMeters: number },
  lat: number,
  lng: number,
): boolean => haversineMeters(lat, lng, store.latitude, store.longitude) <= store.deliveryRadiusMeters;
