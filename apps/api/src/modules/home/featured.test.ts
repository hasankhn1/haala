import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { eq, inArray } from 'drizzle-orm';
import { createApp } from '../../app';
import { invalidate } from '../../common/cache';
import { closeDb, db } from '../../db/client';
import { homeProducts, products, stores } from '../../db/schema';
import { closeRedis } from '../../redis/client';

/**
 * "Popular right now" — the curated grid on the marketplace home.
 *
 * The property that carries this feature is that curation is **exclusive**: the
 * grid shows exactly what ops chose, in that order, and nothing else. It
 * replaced an automatic ranking, so the failure mode worth guarding is a
 * silent return to automatic behaviour — a grid that quietly fills itself back
 * up would make a deliberate removal look like a bug.
 *
 * The second property is that curation is **global while availability is not**.
 * The chosen ids are priced against a store, and that pricing query is what
 * drops a feature the store cannot sell. Nothing here re-implements those
 * filters, so the test has to prove they still bite.
 */
let base = '';
let close: () => Promise<void> = async () => {};
let adminToken = '';
let storeId = '';
/** Restored in `after` — this suite runs against the dev database. */
let original: { productId: string; isActive: boolean; sortOrder: number }[] = [];

/** Every cached home payload, across every store. Mirrors `admin.routes.ts`. */
const HOME_CACHE_PREFIX = 'cache:home:';

type Json = Record<string, any>;

async function call(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<{ status: number; json: Json }> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    ...(opts.body === undefined || method === 'GET' ? {} : { body: JSON.stringify(opts.body) }),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Json };
}

/**
 * Replace the curated list wholesale.
 *
 * Writes straight to the table rather than through the admin API, so the cached
 * home payload has to be cleared by hand — the routes do this for real callers.
 * Without it every assertion below reads a five-minute-old answer and the suite
 * passes or fails for reasons that have nothing to do with curation.
 */
async function curate(productIds: string[]): Promise<string[]> {
  await db.delete(homeProducts);
  for (const [i, productId] of productIds.entries()) {
    await db.insert(homeProducts).values({ productId, sortOrder: i });
  }
  await invalidate(HOME_CACHE_PREFIX);
  return productIds;
}

async function popular(store = storeId): Promise<Json[]> {
  const res = await call('GET', `/api/v1/catalog/home?storeId=${store}`);
  assert.equal(res.status, 200);
  return res.json.data.popularProducts as Json[];
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

  original = await db
    .select({
      productId: homeProducts.productId,
      isActive: homeProducts.isActive,
      sortOrder: homeProducts.sortOrder,
    })
    .from(homeProducts);

  const [store] = await db.select({ id: stores.id }).from(stores).limit(1);
  storeId = store!.id;

  const res = await call('POST', '/api/v1/auth/login', {
    body: { phone: '+923009990000', password: 'haala1234' },
  });
  assert.equal(res.status, 200, 'the seeded super admin could not sign in');
  adminToken = res.json.data.tokens.accessToken;
});

after(async () => {
  await db.delete(homeProducts);
  for (const row of original) await db.insert(homeProducts).values(row);
  await close();
  await closeDb();
  await closeRedis();
});

/** Products stocked at `storeId`, so a fixture is never accidentally invisible. */
async function stockedProducts(n: number): Promise<Json[]> {
  const page = (await call('GET', `/api/v1/catalog/products?storeId=${storeId}&pageSize=100`)).json
    .data as Json;
  const stocked = (page.items as Json[]).filter((p) => p.inStock);
  assert.ok(stocked.length >= n, `need ${n} stocked products at this store`);
  return stocked.slice(0, n);
}

describe('the curated grid is exclusive', () => {
  it('shows exactly what is curated, and nothing else', async () => {
    const picks = await stockedProducts(3);
    await curate(picks.map((p) => p.id as string));

    const shown = await popular();
    assert.deepEqual(
      shown.map((p) => p.id),
      picks.map((p) => p.id),
      'the grid is the curated list — no automatic top-up',
    );
  });

  it('honours the order ops arranged', async () => {
    const picks = await stockedProducts(4);
    // Deliberately not catalogue order: reversed, so a grid that fell back to
    // any natural ordering fails rather than coincidentally passing.
    const reversed = [...picks].reverse().map((p) => p.id as string);
    await curate(reversed);

    assert.deepEqual((await popular()).map((p) => p.id), reversed);
  });

  it('disappears entirely when nothing is curated', async () => {
    await curate([]);
    assert.deepEqual(await popular(), [], 'no curation means no section, not a fallback');
  });

  it('omits a feature that is switched off', async () => {
    const picks = await stockedProducts(2);
    await curate(picks.map((p) => p.id as string));
    await db
      .update(homeProducts)
      .set({ isActive: false })
      .where(eq(homeProducts.productId, picks[0]!.id as string));
    await invalidate(HOME_CACHE_PREFIX);

    const shown = await popular();
    assert.equal(shown.length, 1);
    assert.equal(shown[0]!.id, picks[1]!.id);
  });
});

describe('availability still decides, not curation', () => {
  it('drops a featured product whose shop is off sale', async () => {
    const picks = await stockedProducts(2);
    await curate(picks.map((p) => p.id as string));

    const victim = picks[0]!.id as string;
    await db.update(products).set({ isActive: false }).where(eq(products.id, victim));
    await invalidate(HOME_CACHE_PREFIX);
    try {
      const shown = await popular();
      assert.ok(
        !shown.some((p) => p.id === victim),
        'featuring something does not override it being off sale',
      );
      assert.equal(shown.length, 1, 'and the rest of the list is unaffected');
    } finally {
      await db.update(products).set({ isActive: true }).where(eq(products.id, victim));
      await invalidate(HOME_CACHE_PREFIX);
    }
  });

  it('still reports it to the dashboard, so an editor can see why', async () => {
    // The opposite of the rule above: withheld from the app, but visible in the
    // admin list — an editor needs to see a choice precisely because it is not
    // appearing.
    const picks = await stockedProducts(1);
    await curate(picks.map((p) => p.id as string));

    const victim = picks[0]!.id as string;
    await db.update(products).set({ isActive: false }).where(eq(products.id, victim));
    try {
      const listed = (await call('GET', '/api/v1/admin/home-products', { token: adminToken })).json
        .data as Json[];
      const row = listed.find((f) => f.productId === victim);
      assert.ok(row, 'the feature is still listed for the editor');
      assert.equal(row!.sellable, false, 'and flagged as not sellable');
    } finally {
      await db.update(products).set({ isActive: true }).where(eq(products.id, victim));
    }
  });
});

describe('only a super admin may curate', () => {
  it('turns a guest away', async () => {
    assert.equal((await call('GET', '/api/v1/admin/home-products')).status, 401);
    assert.equal((await call('GET', '/api/v1/admin/products')).status, 401);
  });

  it('rejects a product id that does not exist', async () => {
    const res = await call('POST', '/api/v1/admin/home-products', {
      token: adminToken,
      body: { productId: '00000000-0000-0000-0000-000000000000' },
    });
    assert.equal(res.status, 404);
  });

  it('featuring the same product twice does not duplicate it', async () => {
    const picks = await stockedProducts(1);
    await curate([]);

    const id = picks[0]!.id as string;
    for (const _ of [1, 2]) {
      const res = await call('POST', '/api/v1/admin/home-products', {
        token: adminToken,
        body: { productId: id },
      });
      assert.equal(res.status, 201);
    }

    const rows = await db
      .select({ id: homeProducts.id })
      .from(homeProducts)
      .where(inArray(homeProducts.productId, [id]));
    assert.equal(rows.length, 1, 'featuring twice is a reorder, not a second row');
  });
});
