// Process Attendance (CI3 mdl-generate-attendance): department, employee and date range; builds
// the timesheet rows. Same choices, defaults (21st of last month to the 20th of this month),
// checks and summary as CI3, in the Zamil dialog design.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ALL,
  departmentListSchema,
  payrollPeriodEndingThisMonth,
  processEmployeeListSchema,
  processRequestSchema,
  processResultSchema,
  type ProcessSummary,
} from '@attendance/shared';
import { FormDialog } from '../../components/form/FormDialog';
import type { FormField, Option } from '../../components/form/types';
import { useToast } from '../../components/toastContext';
import { api, ApiError } from '../../lib/api';

type Values = { department: string; employeeNumber: string; fromDate: string; toDate: string };

/** Lists that show processed attendance; refreshed after a run. */
export const PROCESSED_QUERY_KEYS = ['timesheet', 'payroll-file', 'alerts', 'dashboard'] as const;

function useDepartments() {
  return useQuery({
    queryKey: ['processing-departments'],
    queryFn: ({ signal }) => api('/processing/departments', departmentListSchema, { signal }),
    staleTime: 5 * 60_000,
  });
}

function useDepartmentEmployees(department: string) {
  return useQuery({
    queryKey: ['processing-employees', department],
    queryFn: ({ signal }) =>
      api(
        `/processing/employees?department=${encodeURIComponent(department)}`,
        processEmployeeListSchema,
        {
          signal,
        },
      ),
    enabled: department !== '' && department !== ALL,
    staleTime: 5 * 60_000,
  });
}

export function ProcessDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [department, setDepartment] = useState('');
  const [summary, setSummary] = useState<ProcessSummary | null>(null);
  const departments = useDepartments();
  const employees = useDepartmentEmployees(department);
  const period = payrollPeriodEndingThisMonth(new Date());

  const departmentOptions: Option[] = [
    { value: ALL, label: ALL },
    ...(departments.data?.departments ?? []).map((d) => ({ value: d, label: d })),
  ];
  const employeeOptions: Option[] =
    department === ALL
      ? [{ value: ALL, label: ALL }]
      : department === '' || !employees.data
        ? []
        : [
            { value: ALL, label: ALL },
            ...employees.data.employees.map((e) => ({
              value: e.employeeNumber,
              label: `${e.employeeNumber} - ${e.fullName ?? ''}`,
            })),
          ];

  const fields: FormField<Values>[] = [
    {
      name: 'department',
      label: 'Department',
      type: 'select',
      placeholder: departments.isPending ? 'Loading Departments...' : 'Select Department',
      options: departmentOptions,
      wide: true,
    },
    {
      name: 'employeeNumber',
      label: 'Employee',
      type: 'select',
      placeholder: employees.isFetching ? 'Loading Employees...' : 'Select Employee',
      options: employeeOptions,
      readOnly: department === '' || department === ALL || employees.isFetching,
      hint: employees.isError ? 'Unable to load employee list.' : undefined,
      wide: true,
    },
    { name: 'fromDate', label: 'From Date', type: 'date' },
    { name: 'toDate', label: 'To Date', type: 'date' },
  ];

  const submit = async (values: Values) => {
    setSummary(null);
    try {
      const result = await api('/processing/run', processResultSchema, {
        method: 'POST',
        body: processRequestSchema.parse(values),
      });
      setSummary(result.summary);
      toast.success(result.message);
      await Promise.all(
        PROCESSED_QUERY_KEYS.map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
      );
    } catch (error) {
      // CI3 said only "Attendance process failed."; the reason is shown with it.
      const reason =
        (error instanceof ApiError && (error.details as { error?: unknown } | undefined)?.error) ||
        null;
      if (error instanceof ApiError && typeof reason === 'string') {
        throw new ApiError(error.code, error.status, `${error.message} ${reason}`, error.details);
      }
      throw error;
    }
  };

  return (
    <FormDialog<Values>
      title="Process Attendance"
      description="Choose department, employee and date range."
      fields={fields}
      initial={{ department: '', employeeNumber: '', fromDate: period.from, toDate: period.to }}
      schema={processRequestSchema}
      submitLabel="Process Attendance"
      pendingLabel="Processing..."
      onSubmit={submit}
      onClose={onClose}
      onFieldChange={(name, values, set) => {
        if (name !== 'department') return;
        setDepartment(values.department);
        set({ employeeNumber: values.department === ALL ? ALL : '' });
      }}
    >
      {summary && (
        <div className="zat-process-result" role="status">
          <p className="zat-process-result__title">Attendance process completed.</p>
          <dl className="zat-facts zat-facts--compact">
            <Fact label="Employees" value={summary.totalEmployees} />
            <Fact label="Processed Rows" value={summary.processedRows} />
            <Fact label="Inserted Rows" value={summary.insertedRows} />
            <Fact label="Updated Rows" value={summary.updatedRows} />
            {summary.errorRows > 0 && <Fact label="Error Rows" value={summary.errorRows} />}
          </dl>
        </div>
      )}
    </FormDialog>
  );
}

function Fact({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value.toLocaleString()}</dd>
    </div>
  );
}
