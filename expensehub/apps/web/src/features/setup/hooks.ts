// API §10 setup client hooks. Every mutation refreshes its list and the setup history.
import {
  approvalRuleListSchema,
  approvalRuleSchema,
  auditRuleListSchema,
  auditRuleSchema,
  coaValueListSchema,
  employeeRefListSchema,
  expenseTypeListSchema,
  expenseTypeSchema,
  roleAssignmentListSchema,
  roleAssignmentSchema,
  setupHistoryListSchema,
  systemOptionListSchema,
  systemOptionSchema,
  type ApprovalRuleCreate,
  type ApprovalRuleUpdate,
  type AuditRuleCode,
  type ExpenseTypeCreate,
  type ExpenseTypeUpdate,
  type RoleAssignmentCreate,
  type SetupTable,
} from '@expensehub/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

export const setupKeys = {
  expenseTypes: ['setup', 'expense-types'] as const,
  options: ['setup', 'options'] as const,
  approvalRules: ['setup', 'approval-rules'] as const,
  auditRules: ['setup', 'audit-rules'] as const,
  roles: ['setup', 'roles'] as const,
  history: (table?: SetupTable) => ['setup', 'history', table ?? 'all'] as const,
};

function useSetupMutation<TVars, TResult>(
  fn: (vars: TVars) => Promise<TResult>,
  invalidate: readonly unknown[],
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: invalidate }),
        queryClient.invalidateQueries({ queryKey: ['setup', 'history'] }),
        // A role change can change what the signed-in user may do.
        queryClient.invalidateQueries({ queryKey: ['me'] }),
      ]);
    },
  });
}

// ─── Expense types ──────────────────────────────────────────────────────────

export const useExpenseTypes = () =>
  useQuery({
    queryKey: setupKeys.expenseTypes,
    queryFn: ({ signal }) => api('/setup/expense-types', expenseTypeListSchema, { signal }),
  });

export const useCreateExpenseType = () =>
  useSetupMutation(
    (body: ExpenseTypeCreate) =>
      api('/setup/expense-types', expenseTypeSchema, { method: 'POST', body }),
    setupKeys.expenseTypes,
  );

export const useUpdateExpenseType = () =>
  useSetupMutation(
    ({ typeId, body }: { typeId: number; body: ExpenseTypeUpdate }) =>
      api(`/setup/expense-types/${typeId}`, expenseTypeSchema, { method: 'PATCH', body }),
    setupKeys.expenseTypes,
  );

/** Enabled natural accounts for the expense-type form. */
export const useAccounts = () =>
  useQuery({
    queryKey: ['ref', 'coa', 'ACCOUNT'],
    queryFn: ({ signal }) => api('/ref/coa?segment=ACCOUNT', coaValueListSchema, { signal }),
    staleTime: 5 * 60_000,
  });

// ─── Options ────────────────────────────────────────────────────────────────

export const useOptions = () =>
  useQuery({
    queryKey: setupKeys.options,
    queryFn: ({ signal }) => api('/setup/options', systemOptionListSchema, { signal }),
  });

export const useUpdateOption = () =>
  useSetupMutation(
    ({
      key,
      bu,
      optionValue,
      version,
    }: {
      key: string;
      bu: string;
      optionValue: string;
      version: number;
    }) =>
      api(
        `/setup/options/${encodeURIComponent(key)}/${encodeURIComponent(bu)}`,
        systemOptionSchema,
        {
          method: 'PATCH',
          body: { optionValue, version },
        },
      ),
    setupKeys.options,
  );

// ─── Approval rules ─────────────────────────────────────────────────────────

export const useApprovalRules = () =>
  useQuery({
    queryKey: setupKeys.approvalRules,
    queryFn: ({ signal }) => api('/setup/approval-rules', approvalRuleListSchema, { signal }),
  });

export const useCreateApprovalRule = () =>
  useSetupMutation(
    (body: ApprovalRuleCreate) =>
      api('/setup/approval-rules', approvalRuleSchema, { method: 'POST', body }),
    setupKeys.approvalRules,
  );

export const useUpdateApprovalRule = () =>
  useSetupMutation(
    ({ ruleId, body }: { ruleId: number; body: ApprovalRuleUpdate }) =>
      api(`/setup/approval-rules/${ruleId}`, approvalRuleSchema, { method: 'PATCH', body }),
    setupKeys.approvalRules,
  );

// ─── Audit rules ────────────────────────────────────────────────────────────

export const useAuditRules = () =>
  useQuery({
    queryKey: setupKeys.auditRules,
    queryFn: ({ signal }) => api('/setup/audit-rules', auditRuleListSchema, { signal }),
  });

export const useUpdateAuditRule = () =>
  useSetupMutation(
    ({
      code,
      body,
    }: {
      code: AuditRuleCode;
      body: { paramNumber: number | null; active: boolean; version: number };
    }) => api(`/setup/audit-rules/${code}`, auditRuleSchema, { method: 'PATCH', body }),
    setupKeys.auditRules,
  );

// ─── Role assignments ───────────────────────────────────────────────────────

export const useRoleAssignments = () =>
  useQuery({
    queryKey: setupKeys.roles,
    queryFn: ({ signal }) => api('/setup/role-assignments', roleAssignmentListSchema, { signal }),
  });

export const useAssignRole = () =>
  useSetupMutation(
    (body: RoleAssignmentCreate) =>
      api('/setup/role-assignments', roleAssignmentSchema, { method: 'POST', body }),
    setupKeys.roles,
  );

export const useEndRole = () =>
  useSetupMutation(
    (assignmentId: number) =>
      api(`/setup/role-assignments/${assignmentId}`, roleAssignmentSchema, { method: 'DELETE' }),
    setupKeys.roles,
  );

export const useEmployeeSearch = (q: string) =>
  useQuery({
    queryKey: ['ref', 'employees', q],
    queryFn: ({ signal }) =>
      api(`/ref/employees?q=${encodeURIComponent(q)}&limit=8`, employeeRefListSchema, { signal }),
    placeholderData: (previous) => previous,
  });

// ─── History ────────────────────────────────────────────────────────────────

export const useSetupHistory = (table?: SetupTable) =>
  useQuery({
    queryKey: setupKeys.history(table),
    queryFn: ({ signal }) =>
      api(
        `/admin/setup-history?limit=200${table ? `&table=${table}` : ''}`,
        setupHistoryListSchema,
        {
          signal,
        },
      ),
  });
