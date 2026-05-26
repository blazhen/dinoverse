import Link from 'next/link';

import { GameCanvas } from './game-canvas';

export const metadata = { title: 'Dino Expedition' };

export default function ExpeditionPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">🦖 Dino Expedition</h1>
        <Link href="/games" className="text-sm font-semibold text-emerald-600 hover:underline">
          ← All games
        </Link>
      </div>
      <p className="text-sm text-slate-500">
        Run, jump, dash, and crawl through the world. Collect gems and reach the nest 🪺. (Prototype
        — placeholder art; character switching &amp; abilities coming next.)
      </p>
      <GameCanvas />
      <p className="text-xs text-slate-400">
        Controls: <span className="font-semibold">←/→</span> or A/D to move ·{' '}
        <span className="font-semibold">↑/Space</span> jump ·{' '}
        <span className="font-semibold">Shift</span> dash · <span className="font-semibold">↓</span>{' '}
        crawl under low gaps.
      </p>
    </main>
  );
}
