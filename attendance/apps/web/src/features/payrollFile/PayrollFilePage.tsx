// Payroll File (CI3 /report/payroll-file): one line per employee for the date range, with manual
// adjustments. Opens on the 21st of last month to the 20th of this month; Reset clears the filters.
import { useState } from 'react';
import {
  mutationResultSchema,
  payrollAdjustmentSchema,
  payrollFilePageSchema,
  payrollPeriodEndingThisMonth,
  phpRound,
  type PayrollFileFilters,
  type PayrollFileRow,
} from '@attendance/shared';
import { FormDialog } from '../../components/form/FormDialog';
import type { FormField } from '../../components/form/types';
import { ReportPage } from '../../components/report/ReportPage';
import type { ReportConfig } from '../../components/report/types';
import { RowActions } from '../../components/RowActions';
import { useToast } from '../../components/toastContext';
import { api } from '../../lib/api';
import { display } from '../../lib/format';
import { useSave } from '../../lib/useSave';

type Filters = Required<{ [K in keyof PayrollFileFilters]: string | undefined }>;
type Values = {
  empNo: string;
  empName: string;
  fromDate: string;
  toDate: string;
  late: string;
  early: string;
  totDelay: string;
  overtimeHrs: string;
  absenceWo: string;
};

const NO_FILTERS: Filters = { empNo: '', empName: '', fromDate: '', toDate: '' };

/** CI3 showed overtime with JavaScript toFixed(2). */
const hours = (value: string | null) => Number(value).toFixed(2);

/**
 * Fixed: CI3 pre-filled the raw Oracle text (".5", "4.2133…"), which its own validation and the
 * 0.01 step then rejected. Values are pre-filled as numbers with at most 2 decimals.
 */
const amount = (value: string | null) => {
  const n = Number(value);
  return Number.isFinite(n) ? String(phpRound(n, 2)) : '0';
};
const totalDelay = (late: string, early: string) =>
  ((parseFloat(late) || 0) + (parseFloat(early) || 0)).toFixed(2);

const FIELDS: FormField<Values>[] = [
  { name: 'empName', label: 'Employee Name', type: 'text', readOnly: true, wide: true },
  { name: 'late', label: 'Late', type: 'number' },
  { name: 'early', label: 'Early', type: 'number' },
  { name: 'totDelay', label: 'Total Delay', type: 'number', readOnly: true },
  { name: 'overtimeHrs', label: 'Overtime Hours', type: 'number' },
  { name: 'absenceWo', label: 'Absence WO', type: 'number' },
];

export default function PayrollFilePage() {
  const toast = useToast();
  const save = useSave(['payroll-file']);
  const [editing, setEditing] = useState<Values | null>(null);

  const edit = (row: PayrollFileRow, filters: Filters) => {
    if (!filters.fromDate || !filters.toDate) {
      toast.error('From Date and To Date are required before editing payroll file.');
      return;
    }
    setEditing({
      empNo: row.empNo ?? '',
      empName: row.empName ?? '',
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      late: amount(row.late),
      early: amount(row.early),
      totDelay: amount(row.totDelay),
      overtimeHrs: amount(row.overtimeHrs),
      absenceWo: amount(row.absenceWo),
    });
  };

  const config: ReportConfig<Filters, PayrollFileRow> = {
    id: 'payroll-file',
    endpoint: '/payroll-file',
    pageSchema: payrollFilePageSchema,
    pageSize: 30,
    breadcrumb: ['Attendance', 'Reports', 'Payroll File'],
    title: 'Payroll File',
    subtitle:
      'Late, early, overtime and absence per employee for the payroll period, with adjustments.',
    heading: 'All payroll file records',
    filters: [
      { key: 'empNo', label: 'Employee Number', type: 'text', placeholder: 'Employee Number' },
      { key: 'empName', label: 'Employee Name', type: 'text', placeholder: 'Employee Name' },
      { key: 'fromDate', label: 'From Date', type: 'date' },
      { key: 'toDate', label: 'To Date', type: 'date' },
    ],
    initialFilters: () => {
      const period = payrollPeriodEndingThisMonth(new Date());
      return { ...NO_FILTERS, fromDate: period.from, toDate: period.to };
    },
    resetFilters: () => ({ ...NO_FILTERS }),
    columns: (filters) => [
      { key: 'empNo', label: 'Emp No', render: (r) => display(r.empNo) },
      { key: 'empName', label: 'Emp Name', render: (r) => display(r.empName) },
      { key: 'late', label: 'Late', render: (r) => display(r.late) },
      { key: 'early', label: 'Early', render: (r) => display(r.early) },
      { key: 'totDelay', label: 'TOT_DELAY', render: (r) => display(r.totDelay) },
      { key: 'overtimeHrs', label: 'Overtime hrs', render: (r) => hours(r.overtimeHrs) },
      { key: 'absenceWo', label: 'Absence WO', render: (r) => display(r.absenceWo) },
      {
        key: 'action',
        label: 'Action',
        render: (r) => (
          <RowActions
            label={`payroll file of ${r.empName ?? r.empNo ?? 'employee'}`}
            onEdit={() => edit(r, filters)}
          />
        ),
      },
    ],
    rowKey: (r, index) => `${r.empNo ?? ''}-${r.empName ?? ''}-${index}`,
    emptyMessage: 'No payroll file data available.',
  };

  return (
    <>
      <ReportPage config={config} />
      {editing && (
        <FormDialog<Values>
          title="Edit Payroll File"
          description={`${editing.empNo} · ${editing.fromDate} to ${editing.toDate}`}
          fields={FIELDS}
          initial={editing}
          schema={payrollAdjustmentSchema}
          submitLabel="Save"
          onSubmit={async (values) => {
            await save(() =>
              api('/payroll-file/adjustment', mutationResultSchema, {
                method: 'POST',
                body: values,
              }),
            );
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
          onFieldChange={(name, values, set) => {
            if (name === 'late' || name === 'early')
              set({ totDelay: totalDelay(values.late, values.early) });
          }}
        />
      )}
    </>
  );
}
