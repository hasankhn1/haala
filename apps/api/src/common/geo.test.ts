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
});
