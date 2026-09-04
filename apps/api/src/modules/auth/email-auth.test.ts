import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../../app';
import { closeDb, db } from '../../db/client';
import { authProviderRepository } from './auth-provider.repository';
import { userRepository } from '../users/user.repository';
import { closeRedis } from '../../redis/client';

/**
 * Email sign-in, which is also sign-up.
 *
 * The behaviour worth pinning is not "can you log in" — it is that **one person
 * ends up as one customer** however they arrive. A phone signup who later uses
 * their email must land on the same row, and must still be able to use their
 * phone afterwards; that is the case that would quietly fork an account in two
 * and take their order history with it.
 *
 * Needs a migrated throwaway database, as with `isolation.test.ts`.
 */
const SUFFIX = process.env.EMAIL_AUTH_SUFFIX ?? String(process.pid);
const PASSWORD = 'email-auth-test-pw';
const NEW_EMAIL = `new.person.${SUFFIX}@example.test`;
const OWNED_EMAIL = `owner.${SUFFIX}@example.test`;
const OWNED_PHONE = `+9232${SUFFIX.replace(/\D/g, '').padStart(8, '0').slice(-8)}`;

let base = '';
let close: () => Promise<void> = async () => {};

type Json = Record<string, any>;

async function call(path: string, body: unknown): Promise<{ status: number; json: Json }> {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
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

  // A customer who signed up the original way and happens to have an email on
  // file — the shape of every account that predates email sign-in.
  expectOk(
    await call('/api/v1/auth/register', {
      name: 'Owner',
      phone: OWNED_PHONE,
      email: OWNED_EMAIL,
      password: PASSWORD,
    }),
    'seed a phone account',
  );
});

after(async () => {
  for (const email of [NEW_EMAIL, OWNED_EMAIL]) {
    await db.execute(`delete from users where email = '${email}'` as never);
  }
  await close();
  await closeDb();
  await closeRedis();
});

describe('an unknown address becomes an account', () => {
  it('creates one and says so', async () => {
    const r = await call('/api/v1/auth/email', { email: NEW_EMAIL, password: PASSWORD });
    assert.equal(r.status, 201, 'a created account should be a 201');
    const data = expectOk(r, 'create');
    assert.equal(data.created, true);
    assert.equal(data.user.email, NEW_EMAIL);
    // The two things sign-up deliberately does not collect.
    assert.equal(data.user.phone, null, 'sign-up must not invent a phone');
    assert.equal(data.user.deliveryPhone, null, 'checkout collects this, not sign-up');
    assert.ok(data.tokens.accessToken);
  });

  it('signs the same person in the second time rather than creating again', async () => {
    const r = await call('/api/v1/auth/email', { email: NEW_EMAIL, password: PASSWORD });
    assert.equal(r.status, 200);
    assert.equal(expectOk(r, 'second sign-in').created, false);
  });

  it('normalises case and whitespace, so one address is one account', async () => {
    const r = await call('/api/v1/auth/email', {
      email: `  ${NEW_EMAIL.toUpperCase()}  `,
      password: PASSWORD,
    });
    assert.equal(expectOk(r, 'normalised').created, false, 'must not create a second account');
  });

  it('refuses the wrong password without saying whether the account exists', async () => {
    const r = await call('/api/v1/auth/email', { email: NEW_EMAIL, password: 'not-the-password' });
    assert.equal(r.status, 401);
    assert.doesNotMatch(
      JSON.stringify(r.json).toLowerCase(),
      /no account|not found|does not exist|unknown email/,
      'the message must not confirm or deny the account',
    );
  });

  it('requires a password long enough to be one', async () => {
    const r = await call('/api/v1/auth/email', { email: `short.${SUFFIX}@x.test`, password: 'abc' });
    assert.equal(r.status, 422);
  });
});

describe('a phone customer using their email stays one customer', () => {
  let userId = '';

  it('links the identity rather than creating a second account', async () => {
    const data = expectOk(
      await call('/api/v1/auth/email', { email: OWNED_EMAIL, password: PASSWORD }),
      'email sign-in for a phone account',
    );
    assert.equal(data.created, false, 'this account already existed');
    assert.equal(data.user.phone, OWNED_PHONE, 'it is the same customer, phone and all');
    userId = data.user.id as string;

    const rows = await db.execute(
      `select count(*)::int as n from users where email = '${OWNED_EMAIL}'` as never,
    );
    assert.equal((rows as unknown as { rows: { n: number }[] }).rows[0]?.n, 1, 'exactly one user');
  });

  it('leaves their phone login working', async () => {
    // The regression that would matter most: linking an email must not cost
    // somebody the way they have always signed in.
    const data = expectOk(
      await call('/api/v1/auth/login', { phone: OWNED_PHONE, password: PASSWORD }),
      'phone login after linking',
    );
    assert.equal(data.user.id, userId, 'and it is the same customer');
  });

  it('now holds both identities', async () => {
    // `order by provider` would sort by the *enum's declaration order*, in
    // which 'phone' precedes 'email' — a Postgres detail that made this
    // assertion fail while the data was entirely correct. Cast to text for an
    // order that means what it looks like.
    const rows = await db.execute(
      `select provider::text as provider from auth_providers
       where user_id = '${userId}' order by provider::text` as never,
    );
    const providers = (rows as unknown as { rows: { provider: string }[] }).rows.map(
      (r) => r.provider,
    );
    assert.deepEqual(providers, ['email', 'phone']);
  });
});

describe('losing a race to the same identity is not an error', () => {
  /*
   * Found by double-tapping "Continue" in a browser, which is how a customer
   * would find it: both requests looked for the identity, both found nothing,
   * and the loser's insert hit `auth_providers_identity_uq`. That reached the
   * customer as `500 Something went wrong` on a screen that had, in fact, just
   * created their account.
   *
   * **Why this forces the collision instead of racing for it.** Five real
   * parallel requests reproduce it every time from separate processes, and never
   * from inside this one: the test's client and server share an event loop, so
   * each handler reaches its first `await` before the next request has even been
   * written, and the inserts never overlap. A version of this built on
   * `Promise.all` passed with the fix removed — green for the wrong reason,
   * which is worse than no test. So the collision is injected: `link` throws
   * SQLSTATE 23505 exactly once, which is precisely what Postgres does to the
   * loser.
   */
  const conflict = () => Object.assign(new Error('duplicate key value'), { code: '23505' });

  it('signs the loser in instead of failing', async (t) => {
    const email = `race.${SUFFIX}@example.test`;
    // Make the account exist, as the winner of the race would have.
    const winner = expectOk(
      await call('/api/v1/auth/email', { email, password: PASSWORD }),
      'the winner',
    );

    // Now force the loser's path: the lookups miss, the insert collides.
    t.mock.method(authProviderRepository, 'findUser', async () => undefined, { times: 1 });
    t.mock.method(userRepository, 'findByEmail', async () => undefined, { times: 1 });
    t.mock.method(authProviderRepository, 'link', async () => {
      throw conflict();
    }, { times: 1 });

    const loser = expectOk(
      await call('/api/v1/auth/email', { email, password: PASSWORD }),
      'the loser must not see an error',
    );

    assert.equal(loser.created, false, 'the loser did not create the account');
    assert.equal(loser.user.id, winner.user.id, 'and is the same customer');
    assert.ok(loser.tokens.accessToken, 'signed in, with a usable session');

    await db.execute(`delete from users where email = '${email}'` as never);
  });

  it('still refuses a wrong password on that path', async (t) => {
    // The recovery must not become a way past the password check — losing a
    // race proves nothing about who is asking.
    const email = `race.wrong.${SUFFIX}@example.test`;
    expectOk(await call('/api/v1/auth/email', { email, password: PASSWORD }), 'create it');

    t.mock.method(authProviderRepository, 'findUser', async () => undefined, { times: 1 });
    t.mock.method(userRepository, 'findByEmail', async () => undefined, { times: 1 });
    t.mock.method(authProviderRepository, 'link', async () => {
      throw conflict();
    }, { times: 1 });

    const r = await call('/api/v1/auth/email', { email, password: 'not-the-password' });
    assert.equal(r.status, 401, 'a wrong password is a wrong password, race or not');

    await db.execute(`delete from users where email = '${email}'` as never);
  });

  it('does not swallow a constraint failure that is not this race', async (t) => {
    // A unique violation on something unrelated must still be an error rather
    // than a silent sign-in attempt for an account that does not exist.
    const email = `race.other.${SUFFIX}@example.test`;
    t.mock.method(authProviderRepository, 'link', async () => {
      throw conflict();
    }, { times: 1 });

    const r = await call('/api/v1/auth/email', { email, password: PASSWORD });
    assert.ok(r.status >= 500, `an unresolvable conflict should not look like success: ${r.status}`);

    await db.execute(`delete from users where email = '${email}'` as never);
  });
});
