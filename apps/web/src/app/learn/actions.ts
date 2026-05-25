'use server';

import { recordProgress } from '@dinoverse/db';

import { getActiveChild } from '@/lib/active-child';
import { db } from '@/lib/db';

/**
 * Records a completed quiz for the active child. Returns a small status object
 * (no throw) so the client player can show a friendly message.
 */
export async function recordQuizResult(quizId: string, score: number) {
  const child = await getActiveChild();
  if (!child) {
    return { ok: false as const, reason: 'no-active-child' as const };
  }
  await recordProgress(db, { childId: child.id, quizId, score });
  return { ok: true as const, childName: child.displayName };
}
