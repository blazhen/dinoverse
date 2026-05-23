import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// Load the monorepo root .env (drizzle-kit does not do this automatically).
config({ path: '../../.env' });

export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // Use the direct (unpooled) URL for migrations.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
  },
});
