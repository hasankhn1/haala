import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createStoreSchema, updateStoreSchema } from './ops';

const BASE = {
  name: 'Test Store',
  code: 'TEST-1',
  addressLine: 'x street',
  area: 'Testville',
  city: 'Testcity',
  latitude: 33,
  longitude: 71,
};

/**
 * `isDegeneratePolygon` and `isSelfIntersectingPolygon` each have their own
 * unit tests in `store-polygon.test.ts`, but their *composition* inside the
 * schema is what actually ships — and that composition had a real bug a unit
 * test on either function alone couldn't catch: a self-intersecting ring's
 * signed area can cancel to ~zero, which the degeneracy check misread as
 * "collinear" even though the points trace a real, spread-out (if crossed)
 * shape. Ops would have seen the wrong reason for the rejection.
 */
describe('createStoreSchema polygon validation', () => {
  it('rejects a collinear ring with only the collinear message', () => {
    const collinear = [
      { lat: 33, lng: 71 },
      { lat: 34, lng: 71 },
      { lat: 35, lng: 71 },
    ];
    const result = createStoreSchema.safeParse({ ...BASE, polygon: collinear });
    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.error.issues.length, 1);
      assert.match(result.error.issues[0]!.message, /collinear/);
    }
  });

  it('rejects a self-intersecting ring with only the self-intersecting message, not also "collinear"', () => {
    // A bowtie: its two crossing lobes wind in opposite directions, so the
    // naive shoelace area cancels to ~zero — the exact false positive this
    // guards against.
    const bowtie = [
      { lat: 33, lng: 71 },
      { lat: 34, lng: 72 },
      { lat: 33, lng: 72 },
      { lat: 34, lng: 71 },
    ];
    const result = createStoreSchema.safeParse({ ...BASE, polygon: bowtie });
    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.error.issues.length, 1);
      assert.match(result.error.issues[0]!.message, /cross/);
    }
  });

  it('accepts a real simple polygon', () => {
    const square = [
      { lat: 33, lng: 71 },
      { lat: 34, lng: 71 },
      { lat: 34, lng: 72 },
      { lat: 33, lng: 72 },
    ];
    assert.equal(createStoreSchema.safeParse({ ...BASE, polygon: square }).success, true);
  });

  it('rejects more than 200 points', () => {
    const many = Array.from({ length: 201 }, (_, i) => ({ lat: 33 + i * 0.001, lng: 71 }));
    // A straight line of 201 points is also collinear, so cap this with a
    // shape that only trips the size limit: alternate a tiny lng offset to
    // avoid collinearity, without introducing a self-crossing zigzag.
    const nonCollinear = many.map((p, i) => ({ ...p, lng: p.lng + (i % 3 === 0 ? 0.0005 : 0) }));
    const result = createStoreSchema.safeParse({ ...BASE, polygon: nonCollinear });
    assert.equal(result.success, false);
  });

  it('null and omitted polygon both pass (radius fallback)', () => {
    assert.equal(createStoreSchema.safeParse({ ...BASE, polygon: null }).success, true);
    assert.equal(createStoreSchema.safeParse(BASE).success, true);
  });
});

describe('updateStoreSchema polygon validation', () => {
  it('validates polygon the same way as create when present', () => {
    const bowtie = [
      { lat: 33, lng: 71 },
      { lat: 34, lng: 72 },
      { lat: 33, lng: 72 },
      { lat: 34, lng: 71 },
    ];
    assert.equal(updateStoreSchema.safeParse({ polygon: bowtie }).success, false);
  });

  it('omitting polygon entirely leaves it untouched', () => {
    assert.equal(updateStoreSchema.safeParse({ name: 'Renamed' }).success, true);
  });
});
