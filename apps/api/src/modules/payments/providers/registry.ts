import { PaymentMethod } from '@haala/shared';
import { config } from '../../../config';
import { AppError } from '../../../common/errors';
import type { PaymentProvider } from './payment-provider.interface';
import { codProvider } from './cod.provider';
import { safepayProvider } from './safepay.provider';
import { stubOnlineProvider } from './stub-online.provider';

/**
 * Central registry of payment providers. To add a provider: implement the
 * PaymentProvider interface and register it here — checkout/order code is
 * untouched.
 */
const providers = new Map<string, PaymentProvider>();

const register = (provider: PaymentProvider): void => {
  providers.set(provider.key, provider);
};

register(codProvider);
register(stubOnlineProvider);
register(safepayProvider);
// Additional gateways (JazzCash, Easypaisa) plug in here — one class each,
// selected at runtime via PAYMENT_ONLINE_PROVIDER. Nothing in checkout or
// orders needs to change.

export const paymentRegistry = {
  get(key: string): PaymentProvider {
    const provider = providers.get(key);
    if (!provider) throw AppError.internal(`Unknown payment provider "${key}"`);
    return provider;
  },

  /** Resolve the provider for a payment method (online → configured provider). */
  forMethod(method: PaymentMethod): PaymentProvider {
    if (method === PaymentMethod.Cod) return this.get('cod');
    return this.get(config.payments.onlineProvider);
  },
};
