import type { PaymentMethod, PaymentStatus } from '@haala/shared';

export interface PaymentCustomer {
  id: string;
  name: string;
  /**
   * The delivery contact. Nullable because a customer who signed in with
   * Google has no phone until checkout asks for one — providers that require a
   * number must say so rather than assume.
   */
  phone: string | null;
  email?: string | null;
}

export interface CreatePaymentInput {
  orderId: string;
  /** Amount in paisa (integer minor units). */
  amount: number;
  currency: string;
  /** Idempotency key — the provider must not double-charge for the same key. */
  idempotencyKey: string;
  customer: PaymentCustomer;
  metadata?: Record<string, unknown>;
}

export interface CheckoutHandoff {
  /** Hosted checkout / redirect URL, if the provider uses one. */
  url?: string;
  /** Client token / session id for in-app SDK flows. */
  token?: string;
}

export interface CreatePaymentResult {
  providerRef: string | null;
  status: PaymentStatus;
  checkout?: CheckoutHandoff | null;
}

export interface VerifyPaymentInput {
  orderId: string;
  providerRef: string | null;
}

export interface WebhookInput {
  headers: Record<string, string | string[] | undefined>;
  rawBody: Buffer | string;
}

export interface WebhookResult {
  handled: boolean;
  orderId?: string;
  providerRef?: string;
  status?: PaymentStatus;
}

export interface RefundInput {
  providerRef: string | null;
  /** Amount to refund in paisa. */
  amount: number;
  reason?: string;
}

export interface RefundResult {
  providerRef: string | null;
  status: 'pending' | 'succeeded' | 'failed';
}

/**
 * The single seam every payment gateway implements. Checkout and order logic
 * only ever depend on THIS interface — adding a new provider (Safepay,
 * JazzCash, …) means writing one class, not touching orders/checkout.
 *
 * Rules: never store raw card data; keep all gateway-specific logic inside the
 * implementation; verify webhook signatures before trusting a payload.
 */
export interface PaymentProvider {
  /** Stable key persisted on the payment row, e.g. "cod", "stub", "safepay". */
  readonly key: string;
  readonly method: PaymentMethod;

  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  verifyPayment(input: VerifyPaymentInput): Promise<{ status: PaymentStatus }>;
  handleWebhook(input: WebhookInput): Promise<WebhookResult>;
  refundPayment(input: RefundInput): Promise<RefundResult>;
  getPaymentStatus(providerRef: string | null): Promise<{ status: PaymentStatus }>;
}
