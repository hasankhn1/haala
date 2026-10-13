import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { eq, inArray } from 'drizzle-orm';
import { createApp } from '../../app';
import { closeDb, db } from '../../db/client';
import {
  brands,
  businessTypes,
  categories,
  inventory,
  productVariants,
  products,
  stores,
} from '../../db/schema';
import { closeRedis } from '../../redis/client';

/**
 * A clothing card stands for a size the store actually has.
 *
 * Regression test for a bug found while stocking a vendor delivery: the card
 * always resolved the product's *first* size, so a suit whose first row
 * ("Unstitched / Red") was never delivered disappeared from the shop while
 * "M / Navy" sat on the shelf — and with a zero row for Red, it showed as sold
 * out. Grocery is deliberately left on the first size for now, and the last
 * case pins that so the clothing fix cannot leak into it unnoticed.
 */
let base = '';
let close: () => Promise<void> = async () => {};
let storeId = '';
const created: string[] = [];

type Json = Record<string, any>;

async function get(path: string): Promise<Json> {
  const res = await fetch(`${base}${path}`);
  assert.equal(res.status, 200, path);
  return ((await res.json()) as Json).data as Json;
}

/** A throwaway product in the department's seeded brand, with sizes A then B. */
async function product(department: string) {
  const [shop] = await db
    .select({ brandId: brands.id, categoryId: categories.id })
    .from(brands)
    .innerJoin(businessTypes, eq(businessTypes.id, brands.businessTypeId))
    .innerJoin(categories, eq(categories.brandId, brands.id))
    .where(eq(businessTypes.key, department))
    .limit(1);
  assert.ok(shop, `no seeded ${department} brand`);

  const name = `zz-card-${randomUUID().slice(0, 8)}`;
  const [p] = await db
    .insert(products)
    .values({ ...shop, name, slug: name, unit: '1 piece', basePrice: 10000 })
    .returning();
  created.push(p!.id);
  const [a, b] = await db
    .insert(productVariants)
    .values([
      { productId: p!.id, label: 'A', unit: 'A', basePrice: 10000, sortOrder: 0 },
      { productId: p!.id, label: 'B', unit: 'B', basePrice: 12000, sortOrder: 1 },
    ])
    .returning();
  return { name, a: a!.id, b: b!.id };
}

const stock = (variantId: string, quantityAvailable: number) =>
  db.insert(inventory).values({ storeId, variantId, quantityAvailable });

before(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('These tests need a migrated, seeded throwaway database. Set DATABASE_URL.');
  }
  const server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };
  const [s] = await db.select({ id: stores.id }).from(stores).limit(1);
  storeId = s!.id;
});

after(async () => {
  if (created.length) await db.delete(products).where(inArray(products.id, created));
  await close();
  await closeDb();
  await closeRedis();
});

describe('which size a product card stands for', () => {
  it('clothing: listed when only a later size is stocked', async () => {
    const p = await product('clothing');
    await stock(p.b, 5);

    const { items, total } = await get(`/api/v1/catalog/products?storeId=${storeId}&q=${p.name}`);
    assert.equal(total, 1);
    assert.equal(items.length, 1);
    assert.equal(items[0].defaultVariantId, p.b);
    assert.equal(items[0].price, 12000);
  });

  it('clothing: an in-stock later size beats a sold-out first one', async () => {
    const p = await product('clothing');
    await stock(p.a, 0);
    await stock(p.b, 5);

    const { items } = await get(`/api/v1/catalog/products?storeId=${storeId}&q=${p.name}`);
    assert.equal(items[0]?.defaultVariantId, p.b);
    assert.ok(items[0].availableQty > 0);
  });

  it('grocery: still the first size, sold out or not', async () => {
    const p = await product('grocery');
    await stock(p.a, 0);
    await stock(p.b, 5);

    const { items } = await get(`/api/v1/catalog/products?storeId=${storeId}&q=${p.name}`);
    assert.equal(items[0]?.defaultVariantId, p.a);
  });
});
