import { createAuthClient } from 'better-auth/react';

/**
 * Client-side Better Auth helpers (signIn, signUp, signOut, useSession).
 * baseURL defaults to the current origin, which is correct when the web app
 * hosts the auth routes itself.
 */
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession, requestPasswordReset, resetPassword } =
  authClient;
