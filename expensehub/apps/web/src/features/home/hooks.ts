// API §11 dashboards.
import {
  approverDashboardSchema,
  employeeDashboardSchema,
  financeDashboardSchema,
} from '@expensehub/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export const useEmployeeDashboard = () =>
  useQuery({
    queryKey: ['dashboards', 'employee'],
    queryFn: ({ signal }) => api('/dashboards/employee', employeeDashboardSchema, { signal }),
  });

export const useApproverDashboard = (enabled: boolean) =>
  useQuery({
    queryKey: ['dashboards', 'approver'],
    queryFn: ({ signal }) => api('/dashboards/approver', approverDashboardSchema, { signal }),
    enabled,
    refetchInterval: 60_000,
  });

export const useFinanceDashboard = (enabled: boolean) =>
  useQuery({
    queryKey: ['dashboards', 'finance'],
    queryFn: ({ signal }) => api('/dashboards/finance', financeDashboardSchema, { signal }),
    enabled,
    refetchInterval: 60_000,
  });
