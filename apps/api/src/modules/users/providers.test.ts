import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../../app';
import { closeDb, db } from '../../db/client';
import { closeRedis } from '../../redis/client';

/**
 * The ways in, as the account screen sees them.
 *
 * The property worth protecting here is a negative one: **`providerUserId` must
 * never appear in the response.** That column holds Google's `sub`, and our own
 * email and phone providers store the address or number itself. It is the value
 * `authProviderRepository.findUser` matches an incoming identity against, so it
 * is the one field that must stay server-side — an identifier the linking logic
 * trusts should never make a round trip through a client.
 *
 * A leak here would not break anything visible, which is exactly why it needs a
 * test rather than a review.
 */
const SUFFIX = process.env.PROVIDERS_SUFFIX ?? String(process.pid);
const EMAIL = `providers.${SUFFIX}@example.test`;
const PASSWORD = 'providers-test-password';

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

describe('a customer can see how they sign in', () => {
  it('lists the identity their account was created with', async () => {
    const list = expectOk(
      await call('GET', '/api/v1/users/me/providers', { token }),
      'providers',
    ) as unknown as Json[];

    assert.ok(Array.isArray(list), 'an array of ways in');
    assert.equal(list.length, 1, 'an email signup has exactly one');
    assert.equal(list[0].provider, 'email');
    assert.ok(list[0].linkedAt, 'and says when it was added');
  });

  it('refuses an unauthenticated caller', async () => {
    // There is no id in the route, so this is the only way to ask — and it must
    // be tied to a token rather than open.
    assert.equal((await call('GET', '/api/v1/users/me/providers')).status, 401);
  });
});

describe('the provider identity itself never leaves the server', () => {
  it('omits providerUserId, whatever shape the response takes', async () => {
    const r = await call('GET', '/api/v1/users/me/providers', { token });
    const raw = JSON.stringify(r.json);

    // Checked against the serialised body rather than a field, so a rename or a
    // nested copy cannot slip past.
    assert.ok(
      !raw.includes('providerUserId'),
      `the response must not carry providerUserId: ${raw}`,
    );
    // The email signup's providerUserId *is* the address, so its presence in
    // this payload would be the leak itself.
    assert.ok(
      !raw.includes(EMAIL),
      `the provider identity must not be echoed back: ${raw}`,
    );
  });

  it('still holds it in the database, which is where it belongs', async () => {
    // Proves the omission is a deliberate mapping rather than the column being
    // empty — otherwise the test above would pass for the wrong reason.
    const rows = await db.execute(
      `select provider_user_id from auth_providers
       where user_id = (select id from users where email = '${EMAIL}')` as never,
    );
    const found = (rows as unknown as { rows: { provider_user_id: string }[] }).rows;
    assert.equal(found.length, 1);
    assert.equal(found[0].provider_user_id, EMAIL, 'the server does know it');
  });
});
