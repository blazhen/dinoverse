import { getGameProgress, recordLevelComplete } from '@dinoverse/db';
import { NextResponse } from 'next/server';

import { getActiveChild } from '@/lib/active-child';
import { db } from '@/lib/db';

// Load the active child's saved game progress (difficulty + stats).
export async function GET() {
  const child = await getActiveChild();
  if (!child) {
    return NextResponse.json({ child: null });
  }
  const progress = await getGameProgress(db, child.id);
  return NextResponse.json({
    child: { id: child.id, name: child.displayName },
    progress: progress ?? null,
  });
}

// Save a completed level for the active child.
export async function POST(req: Request) {
  const child = await getActiveChild();
  if (!child) {
    return NextResponse.json({ ok: false, reason: 'no-active-child' });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const level = Math.max(0, Math.floor(Number(body.level) || 0));
  const gems = Math.max(0, Math.floor(Number(body.gems) || 0));
  const setbacks = Math.max(0, Math.floor(Number(body.setbacks) || 0));
  const difficulty = Math.min(10, Math.max(1, Math.floor(Number(body.difficulty) || 1)));

  await recordLevelComplete(db, child.id, { level, gems, setbacks, difficulty });
  return NextResponse.json({ ok: true });
}
