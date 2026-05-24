'use client';

import { Button } from '@dinoverse/ui';
import Link from 'next/link';
import { useState } from 'react';

import { requestPasswordReset } from '@/lib/auth-client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await requestPasswordReset({ email, redirectTo: '/reset-password' });
    setLoading(false);
    if (error) {
      setError(error.message ?? 'Something went wrong.');
      return;
    }
    // Always show the same message whether or not the email exists (no account enumeration).
    setSent(true);
  }

  if (sent) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 px-6 py-20 text-center">
        <div className="text-5xl">📬</div>
        <h1 className="text-2xl font-black">Check your email</h1>
        <p className="text-slate-500">
          If an account exists for <span className="font-semibold">{email}</span>, we&apos;ve sent a
          link to reset your password. The link expires in 1 hour.
        </p>
        <Link href="/sign-in" className="font-semibold text-emerald-600">
          Back to sign in
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-20">
      <div className="text-center">
        <h1 className="text-3xl font-black">Forgot your password?</h1>
        <p className="mt-1 text-sm text-slate-500">
          Enter your email and we&apos;ll send you a reset link.
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
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

        {error && <p className="text-sm font-semibold text-red-600">{error}</p>}

        <Button type="submit" disabled={loading}>
          {loading ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>

      <p className="text-center text-sm text-slate-500">
        <Link href="/sign-in" className="font-semibold text-emerald-600">
          Back to sign in
        </Link>
      </p>
    </main>
  );
}
