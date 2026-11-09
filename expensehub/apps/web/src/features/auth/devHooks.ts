// D-33 dev-only API hooks. Imported only by DevQuickLogin (a lazy chunk that production builds
// drop), so none of this reaches a production bundle.
import { devUsersResponseSchema, meResponseSchema } from '@expensehub/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { ME_KEY } from './hooks';

export function useDevUsers() {
  return useQuery({
    queryKey: ['dev-users'],
    queryFn: ({ signal }) => api('/auth/dev-users', devUsersResponseSchema, { signal }),
    retry: false,
    staleTime: Infinity,
  });
}

export function useDevLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (personNumber: string) =>
      api('/auth/dev-login', meResponseSchema, { method: 'POST', body: { personNumber } }),
    onSuccess: (me) => queryClient.setQueryData(ME_KEY, me),
  });
}
