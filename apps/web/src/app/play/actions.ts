'use server';

import { listChildProfiles } from '@dinoverse/db';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { ACTIVE_CHILD_COOKIE } from '@/lib/active-child';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function setActiveChild(formData: FormData) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error('Not authenticated');

  const childId = String(formData.get('childId') ?? '');
  // Ownership check: the child must belong to this parent.
  const kids = await listChildProfiles(db, session.user.id);
  if (!kids.some((k) => k.id === childId)) {
    throw new Error('That child profile is not yours');
  }

  (await cookies()).set(ACTIVE_CHILD_COOKIE, childId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect('/learn');
}

export async function clearActiveChild() {
  (await cookies()).delete(ACTIVE_CHILD_COOKIE);
  redirect('/play');
}
