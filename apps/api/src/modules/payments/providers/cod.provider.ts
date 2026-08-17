import { PaymentMethod, PaymentStatus } from '@haala/shared';
import type {
  CreatePaymentResult,
  PaymentProvider,
  RefundResult,
  WebhookResult,
} from './payment-provider.interface';

/**
 * Cash on Delivery. There is no external gateway: the payment stays `pending`
 * until the rider marks COD collected on delivery, at which point the Delivery
 * service flips it to `paid`. Refunds are bookkeeping-only (cash handled offline).
 */
export const codProvider: PaymentProvider = {
  key: 'cod',
  method: PaymentMethod.Cod,

  async createPayment(): Promise<CreatePaymentResult> {
    return { providerRef: null, status: PaymentStatus.Pending, checkout: null };
  },

  async verifyPayment() {
    // Cannot verify remotely — reflects whatever the delivery flow recorded.
    return { status: PaymentStatus.Pending };
  },

  async handleWebhook(): Promise<WebhookResult> {
    return { handled: false };
  },

  async refundPayment(): Promise<RefundResult> {
    return { providerRef: null, status: 'succeeded' };
  },

  async getPaymentStatus() {
    return { status: PaymentStatus.Pending };
  },
};
