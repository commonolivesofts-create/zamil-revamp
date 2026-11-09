// API §7 audit + FR-ACC-01 preview client hooks.
import {
  accountingPreviewSchema,
  auditQueueSchema,
  reportDetailSchema,
  type LineAdjust,
} from '@expensehub/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

export const auditKeys = {
  queue: ['audit', 'queue'] as const,
  preview: (id: number) => ['reports', id, 'accounting'] as const,
};

export const useAuditQueue = () =>
  useQuery({
    queryKey: auditKeys.queue,
    queryFn: ({ signal }) => api('/audit/queue', auditQueueSchema, { signal }),
    select: (d) => d.items,
  });

export const useAccountingPreview = (reportId: number | null) =>
  useQuery({
    queryKey: auditKeys.preview(reportId ?? 0),
    queryFn: ({ signal }) =>
      api(`/reports/${reportId}/accounting-preview`, accountingPreviewSchema, { signal }),
    enabled: reportId !== null,
  });

export type AuditAction =
  | { kind: 'verify'; receiptId: number }
  | { kind: 'adjust'; expenseId: number; body: LineAdjust }
  | { kind: 'release'; comment?: string }
  | { kind: 'reject'; comment: string };

function path(reportId: number, a: AuditAction): { url: string; body: unknown } {
  switch (a.kind) {
    case 'verify':
      return { url: `/audit/${reportId}/receipts/${a.receiptId}/verify`, body: {} };
    case 'adjust':
      return { url: `/audit/${reportId}/lines/${a.expenseId}/adjust`, body: a.body };
    case 'release':
      return { url: `/audit/${reportId}/release`, body: a.comment ? { comment: a.comment } : {} };
    case 'reject':
      return { url: `/audit/${reportId}/reject`, body: { comment: a.comment } };
  }
}

/** Every audit action returns the report; lists, the preview and the inbox refresh. */
export const useAuditAction = (reportId: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (action: AuditAction) => {
      const { url, body } = path(reportId, action);
      return api(url, reportDetailSchema, { method: 'POST', body });
    },
    onSuccess: (report) => {
      queryClient.setQueryData(['reports', reportId], report);
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ['audit'] }),
        queryClient.invalidateQueries({ queryKey: ['approvals'] }),
        queryClient.invalidateQueries({ queryKey: ['reports'] }),
      ]);
    },
  });
};
