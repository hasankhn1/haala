import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../../app';
import { closeDb } from '../../db/client';
import { closeRedis } from '../../redis/client';

/**
 * What somebody with no account can reach.
 *
 * The customer app has had no sign-in wall since Phase 4 — "guests browse, fill
 * a basket, pick a store, and are asked for nothing until checkout" — but the
 * API kept `router.use(authenticate)` on the catalogue and the store lookup, so
 * every browse request answered 401 and the shop rendered empty. The client half
 * of that change shipped and the server half did not.
 *
 * Both halves of the boundary are pinned here, because each fails in a way the
 * other cannot catch: an over-open route leaks, and an over-closed one is the
 * bug above. Re-adding a blanket `authenticate` to either router is the obvious
 * regression, and nothing else would notice it.
 */
let base = '';
let close: () => Promise<void> = async () => {};

type Json = Record<string, any>;

async function get(path: string, token?: string): Promise<{ status: number; json: Json }> {
  const res = await fetch(`${base}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
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

describe('a guest can browse the shop', () => {
  it('lists stores without a token', async () => {
    const r = await get('/api/v1/stores?lat=34.0&lng=71.5');
    assert.equal(r.status, 200, `browsing must not need an account: ${JSON.stringify(r.json)}`);
  });

  it('lists categories without a token', async () => {
    const r = await get('/api/v1/catalog/categories');
    assert.equal(r.status, 200, JSON.stringify(r.json));
  });

  it('lists products for a store without a token', async () => {
    const stores = await get('/api/v1/stores?lat=34.0&lng=71.5');
    const data = stores.json.data as Json;
    const list = (Array.isArray(data) ? data : (data.items as Json[])) ?? [];
    assert.ok(list.length > 0, 'the seeded database needs a store');

    const r = await get(`/api/v1/catalog/products?storeId=${list[0].id}&pageSize=3`);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.ok(((r.json.data as Json).items as Json[]).length > 0, 'and something to buy');
  });

  it('is not confused by a stale token', async () => {
    // Somebody whose access token expired while the app was backgrounded should
    // see the shop, not an error — which is why these routes use
    // `optionalAuthenticate` rather than simply having no guard.
    const r = await get('/api/v1/catalog/categories', 'not.a.real.jwt');
    assert.equal(r.status, 200, 'a bad token on a public route means anonymous');
  });
});

describe('everything that depends on who is asking still needs a token', () => {
  // Guarding against the opposite mistake: opening these while opening the
  // catalogue would hand one customer another's orders.
  const guarded = [
    '/api/v1/cart',
    '/api/v1/users/me',
    '/api/v1/users/me/providers',
    '/api/v1/orders',
    '/api/v1/addresses',
    '/api/v1/notifications',
  ];

  for (const path of guarded) {
    it(`refuses ${path} to a guest`, async () => {
      assert.equal((await get(path)).status, 401);
    });
  }
});
