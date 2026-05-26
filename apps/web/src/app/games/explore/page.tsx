import Link from 'next/link';

import { GameCanvas } from './game-canvas';

export const metadata = { title: 'Explore Dino City' };

export default function ExplorePage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">🦖 Explore Dino City</h1>
        <Link href="/games" className="text-sm font-semibold text-emerald-600 hover:underline">
          ← All games
        </Link>
      </div>
      <p className="text-sm text-slate-500">
        Use <span className="font-semibold">Arrow keys</span> or{' '}
        <span className="font-semibold">WASD</span> to walk around. Find all the eggs to learn dino
        facts!
      </p>
      <GameCanvas />
    </main>
  );
}
