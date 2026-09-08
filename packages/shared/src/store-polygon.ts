import { z } from 'zod';

/**
 * A store's delivery boundary is a list of these. Defined once here — schema
 * validation (`ops.ts`), the DB column type, and the dashboard's form all
 * import this rather than re-declaring `{ lat: number; lng: number }`
 * separately, which is how those copies drifted before.
 */
export const storePolygonPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type StorePolygonPoint = z.infer<typeof storePolygonPointSchema>;

/** Small enough to only catch genuinely collinear points, not a real tiny polygon. */
const AREA_EPSILON = 1e-10;

/** Twice the shoelace-formula area — sign gives winding order, zero means collinear. */
const shoelaceArea2 = (points: StorePolygonPoint[]): number => {
  let area2 = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    area2 += a.lng * b.lat - b.lng * a.lat;
  }
  return area2;
};

/** All points on (or effectively on) a single line — not a real area. */
export const isDegeneratePolygon = (points: StorePolygonPoint[]): boolean =>
  Math.abs(shoelaceArea2(points)) < AREA_EPSILON;

type Orientation = 0 | 1 | 2; // collinear | clockwise | counterclockwise

const orientation = (
  p: StorePolygonPoint,
  q: StorePolygonPoint,
  r: StorePolygonPoint,
): Orientation => {
  const val = (q.lng - p.lng) * (r.lat - q.lat) - (q.lat - p.lat) * (r.lng - q.lng);
  if (Math.abs(val) < 1e-12) return 0;
  return val > 0 ? 1 : 2;
};

const onSegment = (p: StorePolygonPoint, q: StorePolygonPoint, r: StorePolygonPoint): boolean =>
  q.lat <= Math.max(p.lat, r.lat) &&
  q.lat >= Math.min(p.lat, r.lat) &&
  q.lng <= Math.max(p.lng, r.lng) &&
  q.lng >= Math.min(p.lng, r.lng);

const segmentsIntersect = (
  p1: StorePolygonPoint,
  q1: StorePolygonPoint,
  p2: StorePolygonPoint,
  q2: StorePolygonPoint,
): boolean => {
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;
  return false;
};

/**
 * Whether any two non-adjacent edges cross — a "figure eight" ring, which
 * ray-casting point-in-polygon (`isWithinDeliveryArea` in the API) assumes
 * never happens. Adjacent edges sharing a vertex are not an intersection.
 */
export const isSelfIntersectingPolygon = (points: StorePolygonPoint[]): boolean => {
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a1 = points[i]!;
    const a2 = points[(i + 1) % n]!;
    for (let j = i + 1; j < n; j++) {
      // Adjacent edges always share exactly one vertex — j === i + 1 shares
      // edge i's end point, and the wraparound (j + 1) % n === i shares its
      // start point. Neither is a real crossing.
      if (j === i + 1 || (j + 1) % n === i) continue;
      const b1 = points[j]!;
      const b2 = points[(j + 1) % n]!;
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
};

/**
 * Parses the "lat, lng" per line format ops pastes into the boundary field.
 * Returns `null` for blank input (no polygon — radius fallback applies) and
 * throws with a specific line number for anything malformed, since a
 * silently-dropped typo would just look like the feature doesn't work.
 *
 * Shared rather than dashboard-only so any future authoring surface (or a
 * script) parses boundaries the same way, and so this one place is what gets
 * fixed if the format ever changes.
 */
export const parsePolygonText = (text: string): StorePolygonPoint[] | null => {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return null;

  const points = lines.map((line, i) => {
    const rawParts = line.split(',').map((p) => p.trim());
    if (rawParts.length !== 2 || rawParts.some((p) => p.length === 0)) {
      throw new Error(`Line ${i + 1} isn't a valid "lat, lng" pair: "${line}"`);
    }
    const [lat, lng] = rawParts.map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error(`Line ${i + 1} isn't a valid "lat, lng" pair: "${line}"`);
    }
    if (lat! < -90 || lat! > 90 || lng! < -180 || lng! > 180) {
      throw new Error(`Line ${i + 1} is out of range: "${line}"`);
    }
    return { lat: lat!, lng: lng! };
  });

  if (points.length < 3) {
    throw new Error(
      `A boundary needs at least 3 points (found ${points.length}) — leave it blank to use the radius instead.`,
    );
  }
  return points;
};
