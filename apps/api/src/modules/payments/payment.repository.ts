import { eq } from 'drizzle-orm';
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

  async createRefund(
    data: typeof refunds.$inferInsert,
    ex: Executor = db,
  ): Promise<Refund> {
    const [row] = await ex.insert(refunds).values(data).returning();
    return row as Refund;
  },
};
