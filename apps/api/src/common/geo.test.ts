import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { haversineMeters, isWithinDeliveryRadius } from './geo';

/**
 * `isWithinDeliveryRadius` is the single definition of "we deliver here": the
 * store listing flags `isServiceable` with it, and order placement refuses an
 * address with it. Coordinates below are the two real Peshawar stores from the
 * seed, because the bug this guards against was concrete — a Hayatabad
 * customer being shown the DHA store's catalogue and prices.
 */
const DHA = { latitude: 33.9793, longitude: 71.6903, deliveryRadiusMeters: 4000 };
const HAYATABAD = { lat: 33.9962, lng: 71.4419 };

describe('haversineMeters', () => {
  it('is zero for the same point', () => {
    assert.equal(haversineMeters(33.9793, 71.6903, 33.9793, 71.6903), 0);
  });

  it('measures the two Peshawar stores about 23km apart', () => {
    const d = haversineMeters(DHA.latitude, DHA.longitude, HAYATABAD.lat, HAYATABAD.lng);
    assert.ok(d > 22_000 && d < 24_000, `expected ~23km, got ${d}m`);
  });

  it('is symmetric', () => {
    const a = haversineMeters(33.9793, 71.6903, 33.9962, 71.4419);
    const b = haversineMeters(33.9962, 71.4419, 33.9793, 71.6903);
    assert.equal(a, b);
  });
});

describe('isWithinDeliveryRadius', () => {
  it('covers its own doorstep', () => {
    assert.equal(isWithinDeliveryRadius(DHA, DHA.latitude, DHA.longitude), true);
  });

  it('does not cover Hayatabad from the DHA store', () => {
    // The whole point: 23km against a 4km radius. If this ever returns true,
    // someone is being sold groceries that cannot reach them.
    assert.equal(isWithinDeliveryRadius(DHA, HAYATABAD.lat, HAYATABAD.lng), false);
  });

  it('includes a point exactly on the radius', () => {
    // ~0.009 degrees of latitude is roughly 1km.
    const near = { ...DHA, deliveryRadiusMeters: 1200 };
    assert.equal(isWithinDeliveryRadius(near, DHA.latitude + 0.009, DHA.longitude), true);
  });

  it('respects a radius widened by ops', () => {
    // Ops can already edit deliveryRadiusMeters in the dashboard; widening it
    // must actually change who can order.
    const wide = { ...DHA, deliveryRadiusMeters: 30_000 };
    assert.equal(isWithinDeliveryRadius(wide, HAYATABAD.lat, HAYATABAD.lng), true);
  });

  // A square roughly around DHA's coordinates — real polygons come from ops
  // pasting Google Maps points, but the shape doesn't matter for this test,
  // only that it's a real quadrilateral.
  const SQUARE = [
    { lat: 33.99, lng: 71.68 },
    { lat: 33.99, lng: 71.70 },
    { lat: 33.97, lng: 71.70 },
    { lat: 33.97, lng: 71.68 },
  ];

  it('a store with no polygon still uses radius (fallback is untouched)', () => {
    assert.equal(isWithinDeliveryRadius(DHA, DHA.latitude, DHA.longitude), true);
  });

  it('a drawn polygon takes precedence over the radius', () => {
    const withPolygon = { ...DHA, deliveryRadiusMeters: 100, polygon: SQUARE };
    // Inside the square but far outside the tiny 100m radius — polygon wins.
    assert.equal(isWithinDeliveryRadius(withPolygon, 33.98, 71.69), true);
  });

  it('a point outside the polygon is rejected even with a huge radius', () => {
    const withPolygon = { ...DHA, deliveryRadiusMeters: 100_000, polygon: SQUARE };
    assert.equal(isWithinDeliveryRadius(withPolygon, HAYATABAD.lat, HAYATABAD.lng), false);
  });

  it('fewer than 3 points is not a shape — falls back to radius', () => {
    const twoPoints = { ...DHA, polygon: SQUARE.slice(0, 2) };
    assert.equal(isWithinDeliveryRadius(twoPoints, DHA.latitude, DHA.longitude), true);
    assert.equal(isWithinDeliveryRadius(twoPoints, HAYATABAD.lat, HAYATABAD.lng), false);
  });

  it('an empty polygon array falls back to radius', () => {
    const empty = { ...DHA, polygon: [] };
    assert.equal(isWithinDeliveryRadius(empty, DHA.latitude, DHA.longitude), true);
  });
});
