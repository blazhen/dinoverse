import { neon } from '@neondatabase/serverless';
import { and, desc, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';

import { childProfiles, gameProgress, progress, quizQuestions, quizzes } from './schema';
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

// ─── Game progress (per child; adaptive difficulty + cumulative stats) ──
export async function getGameProgress(db: Database, childId: string) {
  const [row] = await db.select().from(gameProgress).where(eq(gameProgress.childId, childId));
  return row ?? null;
}

/** Upsert a completed level: store latest difficulty, bump counters, track the highest level. */
export async function recordLevelComplete(
  db: Database,
  childId: string,
  data: { level: number; gems: number; setbacks: number; difficulty: number },
) {
  await db
    .insert(gameProgress)
    .values({
      childId,
      difficulty: data.difficulty,
      levelsCompleted: 1,
      highestLevel: data.level,
      gems: data.gems,
      setbacks: data.setbacks,
    })
    .onConflictDoUpdate({
      target: gameProgress.childId,
      set: {
        difficulty: data.difficulty,
        levelsCompleted: sql`${gameProgress.levelsCompleted} + 1`,
        highestLevel: sql`greatest(${gameProgress.highestLevel}, ${data.level})`,
        gems: sql`${gameProgress.gems} + ${data.gems}`,
        setbacks: sql`${gameProgress.setbacks} + ${data.setbacks}`,
        updatedAt: sql`now()`,
      },
    });
}

/** Progress rows joined with quiz titles, newest first — for the parent dashboard. */
export function listChildProgressDetailed(db: Database, childId: string) {
  return db
    .select({
      quizTitle: quizzes.title,
      score: progress.score,
      completedAt: progress.completedAt,
    })
    .from(progress)
    .innerJoin(quizzes, eq(progress.quizId, quizzes.id))
    .where(eq(progress.childId, childId))
    .orderBy(desc(progress.completedAt));
}
