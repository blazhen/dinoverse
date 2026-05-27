'use client';

import type { Game } from 'phaser';
import { useEffect, useRef, useState } from 'react';

/**
 * Immersive, full-area mount for the platformer. The Phaser canvas (FIT-scaled)
 * fills the wrapper; a Fullscreen button expands the wrapper to the whole screen.
 */
export function GameCanvas() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [isFs, setIsFs] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      // Load this child's saved difficulty + age band (if a kid is signed in / selected).
      let opts: { difficulty?: number; persist?: boolean; ageBand?: string } = {};
      try {
        const res = await fetch('/api/game/progress');
        if (res.ok) {
          const data = await res.json();
          opts = {
            difficulty: data?.progress?.difficulty,
            persist: Boolean(data?.child),
            ageBand: data?.child?.ageBand,
          };
        }
      } catch {
        // offline / not signed in → fall back to localStorage in the scene
      }
      const { createExpedition } = await import('./platformer');
      if (cancelled || !mountRef.current) return;
      gameRef.current = createExpedition(mountRef.current, opts);
    })();

    // Keep Phaser's FIT scaling in sync when the wrapper resizes (incl. fullscreen).
    const ro = new ResizeObserver(() => gameRef.current?.scale.refresh());
    if (mountRef.current) ro.observe(mountRef.current);

    const onFsChange = () => setIsFs(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);

    return () => {
      cancelled = true;
      ro.disconnect();
      document.removeEventListener('fullscreenchange', onFsChange);
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      void wrapRef.current?.requestFullscreen();
    } else {
      void document.exitFullscreen();
    }
  }

  return (
    <div ref={wrapRef} className="relative h-full w-full bg-slate-900">
      <div ref={mountRef} className="h-full w-full" />
      <button
        type="button"
        onClick={toggleFullscreen}
        className="absolute bottom-3 right-3 z-10 rounded-lg bg-black/50 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-black/70"
      >
        {isFs ? '✕ Exit full screen' : '⛶ Full screen'}
      </button>
    </div>
  );
}
