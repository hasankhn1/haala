import { asc, eq } from 'drizzle-orm';
import type { UserRole } from '@haala/shared';
import { db, type Executor } from '../../db/client';
import { users, type NewUser, type User } from '../../db/schema';

/**
 * Data access for users. Every method accepts an optional executor so the same
 * code runs standalone or inside a transaction (`repo.create(data, tx)`).
 */
export const userRepository = {
  async findById(id: string, ex: Executor = db): Promise<User | undefined> {
    const [row] = await ex.select().from(users).where(eq(users.id, id)).limit(1);
    return row;
  },

  async findByPhone(phone: string, ex: Executor = db): Promise<User | undefined> {
    const [row] = await ex.select().from(users).where(eq(users.phone, phone)).limit(1);
    return row;
  },

  /**
   * Lookup by email, for the account-linking step of email sign-in.
   *
   * Finding a user this way is **not** authorization. It only narrows down whose
   * password to check; ownership is proved by the password that follows, never
   * by the address itself.
   */
  async findByEmail(email: string, ex: Executor = db): Promise<User | undefined> {
    const [row] = await ex.select().from(users).where(eq(users.email, email)).limit(1);
    return row;
  },

  async listByRole(role: UserRole, ex: Executor = db): Promise<User[]> {
    return ex.select().from(users).where(eq(users.role, role)).orderBy(asc(users.name));
  },

  async create(data: NewUser, ex: Executor = db): Promise<User> {
    const [row] = await ex.insert(users).values(data).returning();
    return row as User;
  },

  async update(id: string, data: Partial<NewUser>, ex: Executor = db): Promise<User | undefined> {
    const [row] = await ex
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return row;
  },
};
