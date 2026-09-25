import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyCheckoutUrl } from './payments';

/**
 * When the embedded checkout sheet is allowed to close.
 *
 * Both directions of error are expensive and neither is visible in a diff:
 * closing too eagerly aborts a 3DS challenge and loses the payment, and never
 * closing strands the customer on a finished page with no way back. The
 * customer app has no test runner, which is why the decision lives in `shared`
 * as a pure function rather than inline in the WebView handler.
 */
describe('urls that end the embedded checkout', () => {
  it('closes on their mobile completion path', () => {
    assert.equal(
      classifyCheckoutUrl(
        'https://sandbox.api.getsafepay.com/embedded/external/complete?environment=sandbox&tracker=track_1',
      ),
      'completed',
    );
  });

  it('closes on their mobile cancellation path', () => {
    assert.equal(
      classifyCheckoutUrl(
        'https://sandbox.api.getsafepay.com/embedded/external/error?environment=sandbox',
      ),
      'cancelled',
    );
  });

  it('closes on the hosted-redirect legs too', () => {
    // Belt and braces: the page still honours `redirect_url` in some flows, and
    // there is no reason to care which signal arrives first.
    assert.equal(classifyCheckoutUrl('haala://order/confirmed'), 'completed');
    assert.equal(
      classifyCheckoutUrl('https://api.haala.pk/api/v1/payments/return/safepay'),
      'completed',
    );
  });

  it('works against production hosts, not just sandbox', () => {
    assert.equal(
      classifyCheckoutUrl('https://getsafepay.com/embedded/external/complete'),
      'completed',
    );
  });
});

describe('urls that must NOT end it', () => {
  it('leaves the checkout page itself alone', () => {
    assert.equal(
      classifyCheckoutUrl(
        'https://sandbox.api.getsafepay.com/embedded/?environment=sandbox&tracker=track_1&tbt=xyz',
      ),
      null,
    );
  });

  it('leaves a 3DS challenge on the issuer’s domain alone', () => {
    /*
     * The expensive one. A step-up challenge navigates to the bank, and closing
     * the sheet here takes the customer's payment down mid-authentication — the
     * money may already be authorized, with nobody watching for the result.
     */
    assert.equal(classifyCheckoutUrl('https://acs.somebank.com.pk/3ds/challenge?id=abc'), null);
    assert.equal(classifyCheckoutUrl('https://centinelapi.cardinalcommerce.com/V1/Cruise/StepUp'), null);
  });

  it('is not fooled by our own return URL in a query parameter', () => {
    /*
     * The one that would fire on the FIRST page load and look like an instant
     * success. We hand Safepay `redirect_url=…/payments/return/safepay`, so
     * that exact string is present in the checkout URL itself. A naive
     * `url.includes(…)` closes the sheet before the customer sees a card field.
     *
     * Left unencoded on purpose: percent-encoding it would make this pass
     * whether or not the query is stripped, which is how it read at first.
     */
    const withReturnParam =
      'https://sandbox.api.getsafepay.com/embedded/?tracker=track_1' +
      '&redirect_url=https://api.haala.pk/api/v1/payments/return/safepay' +
      '&cancel_url=https://api.haala.pk/api/v1/payments/return/safepay';
    assert.equal(classifyCheckoutUrl(withReturnParam), null);
  });

  it('is not fooled by a completion path sitting in a query parameter', () => {
    assert.equal(
      classifyCheckoutUrl(
        'https://sandbox.api.getsafepay.com/embedded/?next=/external/complete',
      ),
      null,
    );
  });

  it('ignores about:blank and the empty string', () => {
    // React Native WebView fires a navigation event for both.
    assert.equal(classifyCheckoutUrl('about:blank'), null);
    assert.equal(classifyCheckoutUrl(''), null);
  });

  it('does not throw on a URL it cannot parse', () => {
    // An unparseable URL must be inert, not an exception inside a navigation
    // handler where nothing would catch it.
    assert.equal(classifyCheckoutUrl('not a url at all'), null);
    assert.equal(classifyCheckoutUrl('://////'), null);
  });
});
