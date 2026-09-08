import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isDegeneratePolygon, isSelfIntersectingPolygon, parsePolygonText } from './store-polygon';

const SQUARE = [
  { lat: 33.99, lng: 71.68 },
  { lat: 33.99, lng: 71.7 },
  { lat: 33.97, lng: 71.7 },
  { lat: 33.97, lng: 71.68 },
];

// Same four points as SQUARE but visited in an order that crosses itself —
// a "bowtie", the classic self-intersecting-quadrilateral case.
const BOWTIE = [SQUARE[0]!, SQUARE[2]!, SQUARE[1]!, SQUARE[3]!];

const COLLINEAR = [
  { lat: 33.97, lng: 71.68 },
  { lat: 33.98, lng: 71.68 },
  { lat: 33.99, lng: 71.68 },
];

describe('isDegeneratePolygon', () => {
  it('rejects three collinear points', () => {
    assert.equal(isDegeneratePolygon(COLLINEAR), true);
  });

  it('accepts a real quadrilateral', () => {
    assert.equal(isDegeneratePolygon(SQUARE), false);
  });

  it('accepts a small but real triangle (small area is not the same as zero area)', () => {
    const tiny = [
      { lat: 33.97, lng: 71.68 },
      { lat: 33.9701, lng: 71.68 },
      { lat: 33.97, lng: 71.6801 },
    ];
    assert.equal(isDegeneratePolygon(tiny), false);
  });
});

describe('isSelfIntersectingPolygon', () => {
  it('rejects a bowtie', () => {
    assert.equal(isSelfIntersectingPolygon(BOWTIE), true);
  });

  it('accepts a simple square', () => {
    assert.equal(isSelfIntersectingPolygon(SQUARE), false);
  });

  it('does not flag adjacent edges sharing a vertex as an intersection', () => {
    // A regression guard: adjacent edges always share exactly one point by
    // construction, which must not itself count as crossing.
    assert.equal(isSelfIntersectingPolygon(SQUARE), false);
  });
});

describe('parsePolygonText', () => {
  it('returns null for blank input', () => {
    assert.equal(parsePolygonText(''), null);
    assert.equal(parsePolygonText('   \n  \n'), null);
  });

  it('parses valid "lat, lng" lines', () => {
    const result = parsePolygonText('33.99, 71.68\n33.99, 71.70\n33.97, 71.70');
    assert.deepEqual(result, [
      { lat: 33.99, lng: 71.68 },
      { lat: 33.99, lng: 71.7 },
      { lat: 33.97, lng: 71.7 },
    ]);
  });

  it('throws rather than silently defaulting a missing component to 0', () => {
    // Regression: `Number('')` is 0, so a trailing comma with nothing after
    // it must not become a real point at longitude 0.
    assert.throws(() => parsePolygonText('33.99, 71.68\n33.97,\n33.97, 71.70'), /Line 2/);
  });

  it('throws on a non-numeric component', () => {
    assert.throws(() => parsePolygonText('33.99, abc'), /Line 1/);
  });

  it('throws on an out-of-range coordinate', () => {
    assert.throws(() => parsePolygonText('91, 71.68\n33.99, 71.70\n33.97, 71.70'), /Line 1/);
  });

  it('throws for fewer than 3 points', () => {
    assert.throws(() => parsePolygonText('33.99, 71.68\n33.97, 71.70'), /at least 3/);
  });
});
