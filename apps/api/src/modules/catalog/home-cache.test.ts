import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it, mock } from 'node:test';
import { createApp } from '../../app';
import { cacheKey } from '../../common/cache';
import { closeDb, db } from '../../db/client';
import { stores } from '../../db/schema';
import { closeRedis, redis } from '../../redis/client';

/**
 * `GET /catalog/home` and the cache underneath it.
 *
 * Three properties, and only one of them is about speed.
 *
 *  1. **It fails open.** With Redis unreachable the endpoint still answers 200
 *     with real data. This is the property the whole design exists for: a cache
 *     that can take the home screen down has converted a performance concern
 *     into an availability one, which is a straight downgrade.
 *  2. **The key includes the store.** Price is a per-store override and stock is
 *     per-store outright, so a shared key would serve one dark store's shelf to
 *     a shopper standing beside another — showing them things they cannot buy
 *     and prices they will not be charged.
 *  3. **An unrecognised `storeId` cannot mint a key.** The id reaches the cache
 *     key, so without validation `?storeId=1`, `?storeId=2`, … fills Redis with
 *     full home payloads, five minutes at a time, from anyone who can reach the
 *     public endpoint.
 *
 * Redis is not stopped here — that is done by hand against the container, and
 * the mock below is what makes the same failure reproducible in CI. Injecting
 * the failure rather than racing for it is the lesson from `merge.test.ts`.
 */
let base = '';
let close: () => Promise<void> = async () => {};
let storeIds: string[] = [];

type Json = Record<string, any>;

async function get(path: string): Promise<{ status: number; json: Json }> {
  const res = await fetch(`${base}${path}`);
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Json };
}

before(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('These tests need a migrated, seeded throwaway database. Set DATABASE_URL.');
  }
  const rows = await db.select({ id: stores.id }).from(stores).limit(2);
  storeIds = rows.map((r) => r.id);
  assert.ok(storeIds.length >= 2, 'the seed defines at least two stores');

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

describe('the home payload', () => {
  it('answers a guest with every section', async () => {
    const res = await get(`/api/v1/catalog/home?storeId=${storeIds[0]}`);
    assert.equal(res.status, 200);

    const d = res.json.data as Json;
    for (const section of ['departments', 'banners', 'popularCategories', 'popularProducts']) {
      assert.ok(Array.isArray(d[section]), `${section} is an array`);
    }
    assert.ok(d.departments.length > 0, 'the seed defines departments');
  });

  it('answers without a store, so the screen renders while location settles', async () => {
    const res = await get('/api/v1/catalog/home');
    assert.equal(res.status, 200);

    const d = res.json.data as Json;
    assert.ok(d.departments.length > 0, 'departments do not depend on a store');
    // Products do. Returning them unpriced would be worse than omitting them:
    // a card a shopper cannot add to a basket reads as a broken screen.
    assert.deepEqual(d.popularProducts, [], 'no store means no priced products');
  });

  it('only offers categories in departments that are live', async () => {
    const d = (await get(`/api/v1/catalog/home?storeId=${storeIds[0]}`)).json.data as Json;
    const live = new Set(
      (d.departments as Json[]).filter((x) => x.isLive).map((x) => x.key as string),
    );
    for (const c of d.popularCategories as Json[]) {
      assert.ok(live.has(c.departmentKey), `${c.name} is in a live department`);
    }
  });
});

describe('the cache', () => {
  it('still answers when Redis is unreachable', async () => {
    // Both sides of the read-through fail, which is the real outage: a dead
    // Redis does not politely fail only on reads.
    const get_ = mock.method(redis, 'get', async () => {
      throw new Error('Connection is closed.');
    });
    const set_ = mock.method(redis, 'set', async () => {
      throw new Error('Connection is closed.');
    });

    try {
      const res = await get(`/api/v1/catalog/home?storeId=${storeIds[0]}`);
      assert.equal(res.status, 200, 'a dead cache must not fail the request');
      assert.ok(
        (res.json.data as Json).departments.length > 0,
        'and must not return an empty payload either — that would look like an empty shop',
      );
      assert.ok(get_.mock.callCount() > 0, 'the failing read was genuinely attempted');
    } finally {
      get_.mock.restore();
      set_.mock.restore();
    }
  });

  it('gives up on a hung Redis instead of waiting for it', async () => {
    /*
     * The failure the mock above does *not* catch, and the one that actually
     * happened. A stopped Redis does not reject — ioredis queues the command
     * and retries the connection with a growing backoff, so the endpoint
     * answered 200 with correct data in 1.2s, then 4.5s, then 7.8s. Correct and
     * unusable.
     *
     * A promise that never settles is that behaviour taken to its limit. With
     * the timeout removed this test does not fail — it hangs until the runner
     * kills it, which is exactly the shape of the production symptom.
     */
    const get_ = mock.method(redis, 'get', () => new Promise(() => {}));
    const set_ = mock.method(redis, 'set', () => new Promise(() => {}));

    try {
      const started = process.hrtime.bigint();
      const res = await get(`/api/v1/catalog/home?storeId=${storeIds[0]}`);
      const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

      assert.equal(res.status, 200);
      // One timeout for the read and one for the write, plus the real query.
      // The bound is loose because this asserts "bounded", not a budget.
      assert.ok(elapsedMs < 2000, `answered in ${Math.round(elapsedMs)}ms, not blocked on Redis`);
    } finally {
      get_.mock.restore();
      set_.mock.restore();
    }
  });

  it('keys by store, so one store cannot serve another its shelf', async () => {
    const [a, b] = storeIds as [string, string];
    await redis.del(cacheKey('home', a), cacheKey('home', b));

    // Poison A's entry only. If B's response comes back poisoned, the two share
    // a key and every multi-store guarantee in the catalogue is decorative.
    await redis.set(
      cacheKey('home', a),
      JSON.stringify({
        departments: [],
        banners: [],
        popularCategories: [],
        popularProducts: [{ name: 'SENTINEL' }],
      }),
      'EX',
      30,
    );

    const forA = (await get(`/api/v1/catalog/home?storeId=${a}`)).json.data as Json;
    const forB = (await get(`/api/v1/catalog/home?storeId=${b}`)).json.data as Json;

    assert.equal(forA.popularProducts[0]?.name, 'SENTINEL', 'A reads its own entry');
    assert.notEqual(forB.popularProducts[0]?.name, 'SENTINEL', 'B does not read A’s');

    await redis.del(cacheKey('home', a));
  });

  it('cannot be filled with junk keys from the public endpoint', async () => {
    const pattern = `${cacheKey('home', '')}*`;
    const before = new Set(await redis.keys(pattern));

    for (const junk of ['1', '2', 'not-a-uuid', '../../etc', '']) {
      assert.equal((await get(`/api/v1/catalog/home?storeId=${encodeURIComponent(junk)}`)).status, 200);
    }

    const added = (await redis.keys(pattern)).filter((k) => !before.has(k));
    // Every unrecognised id collapses onto the single no-store entry.
    assert.deepEqual(added.sort(), added.length ? [cacheKey('home', 'no-store')] : []);
  });
});
