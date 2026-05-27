'use client';

import { useEffect, useRef, useState } from 'react';

import type { RunnerHandle, RunnerOptions, RunnerStats } from './runner';

// Faster start + higher ceiling for older kids; gentle for the youngest.
function optsForAge(ageBand?: string): RunnerOptions {
  switch (ageBand) {
    case '5-6':
      return { startSpeed: 9, accel: 0.4, maxSpeed: 22 };
    case '7-8':
      return { startSpeed: 11, accel: 0.5, maxSpeed: 26 };
    case '9-10':
      return { startSpeed: 12, accel: 0.6, maxSpeed: 30 };
    case '11-12':
      return { startSpeed: 14, accel: 0.7, maxSpeed: 33 };
    case '13-14':
      return { startSpeed: 15, accel: 0.8, maxSpeed: 36 };
    default:
      return { startSpeed: 12, accel: 0.6, maxSpeed: 32 };
  }
}

const EMPTY_STATS: RunnerStats = { distance: 0, gems: 0, hearts: 3, shield: false, magnet: false };

export function RunnerCanvas() {
  const mountRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<RunnerHandle | null>(null);
  const bestRef = useRef(0); // best distance loaded for the active child (for "New best!")
  const persistRef = useRef(false); // only save when a child profile is active

  const [stats, setStats] = useState<RunnerStats>(EMPTY_STATS);
  const [best, setBest] = useState(0);
  const [over, setOver] = useState(false);
  const [finalScore, setFinalScore] = useState({ distance: 0, gems: 0, newBest: false });

  useEffect(() => {
    let cancelled = false;

    const onUpdate = (s: RunnerStats) => setStats(s);

    const onGameOver = (distance: number, gems: number) => {
      const newBest = distance > bestRef.current;
      if (newBest) {
        bestRef.current = distance;
        setBest(distance);
      }
      setFinalScore({ distance, gems, newBest });
      setOver(true);
      if (persistRef.current) {
        void fetch('/api/game/progress', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ kind: 'runner', distance, gems }),
        }).catch(() => {});
      }
    };

    void Promise.all([
      import('./runner'),
      fetch('/api/game/progress')
        .then((r) => r.json())
        .catch(() => null),
    ]).then(([{ createRunner }, data]) => {
      if (cancelled || !mountRef.current) return;
      const child = (data?.child ?? null) as { ageBand?: string } | null;
      const loadedBest = Number(data?.progress?.runnerBestDistance ?? 0);
      bestRef.current = loadedBest;
      persistRef.current = !!child;
      setBest(loadedBest);
      handleRef.current = createRunner(mountRef.current, { onUpdate, onGameOver }, optsForAge(child?.ageBand));
    });

    return () => {
      cancelled = true;
      handleRef.current?.destroy();
      handleRef.current = null;
    };
  }, []);

  function playAgain() {
    setOver(false);
    setStats(EMPTY_STATS);
    handleRef.current?.restart();
  }

  const ctrlBtn =
    'pointer-events-auto select-none rounded-full bg-white/20 px-5 py-4 text-2xl font-bold text-white backdrop-blur active:bg-white/40';

  return (
    <div className="relative h-full w-full bg-sky-200">
      <div ref={mountRef} className="h-full w-full" />

      {/* HUD */}
      <div className="pointer-events-none absolute left-3 top-2 flex flex-col gap-0.5 text-white drop-shadow">
        <div>
          <span className="font-black">🏃 {stats.distance}m</span>
          <span className="ml-3 font-black">💎 {stats.gems}</span>
        </div>
        <div className="text-lg leading-none">
          {'❤️'.repeat(stats.hearts)}
          {'🤍'.repeat(Math.max(0, 3 - stats.hearts))}
          {stats.shield && <span className="ml-2">🛡️</span>}
          {stats.magnet && <span className="ml-1">🧲</span>}
        </div>
        {best > 0 && <div className="text-xs font-semibold text-white/80">Best: {best}m</div>}
      </div>

      {/* On-screen controls (touch + click). Swipes also work. */}
      {!over && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex items-end justify-between px-4">
          <div className="flex gap-2">
            <button type="button" className={ctrlBtn} onPointerDown={() => handleRef.current?.moveLeft()}>
              ◀
            </button>
            <button type="button" className={ctrlBtn} onPointerDown={() => handleRef.current?.moveRight()}>
              ▶
            </button>
          </div>
          <div className="flex gap-2">
            <button type="button" className={ctrlBtn} onPointerDown={() => handleRef.current?.slide()}>
              ▼
            </button>
            <button type="button" className={ctrlBtn} onPointerDown={() => handleRef.current?.jump()}>
              ▲
            </button>
          </div>
        </div>
      )}

      {/* Game over */}
      {over && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-900/70 text-center text-white">
          <div className="text-5xl">{finalScore.newBest ? '🏆' : '🏁'}</div>
          {finalScore.newBest ? (
            <h2 className="text-3xl font-black text-amber-300">New best! 🎉</h2>
          ) : (
            <h2 className="text-2xl font-black">Nice run!</h2>
          )}
          <p>
            🏃 {finalScore.distance}m · 💎 {finalScore.gems}
          </p>
          {!finalScore.newBest && best > 0 && <p className="text-sm text-white/70">Best: {best}m</p>}
          <button
            type="button"
            onClick={playAgain}
            className="rounded-full bg-emerald-500 px-6 py-3 text-lg font-bold text-white hover:bg-emerald-600"
          >
            Play again
          </button>
        </div>
      )}
    </div>
  );
}
