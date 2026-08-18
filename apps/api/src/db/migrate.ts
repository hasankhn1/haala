import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { logger } from '../common/logger';
import { closeDb, db } from './client';

/**
 * Applies pending migrations, then exits.
 *
 * Uses drizzle-orm's migrator rather than the drizzle-kit CLI, because
 * drizzle-kit is a dev dependency and is pruned out of the runtime image. This
 * keeps the deploy step working without shipping the whole toolchain to
 * production.
 *
 * Run as a **pre-deploy step**, not on container boot: a container that
 * migrates when it starts races itself the moment there is more than one
 * instance, and two concurrent `CREATE TABLE`s is not a good way to find out.
 *
 * Exits non-zero on failure so the deploy halts rather than starting an API
 * against a schema it doesn't match.
 */
const run = async (): Promise<void> => {
  // Resolved from this file, not the working directory, so it holds whether it
  // runs as `dist/db/migrate.js` from the repo root (Railway) or via tsx from
  // `apps/api`. The project compiles to CommonJS, hence `__dirname`.
  const migrationsFolder = path.resolve(__dirname, '../../drizzle');
  logger.info({ migrationsFolder }, 'Applying migrations…');
  await migrate(db, { migrationsFolder });
  logger.info('Migrations applied ✔');
};

run()
  .catch((err) => {
    logger.error({ err }, 'Migration failed — halting deploy');
    process.exitCode = 1;
  })
  .finally(() => void closeDb());
