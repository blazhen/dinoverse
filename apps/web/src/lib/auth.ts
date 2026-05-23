import { account, createDb, session, user, verification } from '@dinoverse/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

const db = createDb(process.env.DATABASE_URL!);

/**
 * Better Auth server instance. `user` represents a PARENT account —
 * the only role that authenticates. Child profiles are created under a parent.
 */
export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
  },
});
