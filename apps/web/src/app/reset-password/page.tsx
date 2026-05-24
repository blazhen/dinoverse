import { Suspense } from 'react';

import { ResetForm } from './reset-form';

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-20">
      <Suspense fallback={<p className="text-center text-slate-400">Loading…</p>}>
        <ResetForm />
      </Suspense>
    </main>
  );
}
