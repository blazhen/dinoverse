import { listQuizzes } from '@dinoverse/db';
import Link from 'next/link';

import { db } from '@/lib/db';

export const metadata = { title: 'DinoVerse Learn' };

// Reads quizzes from the DB per request — don't prerender at build (no DB there).
export const dynamic = 'force-dynamic';

export default async function LearnPage() {
  const quizzes = await listQuizzes(db);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16">
      <h1 className="text-3xl font-black">🦕 Learn &amp; Play</h1>
      <p className="text-sm text-slate-500">Pick a quiz and earn a badge!</p>

      {quizzes.length === 0 ? (
        <p className="text-sm text-slate-500">No quizzes yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {quizzes.map((quiz) => (
            <li key={quiz.id}>
              <Link
                href={`/learn/${quiz.id}`}
                className="flex items-center justify-between rounded-2xl bg-white p-5 shadow-sm transition hover:shadow-md"
              >
                <div>
                  <p className="text-xl font-bold">{quiz.title}</p>
                  <p className="text-sm text-slate-500 capitalize">{quiz.topic}</p>
                </div>
                <span className="text-emerald-600">▶</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
