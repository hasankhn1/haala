import { and, count, desc, eq, sql } from 'drizzle-orm';
import { db, type Executor } from '../../db/client';
import {
  promotionRedemptions,
  promotions,
  type NewPromotion,
  type NewPromotionRedemption,
  type Promotion,
} from '../../db/schema';

export const promotionRepository = {
  async findByCode(code: string, ex: Executor = db): Promise<Promotion | undefined> {
    const [row] = await ex.select().from(promotions).where(eq(promotions.code, code)).limit(1);
    return row;
  },

  /**
   * Same lookup as `findByCode` but takes a row lock, so two concurrent
   * checkouts redeeming the last use of a limited promo serialise instead of
   * both reading `usedCount` before either increments it.
   */
  async lockByCode(code: string, ex: Executor = db): Promise<Promotion | undefined> {
    const [row] = await ex
      .select()
      .from(promotions)
      .where(eq(promotions.code, code))
      .limit(1)
      .for('update');
    return row;
  },

  async findById(id: string, ex: Executor = db): Promise<Promotion | undefined> {
    const [row] = await ex.select().from(promotions).where(eq(promotions.id, id)).limit(1);
    return row;
  },

  async listAll(ex: Executor = db): Promise<Promotion[]> {
    return ex.select().from(promotions).orderBy(desc(promotions.createdAt));
  },

  async listActive(ex: Executor = db): Promise<Promotion[]> {
    return ex
      .select()
      .from(promotions)
      .where(eq(promotions.isActive, true))
      .orderBy(desc(promotions.createdAt));
  },

  async create(data: NewPromotion, ex: Executor = db): Promise<Promotion> {
    const [row] = await ex.insert(promotions).values(data).returning();
    return row as Promotion;
  },

  async update(
    id: string,
    data: Partial<NewPromotion>,
    ex: Executor = db,
  ): Promise<Promotion | undefined> {
    const [row] = await ex
      .update(promotions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(promotions.id, id))
      .returning();
    return row;
  },

  /** How many times this customer has already redeemed this promotion. */
  async redemptionCount(
    promotionId: string,
    userId: string,
    ex: Executor = db,
  ): Promise<number> {
    const [row] = await ex
      .select({ n: count() })
      .from(promotionRedemptions)
      .where(
        and(
          eq(promotionRedemptions.promotionId, promotionId),
          eq(promotionRedemptions.userId, userId),
        ),
      );
    return Number(row?.n ?? 0);
  },

  async addRedemption(
    data: NewPromotionRedemption,
    ex: Executor = db,
  ): Promise<void> {
    await ex.insert(promotionRedemptions).values(data);
  },

  /** Increment/decrement the aggregate counter. Never lets it go negative. */
  async bumpUsedCount(id: string, delta: number, ex: Executor = db): Promise<void> {
    await ex
      .update(promotions)
      .set({
        usedCount: sql`greatest(0, ${promotions.usedCount} + ${delta})`,
        updatedAt: new Date(),
      })
      .where(eq(promotions.id, id));
  },

  /**
   * Undo a redemption when its order is cancelled. Returns the promotion id so
   * the caller can decrement the aggregate in the same transaction.
   */
  async removeRedemptionForOrder(
    orderId: string,
    ex: Executor = db,
  ): Promise<string | null> {
    const rows = await ex
      .delete(promotionRedemptions)
      .where(eq(promotionRedemptions.orderId, orderId))
      .returning({ promotionId: promotionRedemptions.promotionId });
    return rows[0]?.promotionId ?? null;
  },
};
