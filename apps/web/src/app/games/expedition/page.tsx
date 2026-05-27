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
        Switch between three dino friends and use each one&apos;s special skill to get all three home
        🏡. <span className="font-semibold">Trik ⚡</span> dashes across gaps,{' '}
        <span className="font-semibold">Stego 🛡️</span> smashes cracked blocks, and{' '}
        <span className="font-semibold">Brachiosaurus 🔭</span> jumps extra high. (Prototype —
        placeholder art.)
      </p>
      <GameCanvas />
      <p className="text-xs text-slate-400">
        Controls: <span className="font-semibold">1 / 2 / 3</span> (or Q) switch dino ·{' '}
        <span className="font-semibold">←/→</span> or A/D move ·{' '}
        <span className="font-semibold">↑/Space</span> jump · <span className="font-semibold">Shift</span>{' '}
        ability · <span className="font-semibold">↓</span> crawl.
      </p>
    </main>
  );
}
