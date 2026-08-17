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
