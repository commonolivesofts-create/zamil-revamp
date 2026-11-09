// The signed-in user for everything inside <RequireAuth>.
import type { MeResponse } from '@expensehub/shared';
import { createContext, useContext } from 'react';

export const CurrentUserContext = createContext<MeResponse | null>(null);

export function useCurrentUser(): MeResponse {
  const me = useContext(CurrentUserContext);
  if (!me) throw new Error('useCurrentUser() used outside <RequireAuth>');
  return me;
}

/** Where to go after sign-in: same-site paths only, never "//evil.example" (open redirect). */
export function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\')
    ? next
    : '/';
}

let signingOut = false;

/** A deliberate sign-out, so the login page does not say "your session ended". */
export function markSigningOut(): void {
  signingOut = true;
}

/** Read during render (no side effects); the login page clears it once shown. */
export function isSigningOut(): boolean {
  return signingOut;
}

export function clearSigningOut(): void {
  signingOut = false;
}

/** Dev tools show only in a dev build AND when the API allows quick-login (D-33). */
export function devToolsEnabled(me: Pick<MeResponse, 'dev'> | null | undefined): boolean {
  return import.meta.env.DEV && (me?.dev.quickLogin ?? false);
}
