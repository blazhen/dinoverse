'use client';

import type { Game } from 'phaser';
import { useEffect, useRef } from 'react';

/**
 * Mounts the Phaser game client-side only. Phaser (and the scene module that
 * imports it) is dynamically imported inside the effect so it never loads on the
 * server — Phaser touches `window`/`canvas` at import time.
 */
export function GameCanvas() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let game: Game | undefined;
    let cancelled = false;

    void import('./dino-explore').then(({ createDinoExplore }) => {
      if (cancelled || !ref.current) return;
      game = createDinoExplore(ref.current);
    });

    return () => {
      cancelled = true;
      game?.destroy(true);
    };
  }, []);

  return <div ref={ref} className="mx-auto w-full max-w-[800px] overflow-hidden rounded-2xl shadow-lg" />;
}
