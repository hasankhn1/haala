import { and, desc, eq } from 'drizzle-orm';
import { db, type Executor } from '../../db/client';
import { addresses, type Address, type NewAddress } from '../../db/schema';

export const addressRepository = {
  async listByUser(userId: string, ex: Executor = db): Promise<Address[]> {
    return ex
      .select()
      .from(addresses)
      .where(eq(addresses.userId, userId))
      .orderBy(desc(addresses.isDefault), desc(addresses.createdAt));
  },

  async findByIdForUser(id: string, userId: string, ex: Executor = db): Promise<Address | undefined> {
    const [row] = await ex
      .select()
      .from(addresses)
      .where(and(eq(addresses.id, id), eq(addresses.userId, userId)))
      .limit(1);
    return row;
  },

  async create(data: NewAddress, ex: Executor = db): Promise<Address> {
    const [row] = await ex.insert(addresses).values(data).returning();
    return row as Address;
  },

  async update(
    id: string,
    userId: string,
    data: Partial<NewAddress>,
    ex: Executor = db,
  ): Promise<Address | undefined> {
    const [row] = await ex
      .update(addresses)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(addresses.id, id), eq(addresses.userId, userId)))
      .returning();
    return row;
  },

  async delete(id: string, userId: string, ex: Executor = db): Promise<boolean> {
    const rows = await ex
      .delete(addresses)
      .where(and(eq(addresses.id, id), eq(addresses.userId, userId)))
      .returning({ id: addresses.id });
    return rows.length > 0;
  },

  /** Clear the default flag on all of a user's addresses (used before setting a new one). */
  async clearDefault(userId: string, ex: Executor = db): Promise<void> {
    await ex.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, userId));
  },
};
