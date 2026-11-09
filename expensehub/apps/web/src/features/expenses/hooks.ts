// API §3–4 client hooks for expense capture (FR-CAP, FR-POL).
import {
  coaValueListSchema,
  currencyListSchema,
  expenseEvaluationSchema,
  expenseListSchema,
  expenseSchema,
  expenseTypeListSchema,
  quickPayRefListSchema,
  receiptUploadResponseSchema,
  tripRefListSchema,
  type ExpenseInput,
  type ExpenseUpdate,
} from '@expensehub/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { api } from '../../lib/api';

export const expenseKeys = {
  all: ['expenses'] as const,
  unreported: ['expenses', 'unreported'] as const,
  one: (id: number) => ['expenses', id] as const,
};

const REF_STALE = 5 * 60_000;

// ─── Reference data ─────────────────────────────────────────────────────────

export const useCaptureTypes = () =>
  useQuery({
    queryKey: ['ref', 'expense-types'],
    queryFn: ({ signal }) => api('/ref/expense-types', expenseTypeListSchema, { signal }),
    select: (d) => [...d.items].sort((a, b) => a.sortOrder - b.sortOrder),
    staleTime: REF_STALE,
  });

export const useCurrencies = () =>
  useQuery({
    queryKey: ['ref', 'currencies'],
    queryFn: ({ signal }) => api('/ref/currencies', currencyListSchema, { signal }),
    select: (d) => d.items,
    staleTime: REF_STALE,
  });

export const useMyTrips = () =>
  useQuery({
    queryKey: ['ref', 'trips', 'mine'],
    queryFn: ({ signal }) => api('/ref/trips/mine', tripRefListSchema, { signal }),
    select: (d) => d.items,
    staleTime: REF_STALE,
  });

export const useMyQuickPays = () =>
  useQuery({
    queryKey: ['quick-pays', 'mine'],
    queryFn: ({ signal }) => api('/quick-pays/mine', quickPayRefListSchema, { signal }),
    select: (d) => d.items,
    staleTime: REF_STALE,
  });

export const useCostCenters = () =>
  useQuery({
    queryKey: ['ref', 'coa', 'COST_CENTER'],
    queryFn: ({ signal }) => api('/ref/coa?segment=COST_CENTER', coaValueListSchema, { signal }),
    select: (d) => d.items,
    staleTime: REF_STALE,
  });

// ─── Expenses ───────────────────────────────────────────────────────────────

export const useUnreportedExpenses = () =>
  useQuery({
    queryKey: expenseKeys.unreported,
    queryFn: ({ signal }) => api('/expenses?unreported=true', expenseListSchema, { signal }),
    select: (d) => d.items,
  });

export const useExpense = (id: number | null) =>
  useQuery({
    queryKey: expenseKeys.one(id ?? 0),
    queryFn: ({ signal }) => api(`/expenses/${id}`, expenseSchema, { signal }),
    enabled: id !== null,
  });

/** Live checklist (FR-POL-02): re-evaluates whenever the (debounced) input changes. */
export const useExpenseEvaluation = (input: ExpenseInput | null, expenseId: number | null) =>
  useQuery({
    queryKey: ['expenses', 'validate', input, expenseId],
    queryFn: ({ signal }) =>
      api('/expenses/validate', expenseEvaluationSchema, {
        method: 'POST',
        body: { ...input, expenseId },
        signal,
      }),
    enabled: input !== null,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

function useExpenseMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: expenseKeys.all }),
  });
}

export const useCreateExpense = () =>
  useExpenseMutation((body: ExpenseInput) =>
    api('/expenses', expenseSchema, { method: 'POST', body }),
  );

export const useUpdateExpense = () =>
  useExpenseMutation(({ id, body }: { id: number; body: ExpenseUpdate }) =>
    api(`/expenses/${id}`, expenseSchema, { method: 'PATCH', body }),
  );

export const useDeleteExpenses = () =>
  useExpenseMutation(async (ids: number[]) => {
    // One request per line; each is its own transaction on the server.
    for (const id of ids) await api(`/expenses/${id}`, z.null(), { method: 'DELETE' });
  });

export const useUploadReceipt = () =>
  useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append('file', file);
      return api('/receipts', receiptUploadResponseSchema, { method: 'POST', body });
    },
  });
