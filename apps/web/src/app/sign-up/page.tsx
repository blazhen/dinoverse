'use client';

import { Button } from '@dinoverse/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { signUp } from '@/lib/auth-client';

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await signUp.email({ name, email, password });
    setLoading(false);
    if (error) {
      setError(error.message ?? 'Something went wrong.');
      return;
    }
    router.push('/dashboard');
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-20">
      <div className="text-center">
        <h1 className="text-3xl font-black">Create a parent account</h1>
        <p className="mt-1 text-sm text-slate-500">
          Parents sign up here. You&apos;ll add your kids&apos; profiles next.
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Name
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-xl border border-slate-300 px-4 py-3 font-normal"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-xl border border-slate-300 px-4 py-3 font-normal"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Password
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-xl border border-slate-300 px-4 py-3 font-normal"
          />
        </label>

        {error && <p className="text-sm font-semibold text-red-600">{error}</p>}

        <Button type="submit" disabled={loading} className="mt-2">
          {loading ? 'Creating…' : 'Create account'}
        </Button>
      </form>

      <p className="text-center text-sm text-slate-500">
        Already have an account?{' '}
        <Link href="/sign-in" className="font-semibold text-emerald-600">
          Sign in
        </Link>
      </p>
    </main>
  );
}
