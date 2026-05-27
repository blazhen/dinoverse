import { getGameProgress, recordLevelComplete, recordRunnerResult } from '@dinoverse/db';
import { NextResponse } from 'next/server';

import { getActiveChild } from '@/lib/active-child';
import { db } from '@/lib/db';

// Load the active child's saved game progress (difficulty + stats + age band).
export async function GET() {
  const child = await getActiveChild();
  if (!child) {
    return NextResponse.json({ child: null });
  }
  const progress = await getGameProgress(db, child.id);
  return NextResponse.json({
    child: { id: child.id, name: child.displayName, ageBand: child.ageBand },
    progress: progress ?? null,
  });
}

// Save a result for the active child. `kind: 'runner'` saves a Dino Dash run; otherwise
// it's an expedition level completion.
export async function POST(req: Request) {
  const child = await getActiveChild();
  if (!child) {
    return NextResponse.json({ ok: false, reason: 'no-active-child' });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const gems = Math.max(0, Math.floor(Number(body.gems) || 0));

  if (body.kind === 'runner') {
    const distance = Math.max(0, Math.floor(Number(body.distance) || 0));
    await recordRunnerResult(db, child.id, { distance, gems });
    return NextResponse.json({ ok: true });
  }

  const level = Math.max(0, Math.floor(Number(body.level) || 0));
  const setbacks = Math.max(0, Math.floor(Number(body.setbacks) || 0));
  const difficulty = Math.min(20, Math.max(1, Math.floor(Number(body.difficulty) || 1)));
  await recordLevelComplete(db, child.id, { level, gems, setbacks, difficulty });
  return NextResponse.json({ ok: true });
}
