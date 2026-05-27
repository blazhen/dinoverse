'use client';

import { useEffect, useRef, useState } from 'react';

import type { RunnerHandle } from './runner';

export function RunnerCanvas() {
  const mountRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<RunnerHandle | null>(null);
  const [distance, setDistance] = useState(0);
  const [gems, setGems] = useState(0);
  const [over, setOver] = useState(false);
  const [finalScore, setFinalScore] = useState({ distance: 0, gems: 0 });

  useEffect(() => {
    let cancelled = false;
    void import('./runner').then(({ createRunner }) => {
      if (cancelled || !mountRef.current) return;
      handleRef.current = createRunner(mountRef.current, {
        onUpdate: (d, g) => {
          setDistance(d);
          setGems(g);
        },
        onGameOver: (d, g) => {
          setFinalScore({ distance: d, gems: g });
          setOver(true);
        },
      });
    });
    return () => {
      cancelled = true;
      handleRef.current?.destroy();
      handleRef.current = null;
    };
  }, []);

  function playAgain() {
    setOver(false);
    handleRef.current?.restart();
  }

  const ctrlBtn = 'pointer-events-auto select-none rounded-full bg-white/20 px-5 py-4 text-2xl font-bold text-white backdrop-blur active:bg-white/40';

  return (
    <div className="relative h-full w-full bg-sky-200">
      <div ref={mountRef} className="h-full w-full" />

      {/* HUD */}
      <div className="pointer-events-none absolute left-3 top-2 text-white drop-shadow">
        <span className="font-black">🏃 {distance}m</span>
        <span className="ml-3 font-black">💎 {gems}</span>
      </div>

      {/* On-screen controls (touch + click). Swipes also work. */}
      {!over && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex items-end justify-between px-4">
          <div className="flex gap-2">
            <button type="button" className={ctrlBtn} onPointerDown={() => handleRef.current?.moveLeft()}>◀</button>
            <button type="button" className={ctrlBtn} onPointerDown={() => handleRef.current?.moveRight()}>▶</button>
          </div>
          <div className="flex gap-2">
            <button type="button" className={ctrlBtn} onPointerDown={() => handleRef.current?.slide()}>▼</button>
            <button type="button" className={ctrlBtn} onPointerDown={() => handleRef.current?.jump()}>▲</button>
          </div>
        </div>
      )}

      {/* Game over */}
      {over && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-900/70 text-center text-white">
          <div className="text-5xl">🏁</div>
          <h2 className="text-2xl font-black">Nice run!</h2>
          <p>
            🏃 {finalScore.distance}m · 💎 {finalScore.gems}
          </p>
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
