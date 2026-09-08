import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../../app';
import { closeDb, db } from '../../db/client';
import { closeRedis } from '../../redis/client';

/**
 * The departments the marketplace home lists.
 *
 * Two properties matter, and they pull in opposite directions. Every active
 * business type is returned **including the empty ones**, because "Bakery —
 * coming soon" is worth saying and an absence says nothing. But `isLive` has to
 * be strict: it promises there is something to buy, and a department card that
 * opens onto an empty shelf is worse than one that admitted it was not ready.
 *
 * So the test that earns its place is the second one — `isLive` must agree with
 * the *same* question the catalogue asks. An earlier version of this mistake put
 * an empty "Cakes" tile on the categories screen by asking "has any product"
 * where the listing asked "has stock".
 */
let base = '';
let close: () => Promise<void> = async () => {};

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
});

after(async () => {
  await close();
  await closeDb();
  await closeRedis();
});

describe('a guest can see the departments', () => {
  it('needs no account', async () => {
    // The marketplace home is the first screen anybody sees, signed in or not.
    assert.equal((await get('/api/v1/catalog/departments')).status, 200);
  });

  it('returns every active type, in the order ops set', async () => {
    const list = (await get('/api/v1/catalog/departments')).json.data as Json[];
    assert.ok(list.length > 1, 'the seed defines several business types');

    const orders = list.map((d) => d.sortOrder as number);
    assert.deepEqual(orders, [...orders].sort((a, b) => a - b), 'sorted by sortOrder');

    for (const d of list) {
      assert.ok(d.key && d.name, 'each department is identifiable');
      assert.equal(typeof d.isLive, 'boolean');
    }
  });

  it('includes the empty ones rather than hiding them', async () => {
    // "Coming soon" is a feature: it says the shop is growing. Filtering these
    // out server-side would take that decision away from the app.
    const list = (await get('/api/v1/catalog/departments')).json.data as Json[];
    assert.ok(
      list.some((d) => d.isLive === false),
      'the seed has at least one department with nothing in it',
    );
  });

  it('carries no presentation — colour and copy belong to the apps', async () => {
    const list = (await get('/api/v1/catalog/departments')).json.data as Json[];
    const keys = new Set(list.flatMap((d) => Object.keys(d)));
    for (const leaked of ['tint', 'colour', 'color', 'examples', 'cta', 'flag', 'icon']) {
      assert.ok(!keys.has(leaked), `${leaked} is the app's business, not the API's`);
    }
  });
});

describe('isLive means the same thing the catalogue means', () => {
  it('is true exactly when a sellable brand has an active, stocked product', async () => {
    /*
     * Asserted against SQL rather than against a fixture, so the two definitions
     * cannot drift apart quietly. If someone loosens the endpoint to "has any
     * product", this fails — which is the whole point, because the symptom
     * otherwise is a department card that opens onto nothing.
     */
    const rows = await db.execute(
      `select bt.key,
              exists (select 1 from brands b
                      join products p on p.brand_id = b.id
                      join product_variants pv on pv.product_id = p.id
                      join inventory i on i.variant_id = pv.id
                      where b.business_type_id = bt.id
                        and b.status = 'active'
                        and p.is_active) as has_stock
       from business_types bt
       where bt.is_active` as never,
    );
    const truth = new Map(
      (rows as unknown as { rows: { key: string; has_stock: boolean }[] }).rows.map((r) => [
        r.key,
        r.has_stock,
      ]),
    );

    const list = (await get('/api/v1/catalog/departments')).json.data as Json[];
    assert.ok(truth.size > 0, 'there are business types to compare against');
    for (const d of list) {
      assert.equal(
        d.isLive,
        truth.get(d.key as string),
        `${d.key}: isLive disagrees with the catalogue's own stock rule`,
      );
    }
  });
});
