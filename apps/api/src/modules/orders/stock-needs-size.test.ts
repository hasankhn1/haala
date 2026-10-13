import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { and, eq, inArray } from 'drizzle-orm';
import { AppError } from '../../common/errors';
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
import { opsCatalogService } from './ops.catalog';

/**
 * Ops cannot stock a clothing row that has no size.
 *
 * A new garment starts with one automatic "1 piece" row, and the vendor
 * dashboard renames it into the first size the vendor adds. Stock points at the
 * row's id, so stock on "1 piece" would silently become stock of "M / Red".
 * Refusing any inventory write here is what makes that rename safe. Grocery
 * has no size axis and is left alone.
 */
let storeId = '';
const created: string[] = [];

/** A throwaway product in the department's seeded brand, with one row. */
async function row(department: string, options: Record<string, string>) {
  const [shop] = await db
    .select({ brandId: brands.id, categoryId: categories.id })
    .from(brands)
    .innerJoin(businessTypes, eq(businessTypes.id, brands.businessTypeId))
    .innerJoin(categories, eq(categories.brandId, brands.id))
    .where(eq(businessTypes.key, department))
    .limit(1);
  assert.ok(shop, `no seeded ${department} brand`);

  const name = `zz-stock-${randomUUID().slice(0, 8)}`;
  const [p] = await db
    .insert(products)
    .values({ ...shop, name, slug: name, unit: '1 piece', basePrice: 10000 })
    .returning();
  created.push(p!.id);
  const label = options.size ?? '1 piece';
  const [v] = await db
    .insert(productVariants)
    .values({ productId: p!.id, label, unit: label, basePrice: 10000, sortOrder: 0, options })
    .returning();
  return v!.id;
}

const stockOf = async (variantId: string) =>
  db
    .select()
    .from(inventory)
    .where(and(eq(inventory.storeId, storeId), eq(inventory.variantId, variantId)));

before(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('These tests need a migrated, seeded throwaway database. Set DATABASE_URL.');
  }
  const [s] = await db.select({ id: stores.id }).from(stores).limit(1);
  storeId = s!.id;
});

after(async () => {
  if (created.length) await db.delete(products).where(inArray(products.id, created));
  await closeDb();
  await closeRedis();
});

describe('stocking a row with no size', () => {
  it('clothing: refused, and nothing is written', async () => {
    const v = await row('clothing', {});
    await assert.rejects(
      opsCatalogService.updateInventory(storeId, v, { quantityAvailable: 5 }),
      (e: unknown) => e instanceof AppError && e.statusCode === 409,
    );
    assert.equal((await stockOf(v)).length, 0);
  });

  it('clothing: a price edit or a zero count is refused too', async () => {
    // Either would leave an inventory row that the rename into the first size
    // carries over — a stray price override, or a zero that reads as sold out.
    const v = await row('clothing', {});
    for (const input of [{ price: 9000 }, { quantityAvailable: 0 }, { isAvailable: false }]) {
      await assert.rejects(
        opsCatalogService.updateInventory(storeId, v, input),
        (e: unknown) => e instanceof AppError && e.statusCode === 409,
      );
    }
    assert.equal((await stockOf(v)).length, 0);
  });

  it('clothing: a sized row can be stocked', async () => {
    const v = await row('clothing', { size: 'M' });
    await opsCatalogService.updateInventory(storeId, v, { quantityAvailable: 5 });
    assert.equal((await stockOf(v))[0]?.quantityAvailable, 5);
  });

  it('grocery: no size axis, stocked as before', async () => {
    const v = await row('grocery', {});
    await opsCatalogService.updateInventory(storeId, v, { quantityAvailable: 5 });
    assert.equal((await stockOf(v))[0]?.quantityAvailable, 5);
  });
});
