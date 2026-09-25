import assert from 'node:assert/strict';
import { after, before, describe, it, mock } from 'node:test';
import { config } from '../../config';
import { userRepository } from '../users/user.repository';
import { safepayWallet, splitName } from './providers/safepay.provider';
import { walletService } from './wallet.service';

/**
 * Saved cards: the parsing, and the boundary between one customer's wallet and
 * another's.
 *
 * The boundary is the part worth testing. Safepay's delete endpoint takes the
 * customer and the instrument as two independent parameters and will accept a
 * mismatched pair — so nothing at their end stops one customer deleting
 * another's card. The check that does is ours, and it is one `.some()` call
 * that would be very easy to drop.
 *
 * No database and no network: `userRepository` and the wallet are both mocked,
 * so this runs anywhere and fails in milliseconds.
 */
const CUSTOMER = 'cus_abc';
const MINE = 'pm_mine';
const THEIRS = 'pm_theirs';

const asUser = (safepayCustomerToken: string | null) =>
  ({ id: 'user-1', name: 'Test', safepayCustomerToken }) as never;

let restoreSecret: string | undefined;
let restoreApiKey: string | undefined;

before(() => {
  restoreSecret = config.payments.safepay.secretKey;
  restoreApiKey = config.payments.safepay.apiKey;
  (config.payments.safepay as { secretKey?: string }).secretKey = 'sk-test';
  (config.payments.safepay as { apiKey?: string }).apiKey = 'sec_test';
});

after(() => {
  (config.payments.safepay as { secretKey?: string }).secretKey = restoreSecret;
  (config.payments.safepay as { apiKey?: string }).apiKey = restoreApiKey;
  mock.restoreAll();
});

describe('splitting a single name field into their two', () => {
  it('splits on the first space only', () => {
    assert.deepEqual(splitName('Hassan Karim'), { first: 'Hassan', last: 'Karim' });
    assert.deepEqual(splitName('Muhammad Ali Khan'), { first: 'Muhammad', last: 'Ali Khan' });
  });

  it('leaves the last name empty rather than repeating the first', () => {
    // A mononym is common enough here that "Hassan Hassan" would show up on a
    // prefilled checkout form and look like a bug to the person reading it.
    assert.deepEqual(splitName('Hassan'), { first: 'Hassan', last: '' });
  });

  it('tolerates the padding a real form produces', () => {
    assert.deepEqual(splitName('  Hassan   Karim  '), { first: 'Hassan', last: 'Karim' });
  });
});

describe('reading their wallet payload', () => {
  const walletResponse = (entries: unknown[]) =>
    ({
      ok: true,
      json: async () => ({ data: { wallet: entries, count: entries.length }, status: { errors: [] } }),
    }) as never;

  it('flattens a card out of the processor-specific nesting', async (t) => {
    t.mock.method(globalThis, 'fetch', async () =>
      walletResponse([
        {
          token: MINE,
          customer: CUSTOMER,
          is_deleted: false,
          cybersource: { bin: '520000', last_four: '1096', expiry_month: '12', expiry_year: '2028' },
        },
      ]),
    );

    const cards = await safepayWallet.list(CUSTOMER);
    assert.equal(cards.length, 1);
    assert.deepEqual(cards[0], {
      token: MINE,
      brand: 'Mastercard',
      last4: '1096',
      expiryMonth: '12',
      expiryYear: '2028',
    });
  });

  it('names the brand from the BIN, and says nothing when it cannot', async (t) => {
    t.mock.method(globalThis, 'fetch', async () =>
      walletResponse([
        { token: 'pm_v', cybersource: { bin: '445653', last_four: '1111' } },
        { token: 'pm_m', cybersource: { bin: '520000', last_four: '2222' } },
        { token: 'pm_x', cybersource: { bin: '999999', last_four: '3333' } },
      ]),
    );

    const cards = await safepayWallet.list(CUSTOMER);
    assert.deepEqual(
      cards.map((c) => c.brand),
      ['Visa', 'Mastercard', null],
      'an unknown BIN is left null rather than guessed at and shown to a customer',
    );
  });

  it('drops deleted and unparseable entries instead of throwing', async (t) => {
    t.mock.method(globalThis, 'fetch', async () =>
      walletResponse([
        { token: 'pm_gone', is_deleted: true, cybersource: { bin: '4', last_four: '0000' } },
        null,
        'not an object',
        { no_token: true },
        { token: 'pm_ok' },
      ]),
    );

    const cards = await safepayWallet.list(CUSTOMER);
    // The last one has no card detail at all and still survives as a token —
    // an account screen showing one bare card beats an account screen 500ing.
    assert.deepEqual(
      cards.map((c) => c.token),
      ['pm_ok'],
    );
  });

  it('returns nothing when the payload has no wallet at all', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      json: async () => ({ data: {}, status: { errors: [] } }),
    }) as never);

    assert.deepEqual(await safepayWallet.list(CUSTOMER), []);
  });
});

describe('one customer cannot touch another customer’s card', () => {
  it('refuses a token that is not in this wallet, with 404 rather than 403', async (t) => {
    t.mock.method(userRepository, 'findById', async () => asUser(CUSTOMER));
    t.mock.method(safepayWallet, 'list', async () => [
      { token: MINE, brand: 'Visa', last4: '1096', expiryMonth: '12', expiryYear: '2028' },
    ]);
    const remove = t.mock.method(safepayWallet, 'remove', async () => {});

    await assert.rejects(
      () => walletService.remove('user-1', THEIRS),
      /not found/i,
      'a card outside this wallet must not be deletable',
    );
    assert.equal(remove.mock.callCount(), 0, 'and Safepay must never be asked');
  });

  it('deletes one that is', async (t) => {
    t.mock.method(userRepository, 'findById', async () => asUser(CUSTOMER));
    t.mock.method(safepayWallet, 'list', async () => [
      { token: MINE, brand: 'Visa', last4: '1096', expiryMonth: '12', expiryYear: '2028' },
    ]);
    const remove = t.mock.method(safepayWallet, 'remove', async () => {});

    await walletService.remove('user-1', MINE);
    assert.equal(remove.mock.callCount(), 1);
    assert.deepEqual(remove.mock.calls[0]?.arguments, [CUSTOMER, MINE]);
  });

  it('refuses when the user has no Safepay customer, without saying so', async (t) => {
    // Same 404 as "that card is not yours". Somebody probing should not be able
    // to tell the two apart.
    t.mock.method(userRepository, 'findById', async () => asUser(null));
    const list = t.mock.method(safepayWallet, 'list', async () => []);

    await assert.rejects(() => walletService.remove('user-1', MINE), /not found/i);
    assert.equal(list.mock.callCount(), 0);
  });
});

describe('listing degrades rather than breaking the account screen', () => {
  it('is empty for somebody who has never paid online', async (t) => {
    t.mock.method(userRepository, 'findById', async () => asUser(null));
    assert.deepEqual(await walletService.list('user-1'), []);
  });

  it('is empty when Safepay is down, not a 500', async (t) => {
    t.mock.method(userRepository, 'findById', async () => asUser(CUSTOMER));
    t.mock.method(safepayWallet, 'list', async () => {
      throw new Error('gateway unreachable');
    });

    assert.deepEqual(
      await walletService.list('user-1'),
      [],
      'a gateway outage must not take the account screen with it',
    );
  });
});
