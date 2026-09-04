import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../../app';
import { closeDb, db } from '../../db/client';
import { closeRedis } from '../../redis/client';

/**
 * The number a rider calls, and the things it must never become.
 *
 * `deliveryPhone` exists so that identity and delivery contact stopped being
 * the same column. These tests pin both halves of that: the server validates
 * and stores it, and saving one **does not create a way to sign in**. If it
 * ever did, changing your phone number would silently change your login and
 * two customers could collide on it.
 *
 * The client validates too, in the sheet, with friendlier wording. That is a
 * courtesy — this is the check.
 */
const SUFFIX = process.env.DELIVERY_PHONE_SUFFIX ?? String(process.pid);
const EMAIL = `delivery.${SUFFIX}@example.test`;
const PASSWORD = 'delivery-test-password';
const GOOD = `+9230055${SUFFIX.replace(/\D/g, '').padStart(5, '0').slice(-5)}`;

let base = '';
let close: () => Promise<void> = async () => {};
let token = '';

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

before(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('These tests need a migrated throwaway database. Set DATABASE_URL.');
  }
  const server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };

  const data = expectOk(
    await call('POST', '/api/v1/auth/email', { body: { email: EMAIL, password: PASSWORD } }),
    'sign up',
  );
  token = data.tokens.accessToken as string;
});

after(async () => {
  await db.execute(`delete from users where email = '${EMAIL}'` as never);
  await close();
  await closeDb();
  await closeRedis();
});

describe('a new account has no delivery number', () => {
  it('starts empty, which is what opens the sheet at checkout', async () => {
    const me = expectOk(await call('GET', '/api/v1/users/me', { token }), 'me');
    assert.equal(me.deliveryPhone, null, 'nothing was invented at sign-up');
    assert.equal(me.phone, null, 'and email sign-up asks for no phone at all');
  });
});

describe('the server validates it, not just the sheet', () => {
  const rejected: [string, string][] = [
    ['03001234567', 'a local format with a leading zero'],
    ['+9230012345', 'too few digits'],
    ['+9230012345678', 'too many digits'],
    ['+443001234567', 'a number from another country'],
    ['3001234567', 'no country code at all'],
    ['not a phone', 'plain text'],
    ['+92 300 123 4567', 'spaces, which E.164 has none of'],
  ];

  for (const [value, why] of rejected) {
    it(`refuses ${why}`, async () => {
      const r = await call('PATCH', '/api/v1/users/me', {
        token,
        body: { deliveryPhone: value },
      });
      assert.equal(r.status, 422, `"${value}" should not be storable`);
    });
  }

  it('accepts a real one and returns the updated customer', async () => {
    const me = expectOk(
      await call('PATCH', '/api/v1/users/me', { token, body: { deliveryPhone: GOOD } }),
      'save',
    );
    assert.equal(me.deliveryPhone, GOOD);
    assert.equal(me.phone, null, 'saving a delivery number is not signing up a phone');
  });

  it('lets it be changed, because a customer may move or mistype', async () => {
    const changed = `+9231155${SUFFIX.replace(/\D/g, '').padStart(5, '0').slice(-5)}`;
    const me = expectOk(
      await call('PATCH', '/api/v1/users/me', { token, body: { deliveryPhone: changed } }),
      'change',
    );
    assert.equal(me.deliveryPhone, changed);
  });

  it('refuses an unauthenticated attempt to set anyone’s number', async () => {
    const r = await call('PATCH', '/api/v1/users/me', { body: { deliveryPhone: GOOD } });
    assert.equal(r.status, 401);
  });
});

describe('it is a contact detail, never a credential', () => {
  it('cannot be used to sign in', async () => {
    // The whole reason `deliveryPhone` is a separate column. If this ever
    // passed, changing a delivery number would change somebody's login.
    const r = await call('POST', '/api/v1/auth/login', {
      body: { phone: GOOD, password: PASSWORD },
    });
    assert.equal(r.status, 401, 'a delivery number is not a way in');
  });

  it('does not have to be unique across customers', async () => {
    // A household sharing one number is ordinary. A unique index here would
    // reject the second person to try it, for no reason anybody could explain.
    const otherEmail = `delivery.share.${SUFFIX}@example.test`;
    const other = expectOk(
      await call('POST', '/api/v1/auth/email', {
        body: { email: otherEmail, password: PASSWORD },
      }),
      'a second customer',
    );
    const shared = expectOk(
      await call('PATCH', '/api/v1/users/me', {
        token: other.tokens.accessToken as string,
        body: { deliveryPhone: GOOD },
      }),
      'the same number again',
    );
    assert.equal(shared.deliveryPhone, GOOD);
    await db.execute(`delete from users where email = '${otherEmail}'` as never);
  });
});
