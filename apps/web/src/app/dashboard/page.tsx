import { type CharacterId, getGameProgress, listChildProfiles, listChildProgressDetailed } from '@dinoverse/db';
import { Button } from '@dinoverse/ui';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

import { addChild, removeChild } from './actions';
import { SignOutButton } from './sign-out-button';

const AVATARS: Record<CharacterId, string> = {
  trik: '⚡ Trik',
  stego: '🛡️ Stego',
  brachiosaurus: '🔭 Brachiosaurus',
};

const inputClass = 'rounded-xl border border-slate-300 px-4 py-2.5 font-normal';

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect('/sign-in');
  }

  const { user } = session;
  const children = await listChildProfiles(db, user.id);
  const progressByChild = await Promise.all(
    children.map((c) => listChildProgressDetailed(db, c.id)),
  );
  const gameByChild = await Promise.all(children.map((c) => getGameProgress(db, c.id)));

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-16">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black">Parent Dashboard</h1>
          <p className="text-sm text-slate-500">
            Signed in as <span className="font-semibold">{user.name}</span> ({user.email})
          </p>
        </div>
        <SignOutButton />
      </header>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Your kids</h2>
          {children.length > 0 && (
            <Link href="/play" className="text-sm font-semibold text-emerald-600 hover:underline">
              ▶ Who&apos;s playing?
            </Link>
          )}
        </div>

        {children.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">No child profiles yet. Add your first below.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {children.map((child, i) => {
              const history = progressByChild[i] ?? [];
              const best = history.length ? Math.max(...history.map((h) => h.score)) : null;
              const game = gameByChild[i];
              return (
                <li key={child.id} className="rounded-xl bg-slate-50 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold">{child.displayName}</p>
                      <p className="text-sm text-slate-500">
                        {AVATARS[child.avatarCharacter]} · ages {child.ageBand}
                      </p>
                    </div>
                    <form action={removeChild}>
                      <input type="hidden" name="id" value={child.id} />
                      <button
                        type="submit"
                        className="rounded-lg px-3 py-1 text-sm font-semibold text-red-600 hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </form>
                  </div>
                  {history.length > 0 ? (
                    <p className="mt-2 text-xs text-slate-500">
                      🧠 {history.length} quiz{history.length === 1 ? '' : 'zes'} · best score {best}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-slate-400">🧠 No quizzes yet</p>
                  )}
                  {game ? (
                    <p className="mt-1 text-xs text-slate-500">
                      🎮 Expedition: {game.levelsCompleted} level
                      {game.levelsCompleted === 1 ? '' : 's'} done · reached level {game.highestLevel}{' '}
                      · difficulty {game.difficulty}/10 · 💎 {game.gems}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-slate-400">🎮 No game progress yet</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <form action={addChild} className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-6">
          <h3 className="font-semibold">Add a child</h3>
          <input name="displayName" placeholder="Child's name" required className={inputClass} />
          <div className="flex gap-3">
            <select name="ageBand" required className={`${inputClass} flex-1`} defaultValue="5-6">
              <option value="5-6">Ages 5–6</option>
              <option value="7-8">Ages 7–8</option>
              <option value="9-10">Ages 9–10</option>
              <option value="11-12">Ages 11–12</option>
              <option value="13-14">Ages 13–14</option>
            </select>
            <select
              name="avatarCharacter"
              required
              className={`${inputClass} flex-1`}
              defaultValue="trik"
            >
              <option value="trik">⚡ Trik</option>
              <option value="stego">🛡️ Stego</option>
              <option value="brachiosaurus">🔭 Brachiosaurus</option>
            </select>
          </div>
          <Button type="submit" className="self-start">
            Add child
          </Button>
        </form>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold">Coming soon</h2>
        <ul className="mt-2 list-inside list-disc text-sm text-slate-500">
          <li>Learning metrics &amp; milestones</li>
          <li>Screen-time controls</li>
          <li>Verifiable parental consent (COPPA)</li>
        </ul>
      </section>
    </main>
  );
}
