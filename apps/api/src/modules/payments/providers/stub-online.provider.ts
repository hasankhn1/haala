import { PaymentMethod, PaymentStatus } from '@haala/shared';
import { logger } from '../../../common/logger';
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  RefundInput,
  RefundResult,
  VerifyPaymentInput,
  WebhookInput,
  WebhookResult,
} from './payment-provider.interface';

/**
 * A no-op online gateway for local development. It mimics the shape of a real
 * provider (checkout handoff, verify, webhook, refund) so the entire online
 * flow can be exercised end-to-end without credentials. Swap this out for a
 * real provider (e.g. Safepay) later — nothing else changes.
 */
export const stubOnlineProvider: PaymentProvider = {
  key: 'stub',
  method: PaymentMethod.Online,

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const providerRef = `stub_${input.orderId}`;
    logger.info({ orderId: input.orderId, amount: input.amount }, '[stub] createPayment');
    return {
      providerRef,
      status: PaymentStatus.Pending,
      checkout: { url: `https://pay.stub.local/checkout/${providerRef}` },
    };
  },

  async verifyPayment(_input: VerifyPaymentInput) {
    // The stub always confirms success on verify.
    return { status: PaymentStatus.Paid };
  },

  async handleWebhook(input: WebhookInput): Promise<WebhookResult> {
    try {
      const raw = typeof input.rawBody === 'string' ? input.rawBody : input.rawBody.toString('utf8');
      const body = JSON.parse(raw) as { orderId?: string; providerRef?: string; status?: string };
      return {
        handled: true,
        orderId: body.orderId,
        providerRef: body.providerRef,
        status: (body.status as PaymentStatus) ?? PaymentStatus.Paid,
      };
    } catch {
      return { handled: false };
    }
  },

  async refundPayment(input: RefundInput): Promise<RefundResult> {
    logger.info({ providerRef: input.providerRef, amount: input.amount }, '[stub] refundPayment');
    return { providerRef: input.providerRef, status: 'succeeded' };
  },

  async getPaymentStatus() {
    return { status: PaymentStatus.Paid };
  },
};
