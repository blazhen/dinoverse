import { createDb } from '@dinoverse/db';

/** Shared Drizzle/Neon client for the web app's server code. */
export const db = createDb(process.env.DATABASE_URL!);
