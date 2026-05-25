import { listChildProfiles } from '@dinoverse/db';
import { cookies, headers } from 'next/headers';

import { auth } from './auth';
import { db } from './db';

export const ACTIVE_CHILD_COOKIE = 'activeChildId';

/**
 * The child currently "playing", or null. Always re-validates that the cookie's
 * child id actually belongs to the logged-in parent — never trust the cookie alone.
 */
export async function getActiveChild() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const id = (await cookies()).get(ACTIVE_CHILD_COOKIE)?.value;
  if (!id) return null;

  const kids = await listChildProfiles(db, session.user.id);
  return kids.find((k) => k.id === id) ?? null;
}
