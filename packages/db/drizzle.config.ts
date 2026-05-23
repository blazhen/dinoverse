import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // Use the direct (unpooled) URL for migrations.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
  },
});
