'use server';

import {
  type AgeBand,
  type CharacterId,
  createChildProfile,
  deleteChildProfile,
} from '@dinoverse/db';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

const AGE_BANDS: AgeBand[] = ['5-6', '7-8', '9-10'];
const CHARACTERS: CharacterId[] = ['trik', 'stego', 'brachiosaurus'];

async function requireParentId() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    throw new Error('Not authenticated');
  }
  return session.user.id;
}

export async function addChild(formData: FormData) {
  const parentId = await requireParentId();

  const displayName = String(formData.get('displayName') ?? '').trim();
  const ageBand = String(formData.get('ageBand') ?? '') as AgeBand;
  const avatarCharacter = String(formData.get('avatarCharacter') ?? '') as CharacterId;

  if (!displayName) throw new Error('Child name is required');
  if (!AGE_BANDS.includes(ageBand)) throw new Error('Invalid age band');
  if (!CHARACTERS.includes(avatarCharacter)) throw new Error('Invalid avatar');

  await createChildProfile(db, { parentId, displayName, ageBand, avatarCharacter });
  revalidatePath('/dashboard');
}

export async function removeChild(formData: FormData) {
  const parentId = await requireParentId();
  const id = String(formData.get('id') ?? '');
  if (!id) throw new Error('Missing child id');

  await deleteChildProfile(db, id, parentId);
  revalidatePath('/dashboard');
}
