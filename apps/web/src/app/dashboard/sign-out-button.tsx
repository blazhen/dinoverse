'use client';

import { Button } from '@dinoverse/ui';
import { useRouter } from 'next/navigation';

import { signOut } from '@/lib/auth-client';

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="secondary"
      onClick={async () => {
        await signOut();
        router.push('/');
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
