// Single sign-on with Zamil Digitalization: GET /auth/me, and on 401 POST /auth/sso to exchange
// the Zamil session for an attendance session. The signed-in employee is shared via MeContext.
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useState } from 'react';
import { z } from 'zod';
import { meSchema, type Me } from '@attendance/shared';
import { api, ApiError } from '../lib/api';
import { redirectToZamilLogin } from '../lib/zamil-login';

export const ME_QUERY_KEY = ['me'] as const;

export async function signInWithZamil(signal: AbortSignal): Promise<Me> {
  try {
    return await api('/auth/me', meSchema, { signal });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return api('/auth/sso', meSchema, { method: 'POST', signal });
    }
    throw error;
  }
}

/** Signed in to Zamil, but no employee record in XX_DIGI_EMP_MASTER. */
export const isNotLinked = (error: unknown) =>
  error instanceof ApiError &&
  (error.details as { reason?: string } | undefined)?.reason === 'NOT_LINKED';

/** No (valid) Zamil session: the user must sign in to Zamil first. */
export const needsZamilLogin = (error: unknown) =>
  error instanceof ApiError &&
  (error.status === 401 || error.status === 403) &&
  !isNotLinked(error);

export const MeContext = createContext<Me | null>(null);

export function useMe(): Me {
  const me = useContext(MeContext);
  if (!me) throw new Error('useMe must be used inside AuthGate');
  return me;
}

/** Signs out of the attendance system and the central Zamil session. */
export function useSignOut() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const signOut = async () => {
    setPending(true);
    try {
      await api('/auth/logout', z.null(), { method: 'POST' });
    } finally {
      queryClient.clear();
      redirectToZamilLogin();
      setPending(false);
    }
  };
  return { signOut, pending };
}
