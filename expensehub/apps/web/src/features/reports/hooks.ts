// API §5–6 client hooks: reports (claimant) and approvals (approvers).
import {
  inboxListSchema,
  reportDetailSchema,
  reportListSchema,
  type ReportCreate,
  type ReportUpdate,
} from '@expensehub/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { api } from '../../lib/api';

export const reportKeys = {
  all: ['reports'] as const,
  mine: ['reports', 'mine'] as const,
  one: (id: number) => ['reports', id] as const,
  inbox: ['approvals', 'inbox'] as const,
};

export const useMyReports = () =>
  useQuery({
    queryKey: reportKeys.mine,
    queryFn: ({ signal }) => api('/reports', reportListSchema, { signal }),
    select: (d) => d.items,
  });

export const useReport = (id: number | null) =>
  useQuery({
    queryKey: reportKeys.one(id ?? 0),
    queryFn: ({ signal }) => api(`/reports/${id}`, reportDetailSchema, { signal }),
    enabled: id !== null,
  });

export const useInbox = (enabled = true) =>
  useQuery({
    queryKey: reportKeys.inbox,
    queryFn: ({ signal }) => api('/approvals/inbox', inboxListSchema, { signal }),
    select: (d) => d.items,
    enabled,
    // Approvals arrive while the page is open.
    refetchInterval: 60_000,
  });

/** Any report change can move lines, totals, the inbox and the status page. */
function useReportMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: reportKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['approvals'] }),
        queryClient.invalidateQueries({ queryKey: ['expenses'] }),
      ]),
  });
}

export const useCreateReport = () =>
  useReportMutation((body: ReportCreate) =>
    api('/reports', reportDetailSchema, { method: 'POST', body }),
  );

export const useUpdateReport = () =>
  useReportMutation(({ id, body }: { id: number; body: ReportUpdate }) =>
    api(`/reports/${id}`, reportDetailSchema, { method: 'PATCH', body }),
  );

export const useDeleteReport = () =>
  useReportMutation((id: number) => api(`/reports/${id}`, z.null(), { method: 'DELETE' }));

export type ClaimantAction = 'submit' | 'withdraw' | 'correct';
export const useClaimantAction = () =>
  useReportMutation(
    ({ id, action, version }: { id: number; action: ClaimantAction; version: number }) =>
      api(`/reports/${id}/${action}`, reportDetailSchema, { method: 'POST', body: { version } }),
  );

export const useReplyInfo = () =>
  useReportMutation(({ id, comment }: { id: number; comment: string }) =>
    api(`/reports/${id}/reply-info`, reportDetailSchema, { method: 'POST', body: { comment } }),
  );

export type Decision = 'approve' | 'reject' | 'request-info';
export const useDecision = () =>
  useReportMutation(
    ({ stepId, decision, comment }: { stepId: number; decision: Decision; comment?: string }) =>
      api(`/approvals/${stepId}/${decision}`, reportDetailSchema, {
        method: 'POST',
        body: comment ? { comment } : {},
      }),
  );
