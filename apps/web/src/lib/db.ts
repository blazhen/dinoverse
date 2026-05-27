import { createDb } from '@dinoverse/db';

// Shared Drizzle/Neon client for the web app's server code.
// Falls back to a well-formed placeholder so importing this module never throws when
// DATABASE_URL is absent (e.g. a build with no env vars). Neon connects lazily, so the
// real DATABASE_URL — injected on the server at runtime — is what actually gets used.
export const db = createDb(
  process.env.DATABASE_URL ?? 'postgresql://placeholder:placeholder@localhost:5432/placeholder',
);
