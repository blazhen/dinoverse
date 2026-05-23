import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

import * as schema from './schema';

export * from './schema';

/**
 * Drizzle client backed by Neon's serverless HTTP driver.
 * Pass the pooled DATABASE_URL (see .env.example).
 */
export function createDb(connectionString: string) {
  const sql = neon(connectionString);
  return drizzle(sql, { schema });
}

export type Database = ReturnType<typeof createDb>;
