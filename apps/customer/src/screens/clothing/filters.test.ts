import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ProductView } from '@haala/shared';
import { applyFilters, buildProductQuery, countActive, EMPTY_FILTERS } from './filters';

/** Run: npx tsx --test apps/customer/src/screens/clothing/filters.test.ts */

const p = (over: Partial<ProductView>): ProductView =>
  ({
    id: 'x',
    name: 'Item',
    slug: 'item',
    unit: '',
    description: null,
    imageUrl: null,
    categoryId: 'c',
    brandName: 'Nike',
    brandSlug: 'nike',
    departmentKey: 'clothing',
    price: 200_000,
    basePrice: 200_000,
    inStock: true,
    availableQty: 5,
    defaultVariantId: 'v',
    ...over,
  }) as ProductView;

const items = [
  p({ id: 'a', brandSlug: 'nike', price: 100_000, basePrice: 120_000 }), // deal, Under 1.5k? no: 1000 → in 1.5k band
  p({ id: 'b', brandSlug: 'adidas', price: 500_000, basePrice: 500_000 }), // no deal, 3–6k band
  p({ id: 'c', brandSlug: 'nike', price: 250_000, basePrice: 250_000 }), // 1.5–3k band
];

test('brand filter keeps only that brand', () => {
  const out = applyFilters(items, { ...EMPTY_FILTERS, brands: ['nike'] });
  assert.deepEqual(out.map((x) => x.id).sort(), ['a', 'c']);
});

test('deals only keeps discounted rows', () => {
  const out = applyFilters(items, { ...EMPTY_FILTERS, dealsOnly: true });
  assert.deepEqual(out.map((x) => x.id), ['a']);
});

test('price band is half-open [min, max)', () => {
  const out = applyFilters(items, { ...EMPTY_FILTERS, priceBands: ['Rs. 3,000 – 6,000'] });
  assert.deepEqual(out.map((x) => x.id), ['b']);
});

test('sort price_asc / price_desc', () => {
  const asc = applyFilters(items, { ...EMPTY_FILTERS, sort: 'price_asc' }).map((x) => x.price);
  assert.deepEqual(asc, [100_000, 250_000, 500_000]);
  const desc = applyFilters(items, { ...EMPTY_FILTERS, sort: 'price_desc' }).map((x) => x.price);
  assert.deepEqual(desc, [500_000, 250_000, 100_000]);
});

test('applyFilters does not mutate the input array', () => {
  const before = items.map((x) => x.id);
  applyFilters(items, { ...EMPTY_FILTERS, sort: 'price_desc' });
  assert.deepEqual(items.map((x) => x.id), before);
});

test('countActive ignores sort and deals', () => {
  assert.equal(countActive({ ...EMPTY_FILTERS, sort: 'newest', dealsOnly: true }), 0);
  assert.equal(countActive({ ...EMPTY_FILTERS, brands: ['nike'], sizes: ['M'] }), 2);
});

test('buildProductQuery emits CSV facets the server will read', () => {
  const q = buildProductQuery({
    ...EMPTY_FILTERS,
    brands: ['nike', 'adidas'],
    sizes: ['M'],
    sort: 'price_asc',
  });
  assert.equal(q.brand, 'nike,adidas');
  assert.equal(q.size, 'M');
  assert.equal(q.sort, 'price_asc');
});
