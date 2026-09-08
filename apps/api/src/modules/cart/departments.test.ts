import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { eq, sql } from 'drizzle-orm';
import { CART_TTL_DAYS } from '@haala/shared';
import { createApp } from '../../app';
import { closeDb, db } from '../../db/client';
import { carts, stores } from '../../db/schema';
import { closeRedis } from '../../redis/client';

/**
 * One basket per department, and what happens to a basket nobody touches.
 *
 * Two properties.
 *
 * **A shirt cannot land in the grocery basket.** The department is read from
 * the product's brand, server-side, and there is no request field that can say
 * otherwise. That is the whole guarantee: an order is picked and dispatched
 * from one shop, so a basket that mixes a dark store with a boutique produces
 * an order nobody can fulfil.
 *
 * **A basket expires after `CART_TTL_DAYS`.** Prices and stock move; restoring
 * an eight-day-old basket at checkout, priced as it was, is a worse surprise
 * than finding it empty. The sweep runs on read rather than on a schedule —
 * there is no scheduler here, and a basket only matters when somebody looks.
 */
let base = '';
let close: () => Promise<void> = async () => {};
let storeId = '';
let grocery: string[] = [];
let clothing: string[] = [];
let storePoint = { latitude: 0, longitude: 0 };

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

let seq = 0;
async function signUp(): Promise<{ token: string; userId: string }> {
  seq += 1;
  const res = await call('POST', '/api/v1/auth/register', {
    body: {
      name: `Basket Test ${seq}`,
      phone: `+9230${String(Date.now()).slice(-8)}${seq}`.slice(0, 13),
      password: 'haala1234',
    },
  });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  return { token: res.json.data.tokens.accessToken, userId: res.json.data.user.id };
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

  // A store stocking both departments, so the split can actually be observed.
  // Read from the database rather than `GET /stores`, which wants coordinates
  // and answers with serviceability — neither of which this test is about.
  const { token } = await signUp();
  const allStores = await db.select({ id: stores.id }).from(stores);
  for (const s of allStores) {
    const page = (
      await call('GET', `/api/v1/catalog/products?storeId=${s.id}&pageSize=100`, { token })
    ).json.data as Json;
    const stocked = (page.items as Json[]).filter((p) => p.inStock && p.defaultVariantId);
    const g = stocked.filter((p) => p.departmentKey === 'grocery');
    const c = stocked.filter((p) => p.departmentKey === 'clothing');
    if (g.length >= 1 && c.length >= 1) {
      storeId = s.id as string;
      grocery = g.slice(0, 2).map((p) => p.defaultVariantId as string);
      clothing = c.slice(0, 1).map((p) => p.defaultVariantId as string);
      break;
    }
  }
  assert.ok(storeId, 'no seeded store stocks both grocery and clothing — this test cannot fail');

  // The store's own coordinates, so a delivery address is unambiguously inside
  // its area. Placement re-checks serviceability, and an address outside it
  // fails for a reason that has nothing to do with baskets.
  const [point] = await db
    .select({ latitude: stores.latitude, longitude: stores.longitude })
    .from(stores)
    .where(eq(stores.id, storeId));
  storePoint = { latitude: Number(point!.latitude), longitude: Number(point!.longitude) };
});

after(async () => {
  await close();
  await closeDb();
  await closeRedis();
});

describe('baskets are per department', () => {
  it('puts a shirt and a bag of rice in different baskets', async () => {
    const { token } = await signUp();

    await call('POST', '/api/v1/cart/items', {
      token,
      body: { storeId, variantId: grocery[0], quantity: 2 },
    });
    await call('POST', '/api/v1/cart/items', {
      token,
      body: { storeId, variantId: clothing[0], quantity: 1 },
    });

    const baskets = (await call('GET', '/api/v1/cart', { token })).json.data.baskets as Json[];
    assert.equal(baskets.length, 2);

    const byKey = new Map(baskets.map((b) => [b.departmentKey as string, b]));
    assert.equal(byKey.get('grocery')!.itemCount, 2);
    assert.equal(byKey.get('clothing')!.itemCount, 1);
    for (const [key, b] of byKey) {
      assert.equal((b.items as Json[]).length, 1, `${key} holds only its own line`);
    }
  });

  it('keeps their totals apart', async () => {
    // The reason they are separate at all: each becomes its own order with its
    // own delivery fee, so a combined subtotal would price an order that is
    // never placed.
    const { token } = await signUp();
    await call('POST', '/api/v1/cart/items', {
      token,
      body: { storeId, variantId: grocery[0], quantity: 1 },
    });
    await call('POST', '/api/v1/cart/items', {
      token,
      body: { storeId, variantId: clothing[0], quantity: 1 },
    });

    const baskets = (await call('GET', '/api/v1/cart', { token })).json.data.baskets as Json[];
    const totals = baskets.map((b) => b.subtotal as number);
    assert.equal(totals.length, 2);
    for (const t of totals) assert.ok(t > 0);
    // Each basket's subtotal is its own lines, never the sum of both.
    for (const b of baskets) {
      const own = (b.items as Json[]).reduce((n, i) => n + (i.lineTotal as number), 0);
      assert.equal(b.subtotal, own);
    }
  });

  it('emptying one leaves the other alone', async () => {
    const { token } = await signUp();
    await call('POST', '/api/v1/cart/items', {
      token,
      body: { storeId, variantId: grocery[0], quantity: 1 },
    });
    await call('POST', '/api/v1/cart/items', {
      token,
      body: { storeId, variantId: clothing[0], quantity: 1 },
    });

    assert.equal((await call('DELETE', '/api/v1/cart?department=grocery', { token })).status, 200);

    const baskets = (await call('GET', '/api/v1/cart', { token })).json.data.baskets as Json[];
    assert.equal(baskets.length, 1, 'the emptied basket drops out of the switcher');
    assert.equal(baskets[0]!.departmentKey, 'clothing');
    assert.equal(baskets[0]!.itemCount, 1);
  });

  it('adjusts a line without being told which basket holds it', async () => {
    // The stepper on a product card knows a variant, not a department. Making
    // the client name the basket would be asking it to derive something it
    // would sometimes derive wrong.
    const { token } = await signUp();
    await call('POST', '/api/v1/cart/items', {
      token,
      body: { storeId, variantId: clothing[0], quantity: 1 },
    });

    const res = await call('PATCH', `/api/v1/cart/items/${clothing[0]}`, {
      token,
      body: { quantity: 3 },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.data.departmentKey, 'clothing');
    assert.equal(res.json.data.itemCount, 3);
  });
});

describe('an order draws from one basket', () => {
  it('places one department and leaves the other standing', async () => {
    /*
     * The reason baskets are split at all. An order is picked and dispatched
     * from one shop, so placing "the cart" when a customer holds two would
     * either produce an order nobody can fulfil or quietly throw one away.
     */
    const { token } = await signUp();
    await call('POST', '/api/v1/cart/items', {
      token,
      body: { storeId, variantId: grocery[0], quantity: 1 },
    });
    await call('POST', '/api/v1/cart/items', {
      token,
      body: { storeId, variantId: clothing[0], quantity: 1 },
    });

    const address = await call('POST', '/api/v1/addresses', {
      token,
      body: {
        label: 'home',
        line1: 'House 1, Street 1',
        area: 'DHA Phase 1',
        city: 'Peshawar',
        latitude: storePoint.latitude,
        longitude: storePoint.longitude,
      },
    });
    assert.equal(address.status, 201, JSON.stringify(address.json));

    const placed = await call('POST', '/api/v1/orders', {
      token,
      body: {
        department: 'clothing',
        addressId: address.json.data.id,
        paymentMethod: 'cod',
      },
    });
    assert.equal(placed.status, 201, JSON.stringify(placed.json));

    const items = placed.json.data.order.items as Json[];
    assert.equal(items.length, 1, 'only the clothing line was ordered');

    const after = (await call('GET', '/api/v1/cart', { token })).json.data.baskets as Json[];
    assert.equal(after.length, 1, 'the grocery basket survives');
    assert.equal(after[0]!.departmentKey, 'grocery');
    assert.equal(after[0]!.itemCount, 1, 'with its contents intact');
  });
});

describe(`a basket expires after ${CART_TTL_DAYS} days`, () => {
  it('is emptied, and says so once', async () => {
    const { token, userId } = await signUp();
    await call('POST', '/api/v1/cart/items', {
      token,
      body: { storeId, variantId: grocery[0], quantity: 1 },
    });

    // Age it past the cutoff. Faking the clock is the only way to test this
    // without waiting a week, and it is the row's own timestamp that the sweep
    // reads — so this exercises the real predicate.
    await db
      .update(carts)
      .set({ updatedAt: sql`now() - interval '${sql.raw(String(CART_TTL_DAYS + 1))} days'` })
      .where(eq(carts.userId, userId));

    const first = (await call('GET', '/api/v1/cart', { token })).json.data.baskets as Json[];
    assert.equal(first.length, 1, 'the expired basket is still reported, once');
    assert.equal(first[0]!.expired, true, 'and it says it expired');
    assert.equal(first[0]!.itemCount, 0, 'but it is empty');

    const second = (await call('GET', '/api/v1/cart', { token })).json.data.baskets as Json[];
    assert.deepEqual(second, [], 'and on the next read it is simply gone');
  });

  it('leaves a basket that is still being used', async () => {
    const { token, userId } = await signUp();
    await call('POST', '/api/v1/cart/items', {
      token,
      body: { storeId, variantId: grocery[0], quantity: 1 },
    });

    // One day short of the cutoff.
    await db
      .update(carts)
      .set({ updatedAt: sql`now() - interval '${sql.raw(String(CART_TTL_DAYS - 1))} days'` })
      .where(eq(carts.userId, userId));

    const baskets = (await call('GET', '/api/v1/cart', { token })).json.data.baskets as Json[];
    assert.equal(baskets.length, 1);
    assert.equal(baskets[0]!.itemCount, 1, 'still there');
    assert.notEqual(baskets[0]!.expired, true);
  });

  it('starts the clock again when the customer touches it', async () => {
    /*
     * The bug this guards: item edits write `cart_items.updated_at`, which says
     * nothing about the basket row. Without an explicit touch, a basket
     * somebody adds to every day would still be swept on day eight.
     */
    const { token, userId } = await signUp();
    await call('POST', '/api/v1/cart/items', {
      token,
      body: { storeId, variantId: grocery[0], quantity: 1 },
    });

    await db
      .update(carts)
      .set({ updatedAt: sql`now() - interval '${sql.raw(String(CART_TTL_DAYS + 1))} days'` })
      .where(eq(carts.userId, userId));

    // Adding a second line is "using it", and must reset the clock.
    await call('POST', '/api/v1/cart/items', {
      token,
      body: { storeId, variantId: grocery[1], quantity: 1 },
    });

    const baskets = (await call('GET', '/api/v1/cart', { token })).json.data.baskets as Json[];
    assert.equal(baskets.length, 1);
    assert.notEqual(baskets[0]!.expired, true, 'a basket in daily use is never swept');
    assert.ok((baskets[0]!.itemCount as number) >= 1, 'and it keeps its contents');
  });
});
