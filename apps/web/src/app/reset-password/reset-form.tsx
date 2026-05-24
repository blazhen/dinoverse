'use client';

import { Button } from '@dinoverse/ui';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { resetPassword } from '@/lib/auth-client';

export function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token');
  const tokenError = params.get('error'); // e.g. INVALID_TOKEN from Better Auth redirect

  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (!token || tokenError) {
    return (
      <div className="text-center">
        <h1 className="text-2xl font-black">Link expired or invalid</h1>
        <p className="mt-2 text-slate-500">Please request a new password reset link.</p>
        <Link
          href="/forgot-password"
          className="mt-4 inline-block font-semibold text-emerald-600"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await resetPassword({ newPassword: password, token: token! });
    setLoading(false);
    if (error) {
      setError(error.message ?? 'Could not reset password.');
      return;
    }
    setDone(true);
    setTimeout(() => router.push('/sign-in'), 1500);
  }

  if (done) {
    return (
      <div className="text-center">
        <div className="text-5xl">✅</div>
        <h1 className="mt-2 text-2xl font-black">Password updated!</h1>
        <p className="mt-1 text-slate-500">Taking you to sign in…</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="text-center">
        <h1 className="text-3xl font-black">Set a new password</h1>
      </div>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        New password
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
      <Button type="submit" disabled={loading}>
        {loading ? 'Saving…' : 'Update password'}
      </Button>
    </form>
  );
}
