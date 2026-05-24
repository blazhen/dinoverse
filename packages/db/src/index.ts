import { neon } from '@neondatabase/serverless';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';

import { childProfiles, progress, quizQuestions, quizzes } from './schema';
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

// ─── Child profile data access (parent-scoped) ──────────────────
export type AgeBand = (typeof schema.ageBand.enumValues)[number];
export type CharacterId = (typeof schema.characterId.enumValues)[number];

export interface NewChildProfile {
  parentId: string;
  displayName: string;
  ageBand: AgeBand;
  avatarCharacter: CharacterId;
}

export function listChildProfiles(db: Database, parentId: string) {
  return db
    .select()
    .from(childProfiles)
    .where(eq(childProfiles.parentId, parentId))
    .orderBy(childProfiles.createdAt);
}

export async function createChildProfile(db: Database, data: NewChildProfile) {
  const [row] = await db.insert(childProfiles).values(data).returning();
  return row;
}

/** Deletes only if the child belongs to the given parent (ownership guard). */
export function deleteChildProfile(db: Database, id: string, parentId: string) {
  return db
    .delete(childProfiles)
    .where(and(eq(childProfiles.id, id), eq(childProfiles.parentId, parentId)));
}

// ─── Quizzes & progression ───────────────────────────────────────
export function listQuizzes(db: Database) {
  return db.select().from(quizzes).orderBy(quizzes.title);
}

/** A quiz plus its questions, ordered by position. */
export async function getQuizWithQuestions(db: Database, quizId: string) {
  const [quiz] = await db.select().from(quizzes).where(eq(quizzes.id, quizId));
  if (!quiz) return null;
  const questions = await db
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quizId))
    .orderBy(quizQuestions.position);
  return { ...quiz, questions };
}

export async function recordProgress(
  db: Database,
  data: { childId: string; quizId: string; score: number },
) {
  const [row] = await db.insert(progress).values(data).returning();
  return row;
}

export function listProgressForChild(db: Database, childId: string) {
  return db
    .select()
    .from(progress)
    .where(eq(progress.childId, childId))
    .orderBy(progress.completedAt);
}
