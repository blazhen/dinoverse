import Link from 'next/link';

import { OrientationGate } from '../expedition/orientation-gate';
import { RunnerCanvas } from './runner-canvas';

export const metadata = { title: 'Dino Dash' };

export default function RunnerPage() {
  return (
    <main className="flex h-[100dvh] flex-col bg-slate-900 text-white">
      <OrientationGate />
      <header className="flex items-center justify-between gap-4 px-4 py-2">
        <div className="flex items-center gap-3">
          <Link href="/games" className="text-sm font-semibold text-emerald-300 hover:underline">
            ← Games
          </Link>
          <h1 className="text-lg font-black">🦖 Dino Dash</h1>
        </div>
        <p className="hidden text-xs text-slate-300 sm:block">
          <span className="font-semibold">←/→</span> switch lane · <span className="font-semibold">↑/Space</span>{' '}
          jump · <span className="font-semibold">↓</span> slide · <span className="font-semibold">E</span> smash · <span className="font-semibold">P</span> pause · (or swipe)
        </p>
      </header>

      <div className="min-h-0 flex-1">
        <RunnerCanvas />
      </div>

      <p className="px-4 py-1.5 text-center text-xs text-slate-400">
        Jump 🟫, slide under 🟦, grab 💎, and smash 🟨 boxes / 📦 crates (💥) for a rune — crates need
        2 fast taps! (3D prototype — placeholder art.)
      </p>
    </main>
  );
}
