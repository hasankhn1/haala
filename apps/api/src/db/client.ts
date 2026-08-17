import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { config } from '../config';
import { logger } from '../common/logger';
import * as schema from './schema';

export const pool = new Pool({
  connectionString: config.database.url,
  max: 10,
});

pool.on('error', (err) => logger.error({ err }, 'Unexpected Postgres pool error'));

/**
 * Drizzle client. `casing: 'snake_case'` lets us write camelCase columns in
 * the schema and have them map to snake_case in Postgres automatically.
 */
export const db = drizzle(pool, { schema, casing: 'snake_case' });

export type DB = typeof db;

/**
 * A transaction handle. Repositories accept `DB | Tx` for their executor so
 * the same method works inside and outside a transaction.
 */
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];

export type Executor = DB | Tx;

export const checkDbConnection = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
  } finally {
    client.release();
  }
};

export const closeDb = async (): Promise<void> => {
  await pool.end();
};
