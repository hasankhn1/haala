import { and, eq, ne } from 'drizzle-orm';
import type { PaymentStatus } from '@haala/shared';
import { db, type Executor } from '../../db/client';
import { payments, refunds, type NewPayment, type Payment, type Refund } from '../../db/schema';

export const paymentRepository = {
  async create(data: NewPayment, ex: Executor = db): Promise<Payment> {
    const [row] = await ex.insert(payments).values(data).returning();
    return row as Payment;
  },

  async findById(id: string, ex: Executor = db): Promise<Payment | undefined> {
    const [row] = await ex.select().from(payments).where(eq(payments.id, id)).limit(1);
    return row;
  },

  async findByOrderId(orderId: string, ex: Executor = db): Promise<Payment | undefined> {
    const [row] = await ex.select().from(payments).where(eq(payments.orderId, orderId)).limit(1);
    return row;
  },

  async findByIdempotencyKey(key: string, ex: Executor = db): Promise<Payment | undefined> {
    const [row] = await ex.select().from(payments).where(eq(payments.idempotencyKey, key)).limit(1);
    return row;
  },

  async updateStatus(
    id: string,
    status: PaymentStatus,
    patch: Partial<NewPayment> = {},
    ex: Executor = db,
  ): Promise<Payment | undefined> {
    const [row] = await ex
      .update(payments)
      .set({ status, ...patch, updatedAt: new Date() })
      .where(eq(payments.id, id))
      .returning();
    return row;
  },

  /**
   * Move to `status` only if the payment is not already there, returning the
   * row when it moved and `undefined` when it didn't.
   *
   * The condition is in the UPDATE itself so that two callers settling the same
   * payment at once — the app's `verify` and the gateway's webhook routinely
   * race — cannot both see the transition. Exactly one of them gets the row
   * back, which is what makes it safe to announce the outcome from there.
   */
  async transitionStatus(
    id: string,
    status: PaymentStatus,
    patch: Partial<NewPayment> = {},
    ex: Executor = db,
  ): Promise<Payment | undefined> {
    const [row] = await ex
      .update(payments)
      .set({ status, ...patch, updatedAt: new Date() })
      .where(and(eq(payments.id, id), ne(payments.status, status)))
      .returning();
    return row;
  },

  async createRefund(
    data: typeof refunds.$inferInsert,
    ex: Executor = db,
  ): Promise<Refund> {
    const [row] = await ex.insert(refunds).values(data).returning();
    return row as Refund;
  },
};
