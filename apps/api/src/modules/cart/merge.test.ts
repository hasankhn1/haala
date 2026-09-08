import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../../app';
import { closeDb, db } from '../../db/client';
import { closeRedis } from '../../redis/client';

/**
 * Handing a guest basket to the account that just signed in.
 *
 * The design's non-negotiable is that authentication is an interruption to
 * checkout, not a journey of its own — nothing may be lost crossing it. So the
 * cases worth testing are the ones where a naive merge silently loses items:
 * a line that sold out while the guest was browsing, one whose quantity no
 * longer fits, and an existing basket from a different store.
 *
 * The rule throughout: **one bad line must not cost the basket.** Failing the
 * whole request throws away the good lines; dropping them quietly is worse,
 * because the customer reaches checkout short of things they believe they
 * chose. Merge what can be merged, and say what could not.
 */
const SUFFIX = process.env.MERGE_SUFFIX ?? String(process.pid);
const PASSWORD = 'merge-test-password';

let base = '';
let close: () => Promise<void> = async () => {};
let token = '';
let storeId = '';
let otherStoreId = '';
/** Two sellable variants at `storeId`, and how many of each exist. */
let inStock: { variantId: string; qty: number }[] = [];
/**
 * A variant that is sellable **at `otherStoreId`**.
 *
 * Stock is held per store *and* variant, so a variant with stock at `storeId`
 * says nothing about the other store — seeding the "different store" basket
 * with one of `inStock` only worked here by luck, and started returning
 * `OUT_OF_STOCK` as soon as the seeded quantities moved.
 */
let crossDepartment: string | null = null;
let otherStoreVariant: string | null = null;
const madeUsers: string[] = [];

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
    ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Json };
}

function expectOk(r: { status: number; json: Json }, what: string): Json {
  assert.ok(
    r.status >= 200 && r.status < 300,
    `${what} failed with ${r.status}: ${JSON.stringify(r.json)}`,
  );
  return r.json.data as Json;
}

/** A fresh customer per test, so one merge cannot colour the next. */
async function signUp(tag: string): Promise<string> {
  const digits = `${SUFFIX}${tag}`.replace(/\D/g, '').padStart(8, '0').slice(-8);
  const data = expectOk(
    await call('POST', '/api/v1/auth/email', {
      body: { email: `merge.${tag}.${SUFFIX}@example.test`, password: PASSWORD },
    }),
    `sign up ${tag}`,
  );
  madeUsers.push(data.user.id as string);
  return data.tokens.accessToken as string;
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

  token = await signUp('setup');

  const stores = expectOk(await call('GET', '/api/v1/ops/stores', { token: await adminToken() }), 'stores') as unknown as Json[];
  assert.ok(stores.length >= 1, 'the database needs at least one seeded store');
  storeId = stores[0].id as string;
  otherStoreId = (stores[1]?.id as string) ?? storeId;

  const page = expectOk(
    await call('GET', `/api/v1/catalog/products?storeId=${storeId}&pageSize=40`, { token }),
    'catalogue',
  );
  /*
   * Both from the **same department**, deliberately.
   *
   * Baskets are per department, so an unfiltered "first two stocked products"
   * started spanning grocery and clothing the day clothing went live — and
   * every assertion here about "the basket" then checked whichever of two came
   * back first. The split across departments is worth testing and is tested
   * below; these fixtures exist to test everything else.
   */
  const groceryProducts = (page.items as Json[]).filter(
    (p) => p.inStock && p.defaultVariantId && p.departmentKey === 'grocery',
  );
  inStock = groceryProducts
    .slice(0, 2)
    .map((p) => ({ variantId: p.defaultVariantId as string, qty: Number(p.availableQty) }));
  assert.equal(inStock.length, 2, 'the seeded catalogue needs two stocked grocery products');

  crossDepartment =
    ((page.items as Json[]).find(
      (p) => p.inStock && p.defaultVariantId && p.departmentKey !== 'grocery',
    )?.defaultVariantId as string) ?? null;

  if (otherStoreId !== storeId) {
    const otherPage = expectOk(
      await call('GET', `/api/v1/catalog/products?storeId=${otherStoreId}&pageSize=40`, { token }),
      'the other store’s catalogue',
    );
    otherStoreVariant =
      ((otherPage.items as Json[]).find((p) => p.inStock && p.defaultVariantId)
        ?.defaultVariantId as string) ?? null;
  }
});

async function adminToken(): Promise<string> {
  const data = expectOk(
    await call('POST', '/api/v1/auth/login', {
      body: { phone: '+923009990000', password: 'haala1234' },
    }),
    'ops login',
  );
  return data.tokens.accessToken as string;
}

after(async () => {
  for (const id of madeUsers) {
    await db.execute(`delete from users where id = '${id}'` as never);
  }
  await close();
  await closeDb();
  await closeRedis();
});

/**
 * The one basket a merge produced.
 *
 * `merge` now returns *every* basket, because a device-held basket can span
 * departments. Every fixture in this suite is grocery, so exactly one comes
 * back — asserted here rather than assumed, so a future fixture that
 * accidentally crosses departments fails loudly instead of silently checking
 * the wrong basket.
 */
function onlyBasket(result: Json): Json {
  const baskets = result.baskets as Json[];
  assert.equal(baskets.length, 1, `expected one basket, got ${baskets.map((b) => b.departmentKey).join(', ')}`);
  return baskets[0] as Json;
}

describe('a guest basket survives signing in', () => {
  it('arrives intact', async () => {
    const t = await signUp('intact');
    const result = expectOk(
      await call('POST', '/api/v1/cart/merge', {
        token: t,
        body: {
          storeId,
          items: inStock.map((v) => ({ variantId: v.variantId, quantity: 1 })),
        },
      }),
      'merge',
    );

    assert.equal(onlyBasket(result).items.length, 2, 'both lines made it');
    assert.equal(onlyBasket(result).itemCount, 2);
    assert.equal(onlyBasket(result).storeId, storeId);
    assert.deepEqual(result.skipped, []);
    assert.deepEqual(result.adjusted, []);
  });

  it('prices from the server, never from the client', async () => {
    // The client sends no prices at all, so there is nothing to trust. This
    // asserts the merged line carries a real catalogue price rather than a zero
    // or a number a phone made up.
    const t = await signUp('pricing');
    const result = expectOk(
      await call('POST', '/api/v1/cart/merge', {
        token: t,
        body: { storeId, items: [{ variantId: inStock[0].variantId, quantity: 2 }] },
      }),
      'merge',
    );
    const line = (onlyBasket(result).items as Json[])[0];
    assert.ok(Number(line.unitPrice) > 0, 'a real price was resolved');
    assert.equal(Number(line.lineTotal), Number(line.unitPrice) * 2);
  });

  it('adds to what the account already held rather than replacing it', async () => {
    const t = await signUp('adds');
    expectOk(
      await call('POST', '/api/v1/cart/items', {
        token: t,
        body: { storeId, variantId: inStock[0].variantId, quantity: 1 },
      }),
      'seed a server basket',
    );

    const result = expectOk(
      await call('POST', '/api/v1/cart/merge', {
        token: t,
        body: { storeId, items: [{ variantId: inStock[0].variantId, quantity: 1 }] },
      }),
      'merge',
    );
    const line = (onlyBasket(result).items as Json[]).find((i) => i.variantId === inStock[0].variantId);
    assert.equal(Number(line?.quantity), 2, 'one on the phone plus one in the account is two');
  });
});

describe('a device basket that spans departments', () => {
  it('splits into one basket per department rather than one mixed basket', async () => {
    /*
     * The property the whole per-department split rests on. A phone holds one
     * list of lines with no notion of department; the server decides where each
     * belongs from the product's brand, so a guest who added rice and a shirt
     * must arrive with two baskets — not one basket that cannot be dispatched.
     */
    if (!crossDepartment) {
      assert.fail('the seed needs a stocked product outside grocery for this test to mean anything');
    }

    const token = await signUp('cross-department');
    const result = expectOk(
      await call('POST', '/api/v1/cart/merge', {
        token,
        body: {
          storeId,
          items: [
            { variantId: inStock[0]!.variantId, quantity: 1 },
            { variantId: crossDepartment, quantity: 1 },
          ],
        },
      }),
      'merge',
    );

    const baskets = result.baskets as Json[];
    assert.equal(baskets.length, 2, 'two departments, two baskets');
    assert.deepEqual(
      [...new Set(baskets.map((b) => b.departmentKey))].sort(),
      ['clothing', 'grocery'],
      'and they are the departments the lines came from',
    );

    for (const b of baskets) {
      assert.equal((b.items as Json[]).length, 1, `${b.departmentKey} holds only its own line`);
      assert.equal(b.storeId, storeId);
    }
    assert.deepEqual(result.skipped, [], 'nothing was dropped in the process');
  });
});

describe('what cannot be merged is reported, never dropped', () => {
  it('keeps the good lines when one is unavailable', async () => {
    const t = await signUp('partial');
    const ghost = '00000000-0000-4000-8000-000000000000';
    const result = expectOk(
      await call('POST', '/api/v1/cart/merge', {
        token: t,
        body: {
          storeId,
          items: [
            { variantId: inStock[0].variantId, quantity: 1 },
            { variantId: ghost, quantity: 1 },
          ],
        },
      }),
      'merge with one bad line',
    );

    assert.equal(onlyBasket(result).items.length, 1, 'the good line survived');
    assert.equal(result.skipped.length, 1, 'and the bad one was reported');
    assert.equal((result.skipped as Json[])[0].variantId, ghost);
    assert.ok((result.skipped as Json[])[0].reason, 'with a reason worth showing');
  });

  it('caps a quantity at what is in stock and says it did', async () => {
    const t = await signUp('capped');
    const target = inStock[0];
    const tooMany = target.qty + 5;

    const result = expectOk(
      await call('POST', '/api/v1/cart/merge', {
        token: t,
        body: { storeId, items: [{ variantId: target.variantId, quantity: Math.min(tooMany, 99) }] },
      }),
      'merge more than exists',
    );

    const line = (onlyBasket(result).items as Json[])[0];
    assert.ok(
      Number(line.quantity) <= target.qty,
      `merged ${line.quantity} but only ${target.qty} exist`,
    );
    assert.equal(result.adjusted.length, 1, 'the reduction was reported');
  });

  it('replaces a basket from a different store, and flags that it did', async () => {
    // Needs two seeded stores, and something actually sellable at the second.
    if (otherStoreId === storeId || !otherStoreVariant) return;
    const t = await signUp('twostores');
    expectOk(
      await call('POST', '/api/v1/cart/items', {
        token: t,
        body: { storeId: otherStoreId, variantId: otherStoreVariant, quantity: 1 },
      }),
      'seed a basket at the other store',
    );

    const result = expectOk(
      await call('POST', '/api/v1/cart/merge', {
        token: t,
        body: { storeId, items: [{ variantId: inStock[1].variantId, quantity: 1 }] },
      }),
      'merge from a different store',
    );

    assert.equal(result.replacedOtherStore, true, 'the caller must be told');
    assert.equal(onlyBasket(result).storeId, storeId, 'the basket they were just filling wins');
    assert.equal(onlyBasket(result).items.length, 1, 'and the other store’s lines are gone');
  });

  it('refuses an unauthenticated merge', async () => {
    const r = await call('POST', '/api/v1/cart/merge', {
      body: { storeId, items: [{ variantId: inStock[0].variantId, quantity: 1 }] },
    });
    assert.equal(r.status, 401, 'there is no account to merge into');
  });
});
