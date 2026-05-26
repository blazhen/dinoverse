'use client';

import type { Game } from 'phaser';
import { useEffect, useRef } from 'react';

/** Client-only mount for the side-scroll platformer (Phaser loaded in-effect). */
export function GameCanvas() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let game: Game | undefined;
    let cancelled = false;

    void import('./platformer').then(({ createExpedition }) => {
      if (cancelled || !ref.current) return;
      game = createExpedition(ref.current);
    });

    return () => {
      cancelled = true;
      game?.destroy(true);
    };
  }, []);

  return (
    <div ref={ref} className="mx-auto w-full max-w-[800px] overflow-hidden rounded-2xl shadow-lg" />
  );
}
