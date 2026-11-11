// API §2 client hooks. The signed-in user lives in the ['me'] query: null = signed out.
import {
  meResponseSchema,
  okResponseSchema,
  type LoginRequest,
  type MeResponse,
} from '@expensehub/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api';
import { markSigningOut } from '../../lib/session';
import { redirectToZamilLogin } from '../../lib/zamil-login';

export const ME_KEY = ['me'] as const;

export function useMe() {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ME_KEY,
    queryFn: async ({ signal }): Promise<MeResponse | null> => {
      const hadSignedInUser = Boolean(queryClient.getQueryData<MeResponse>(ME_KEY));
      try {
        return await api('/auth/me', meResponseSchema, { signal });
      } catch (err) {
        if (err instanceof ApiError && err.code === 'UNAUTHENTICATED') {
          // A previously valid ExpenseHub session has expired. Hand off to Zamil login instead
          // of silently exchanging the still-active parent cookie and keeping the hub open.
          if (hadSignedInUser) return null;

          // The API validates the HttpOnly Zamil cookie server-to-server, then gives ExpenseHub
          // its own bounded session on a fresh hub visit. Only a missing/expired Zamil session
          // falls back to login; operational errors and missing profiles remain visible.
          try {
            return await api('/auth/sso', meResponseSchema, { method: 'POST', signal });
          } catch (ssoError) {
            if (ssoError instanceof ApiError && ssoError.code === 'UNAUTHENTICATED') return null;
            throw ssoError;
          }
        }
        throw err;
      }
    },
    staleTime: 5 * 60_000,
    // Check the bounded hub session periodically; a null session stops polling after handoff.
    refetchInterval: (query) =>
      query.state.data === null || (query.state.status === 'error' && !query.state.data)
        ? false
        : 60_000,
    retry: false,
    // A failed auth check must not refetch immediately when RequireAuth hands off to /login.
    retryOnMount: false,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: LoginRequest) =>
      api('/auth/login', meResponseSchema, { method: 'POST', body }),
    onSuccess: (me) => queryClient.setQueryData(ME_KEY, me),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api('/auth/logout', okResponseSchema, { method: 'POST' }),
    onSettled: () => {
      markSigningOut();
      // Start the parent navigation before clearing observed auth state so RequireAuth cannot
      // briefly render the ExpenseHub login page during a deliberate sign-out.
      redirectToZamilLogin();
      // Write null into the observed ['me'] query (RequireAuth reacts), then drop every other
      // cached query so the next user never sees this user's data. clear() would also remove
      // ['me'] itself and leave RequireAuth watching a detached query.
      queryClient.setQueryData(ME_KEY, null);
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_KEY[0] });
    },
  });
}

export function usePasswordRequest() {
  return useMutation({
    mutationFn: (username: string) =>
      api('/auth/password/request', okResponseSchema, { method: 'POST', body: { username } }),
  });
}

export function usePasswordReset() {
  return useMutation({
    mutationFn: (body: { token: string; password: string }) =>
      api('/auth/password/reset', okResponseSchema, { method: 'POST', body }),
  });
}
