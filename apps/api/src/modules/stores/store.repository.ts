import { and, eq } from 'drizzle-orm';
import { db, type Executor } from '../../db/client';
import { stores, type Store } from '../../db/schema';

export const storeRepository = {
  async listActive(ex: Executor = db): Promise<Store[]> {
    return ex.select().from(stores).where(eq(stores.isActive, true));
  },

  async findById(id: string, ex: Executor = db): Promise<Store | undefined> {
    const [row] = await ex.select().from(stores).where(eq(stores.id, id)).limit(1);
    return row;
  },

  async findActiveById(id: string, ex: Executor = db): Promise<Store | undefined> {
    const [row] = await ex
      .select()
      .from(stores)
      .where(and(eq(stores.id, id), eq(stores.isActive, true)))
      .limit(1);
    return row;
  },
};
