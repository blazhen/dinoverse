import Link from 'next/link';

export const metadata = { title: 'DinoVerse Games' };

interface GameCard {
  href: string | null;
  emoji: string;
  title: string;
  blurb: string;
  tag: string;
}

const games: GameCard[] = [
  {
    href: '/games/explore',
    emoji: '🦖',
    title: 'Explore Dino City',
    blurb: 'Walk around the open world and find hidden eggs full of dino facts.',
    tag: 'Open world',
  },
  {
    href: '/learn',
    emoji: '🧠',
    title: 'Quiz Games',
    blurb: 'Quick learning quizzes with badges.',
    tag: 'Learning',
  },
  {
    href: null,
    emoji: '🧩',
    title: 'Puzzle Games',
    blurb: 'Matching, counting, and logic puzzles. Coming soon!',
    tag: 'Puzzle',
  },
];

export default function GamesPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
      <h1 className="text-3xl font-black">🎮 Games</h1>

      <ul className="grid gap-4 sm:grid-cols-2">
        {games.map((g) => {
          const card = (
            <div
              className={`flex h-full flex-col gap-1 rounded-2xl bg-white p-5 shadow-sm ${
                g.href ? 'transition hover:scale-[1.02] hover:shadow-md' : 'opacity-60'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-3xl">{g.emoji}</span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                  {g.tag}
                </span>
              </div>
              <p className="mt-2 text-lg font-bold">{g.title}</p>
              <p className="text-sm text-slate-500">{g.blurb}</p>
            </div>
          );
          return (
            <li key={g.title}>
              {g.href ? <Link href={g.href}>{card}</Link> : card}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
