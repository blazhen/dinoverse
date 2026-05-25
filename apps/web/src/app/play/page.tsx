import { type CharacterId, listChildProfiles } from '@dinoverse/db';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

import { setActiveChild } from './actions';

const AVATARS: Record<CharacterId, string> = {
  trik: '⚡',
  stego: '🛡️',
  brachiosaurus: '🔭',
};

export default async function PlayPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect('/sign-in');
  }

  const children = await listChildProfiles(db, session.user.id);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16 text-center">
      <h1 className="text-3xl font-black">Who&apos;s playing? 🦕</h1>

      {children.length === 0 ? (
        <p className="text-sm text-slate-500">
          No kids yet.{' '}
          <Link href="/dashboard" className="font-semibold text-emerald-600">
            Add a child on the dashboard
          </Link>{' '}
          first.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-3">
          {children.map((child) => (
            <li key={child.id}>
              <form action={setActiveChild}>
                <input type="hidden" name="childId" value={child.id} />
                <button
                  type="submit"
                  className="flex w-full flex-col items-center gap-2 rounded-2xl bg-white p-6 shadow-sm transition hover:scale-105 hover:shadow-md"
                >
                  <span className="text-4xl">{AVATARS[child.avatarCharacter]}</span>
                  <span className="text-lg font-bold">{child.displayName}</span>
                  <span className="text-xs text-slate-400">ages {child.ageBand}</span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <Link href="/dashboard" className="text-sm font-semibold text-slate-500 hover:underline">
        ← Back to parent dashboard
      </Link>
    </main>
  );
}
