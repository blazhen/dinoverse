import Link from 'next/link';

import { GameCanvas } from './game-canvas';

export const metadata = { title: 'Dino Expedition' };

export default function ExpeditionPage() {
  return (
    <main className="flex h-[100dvh] flex-col bg-slate-900 text-white">
      <header className="flex items-center justify-between gap-4 px-4 py-2">
        <div className="flex items-center gap-3">
          <Link href="/games" className="text-sm font-semibold text-emerald-300 hover:underline">
            ← Games
          </Link>
          <h1 className="text-lg font-black">🦖 Dino Expedition</h1>
        </div>
        <p className="hidden text-xs text-slate-300 sm:block">
          <span className="font-semibold">1/2/3</span> switch dino ·{' '}
          <span className="font-semibold">←/→</span> move · <span className="font-semibold">↑/Space</span>{' '}
          jump · <span className="font-semibold">Shift</span> ability · <span className="font-semibold">↓</span> crawl
        </p>
      </header>

      <div className="min-h-0 flex-1">
        <GameCanvas />
      </div>

      <p className="px-4 py-1.5 text-center text-xs text-slate-400">
        Get all three dinos home 🏡 — Trik ⚡ dashes, Stego 🛡️ smashes cracked blocks, Brachiosaurus
        🔭 jumps high. (Prototype — placeholder art.)
      </p>
    </main>
  );
}
