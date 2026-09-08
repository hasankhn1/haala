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
 * Ray-casting point-in-polygon test. `polygon` is a list of {lat,lng}
 * vertices tracing a boundary (not necessarily closed — first/last point need
 * not repeat). A point exactly on an edge may go either way, which is fine
 * here: a delivery boundary doesn't need edge-pixel precision.
 */
const isInsidePolygon = (
  polygon: { lat: number; lng: number }[],
  lat: number,
  lng: number,
): boolean => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i]!;
    const pj = polygon[j]!;
    const intersects =
      pi.lng > lng !== pj.lng > lng &&
      lat < ((pj.lat - pi.lat) * (lng - pi.lng)) / (pj.lng - pi.lng) + pi.lat;
    if (intersects) inside = !inside;
  }
  return inside;
};

/**
 * Whether a point is inside a store's delivery area.
 *
 * The single definition of "we deliver here". `GET /stores` uses it to flag
 * `isServiceable` for the app, and order placement uses it to refuse an
 * undeliverable address. Written twice, these two would drift — and the drift
 * would show the customer a shop they can't be delivered from, or take an
 * order that can't be fulfilled. The rider-location gate taught this lesson
 * once already (`isCarryingForCustomer`); any new surface that asks "do we
 * deliver here?" must call this rather than re-derive it.
 *
 * A drawn `polygon` (≥3 points) takes precedence — a circle can't represent a
 * real, lopsided area like DHA Peshawar. No polygon (or fewer than 3 points,
 * which isn't a shape) falls back to the radius, so a store nobody has drawn
 * a boundary for yet keeps working exactly as before.
 */
export const isWithinDeliveryRadius = (
  store: {
    latitude: number;
    longitude: number;
    deliveryRadiusMeters: number;
    polygon?: { lat: number; lng: number }[] | null;
  },
  lat: number,
  lng: number,
): boolean => {
  if (store.polygon && store.polygon.length >= 3) {
    return isInsidePolygon(store.polygon, lat, lng);
  }
  return haversineMeters(lat, lng, store.latitude, store.longitude) <= store.deliveryRadiusMeters;
};
