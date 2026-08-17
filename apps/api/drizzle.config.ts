import path from 'node:path';
import dotenv from 'dotenv';
import type { Config } from 'drizzle-kit';

// Load env from the monorepo root first, then any app-local override — same as
// the running app (src/config/env.ts) so drizzle-kit targets the same database.
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

export default {
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://haala:haala@localhost:5433/haala',
  },
  casing: 'snake_case',
} satisfies Config;
