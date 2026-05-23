import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { auth } from '@/lib/auth';

import { SignOutButton } from './sign-out-button';

export default async function DashboardPage() {
  // Server-side gate: no session → bounce to sign-in.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect('/sign-in');
  }

  const { user } = session;

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
        <h2 className="text-xl font-bold">Your kids</h2>
        <p className="mt-1 text-sm text-slate-500">
          No child profiles yet. (Coming next: add a child, pick their dino avatar and age band.)
        </p>
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
