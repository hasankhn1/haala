import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../../app';
import { closeDb, db } from '../../db/client';
import { stores } from '../../db/schema';
import { closeRedis } from '../../redis/client';

/**
 * A department is a shop, not a filtered view of everything.
 *
 * This is a regression test for a bug that shipped: the department screen was
 * extracted from the grocery home before the catalogue could be filtered by
 * business type, so opening **Clothing showed the grocery aisles** and grocery's
 * products under them. Typecheck was green throughout — nothing about the shape
 * of a `CategoryView` says which department it belongs to.
 *
 * The two properties, and they are separate because the screen makes two
 * separate requests:
 *
 *  - `/catalog/categories?department=…` returns that department's aisles only
 *  - `/catalog/products?department=…` returns that department's products only,
 *    **including `total`** — a paginated count taken over the whole catalogue
 *    would print "89 products" at the top of a shop that has 17
 *
 * And the third, which is the reason the parameter is optional: omitting it
 * still returns everything, because the Categories tab and search are
 * deliberately cross-department.
 */
let base = '';
let close: () => Promise<void> = async () => {};
let storeId = '';

type Json = Record<string, any>;

async function get(path: string): Promise<{ status: number; json: Json }> {
  const res = await fetch(`${base}${path}`);
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Json };
}

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

  // The store the seed stocks both departments at — a store carrying only one
  // would let a broken filter pass by accident.
  const all = await db.select({ id: stores.id }).from(stores);
  for (const s of all) {
    const home = (await get(`/api/v1/catalog/home?storeId=${s.id}`)).json.data as Json;
    const depts = new Set((home.popularProducts as Json[]).map((p) => p.departmentKey as string));
    if (depts.size > 1) {
      storeId = s.id;
      break;
    }
  }
  assert.ok(storeId, 'no seeded store carries more than one department — this test cannot fail');
});

after(async () => {
  await close();
  await closeDb();
  await closeRedis();
});

describe('a department screen shows only that department', () => {
  for (const department of ['grocery', 'clothing']) {
    it(`${department}: every product belongs to it, and so does the total`, async () => {
      const res = await get(
        `/api/v1/catalog/products?storeId=${storeId}&department=${department}&pageSize=100`,
      );
      assert.equal(res.status, 200);

      const { items, total } = res.json.data as { items: Json[]; total: number };
      assert.ok(items.length > 0, `the seed stocks ${department} at this store`);

      for (const p of items) {
        assert.equal(p.departmentKey, department, `${p.name} is not ${department}`);
      }

      // The count repeats the joins, and once did not repeat this one.
      const unfiltered = (
        await get(`/api/v1/catalog/products?storeId=${storeId}&pageSize=100`)
      ).json.data as { total: number };
      assert.ok(
        total < unfiltered.total,
        `${department} reports ${total} of ${unfiltered.total} — the count ignored the filter`,
      );
      assert.equal(total, items.length, 'the page holds every match, so the total is exact here');
    });

    it(`${department}: its aisles are its own`, async () => {
      const mine = (await get(`/api/v1/catalog/categories?department=${department}`)).json
        .data as Json[];
      assert.ok(mine.length > 0, `${department} has aisles`);

      const other = department === 'grocery' ? 'clothing' : 'grocery';
      const theirs = (await get(`/api/v1/catalog/categories?department=${other}`)).json
        .data as Json[];

      const mineIds = new Set(mine.map((c) => c.id as string));
      for (const c of theirs) {
        assert.ok(!mineIds.has(c.id as string), `${c.name} appears in both departments`);
      }
    });
  }

  it('still returns everything when no department is named', async () => {
    // The Categories tab and search are cross-department on purpose, so the
    // filter must be opt-in rather than a default nobody can switch off.
    const all = (await get('/api/v1/catalog/categories')).json.data as Json[];
    const grocery = (await get('/api/v1/catalog/categories?department=grocery')).json
      .data as Json[];
    const clothing = (await get('/api/v1/catalog/categories?department=clothing')).json
      .data as Json[];

    // Every scoped aisle is in the unscoped list, and the unscoped list is
    // wider than either. (An `all.length === grocery + clothing` equality would
    // be wrong, not merely strict: departments with no stock contribute none.)
    const allIds = new Set(all.map((c) => c.id as string));
    for (const c of [...grocery, ...clothing]) {
      assert.ok(allIds.has(c.id as string), `${c.name} is missing from the unfiltered list`);
    }
    assert.ok(all.length > grocery.length, 'unfiltered is wider than one department');
    assert.ok(all.length > clothing.length);
  });

  it('an unknown department is empty, not everything', async () => {
    // The failure that matters: a typo in a link must not silently open the
    // whole catalogue under one department's heading.
    const res = await get(
      `/api/v1/catalog/products?storeId=${storeId}&department=not_a_department`,
    );
    assert.equal(res.status, 200);
    assert.deepEqual((res.json.data as Json).items, []);
    assert.equal((res.json.data as Json).total, 0);
  });
});
