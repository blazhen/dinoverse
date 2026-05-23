import { Button } from '@dinoverse/ui';
import type { Character } from '@dinoverse/types';
import Link from 'next/link';

const cast: Character[] = [
  { id: 'trik', name: 'Trik', archetype: 'The spark', personality: 'Fast, curious, mischievous' },
  { id: 'stego', name: 'Stego', archetype: 'The steady one', personality: 'Calm, logical, protective' },
  {
    id: 'brachiosaurus',
    name: 'Brachiosaurus',
    archetype: 'The sage',
    personality: 'Gentle giant; loves science & astronomy',
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col items-center gap-10 px-6 py-20 text-center">
      <div className="space-y-4">
        <h1 className="text-5xl font-black tracking-tight">🦕 DinoVerse</h1>
        <p className="text-lg text-slate-600">
          Dinosaurs never went extinct — they built a modern world. Learn, watch, and play together.
        </p>
      </div>

      <ul className="grid w-full gap-4 sm:grid-cols-3">
        {cast.map((c) => (
          <li key={c.id} className="rounded-2xl bg-white p-5 text-left shadow-sm">
            <p className="text-xl font-bold">{c.name}</p>
            <p className="text-sm font-semibold text-emerald-600">{c.archetype}</p>
            <p className="mt-1 text-sm text-slate-500">{c.personality}</p>
          </li>
        ))}
      </ul>

      <div className="flex gap-3">
        <Link href="/sign-up">
          <Button>Create parent account</Button>
        </Link>
        <Link href="/sign-in">
          <Button variant="secondary">Sign in</Button>
        </Link>
      </div>
    </main>
  );
}
