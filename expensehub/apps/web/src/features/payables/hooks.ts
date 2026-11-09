// API §8 Payables / Quick Pays. (The dev simulator hooks live in features/dev, so their
// endpoints never reach a production bundle.)
import {
  jobRunSchema,
  payablesResponseSchema,
  quickPayQueueSchema,
  sendResultSchema,
} from '@expensehub/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { api } from '../../lib/api';

export const payablesKeys = {
  list: ['payables'] as const,
  quickPays: ['quick-pays', 'queue'] as const,
};

export const usePayables = () =>
  useQuery({
    queryKey: payablesKeys.list,
    queryFn: ({ signal }) => api('/payables', payablesResponseSchema, { signal }),
  });

export const useQuickPayQueue = () =>
  useQuery({
    queryKey: payablesKeys.quickPays,
    queryFn: ({ signal }) => api('/quick-pays', quickPayQueueSchema, { signal }),
  });

/** Anything that moves an invoice refreshes every Finance view and the reports. */
export function useFinanceMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () =>
      Promise.all(
        [['payables'], ['quick-pays'], ['reports'], ['dev']].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
  });
}

export const useSendInvoices = () =>
  useFinanceMutation((ids: number[]) =>
    api('/payables/send', sendResultSchema, { method: 'POST', body: { ids } }),
  );

export const useRetryInvoice = () =>
  useFinanceMutation((id: number) =>
    api(`/payables/${id}/retry`, sendResultSchema, { method: 'POST', body: {} }),
  );

export const useRefreshStatus = () =>
  useFinanceMutation(() =>
    api('/payables/refresh-status', jobRunSchema, { method: 'POST', body: {} }),
  );

export const useInvoiceQuickPays = () =>
  useFinanceMutation((ids: number[]) =>
    api('/quick-pays/invoice', sendResultSchema, { method: 'POST', body: { ids } }),
  );

export const useExcludeQuickPay = () =>
  useFinanceMutation(({ id, reason }: { id: number; reason: string }) =>
    api(`/quick-pays/${id}/exclude`, z.null(), { method: 'POST', body: { reason } }),
  );
