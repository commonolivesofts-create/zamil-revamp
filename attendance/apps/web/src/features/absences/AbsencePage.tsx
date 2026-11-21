// Absence (CI3 /report/absence): leave records from XX_DIGI_EMP_ABSENCE_TYPE. Opens on the
// current payroll period, as the CI3 page pre-filled its leave date range.
import {
  absencePageSchema,
  APPROVAL_STATUSES,
  payrollPeriodEndingThisMonth,
  type AbsenceFilters,
  type AbsenceRow,
} from '@attendance/shared';
import { Badge } from '../../components/Badge';
import { ReportPage } from '../../components/report/ReportPage';
import type { ReportConfig } from '../../components/report/types';
import { display } from '../../lib/format';
import { statusTone } from './absenceStatus';

type Filters = Required<{ [K in keyof AbsenceFilters]: string | undefined }>;

const config: ReportConfig<Filters, AbsenceRow> = {
  id: 'absences',
  endpoint: '/absences',
  pageSchema: absencePageSchema,
  breadcrumb: ['Attendance', 'Reports', 'Absence'],
  title: 'Absence Details',
  subtitle: 'Leave and absence records, from the 21st of last month to the 20th of this month.',
  heading: 'All absence records',
  filters: [
    { key: 'empName', label: 'Employee', type: 'text', placeholder: 'Employee name' },
    { key: 'empNo', label: 'Emp No', type: 'text', placeholder: 'Employee number' },
    { key: 'departmentName', label: 'Department', type: 'text', placeholder: 'Department name' },
    { key: 'position', label: 'Position', type: 'text', placeholder: 'Position' },
    { key: 'leaveType', label: 'Leave type', type: 'text', placeholder: 'Leave type' },
    {
      key: 'approvalStatus',
      label: 'Approval status',
      type: 'select',
      options: APPROVAL_STATUSES.map((status) => ({ value: status, label: status })),
    },
    { key: 'leaveFrom', label: 'Leave from', type: 'date' },
    { key: 'leaveTo', label: 'Leave to', type: 'date' },
  ],
  initialFilters: () => {
    const period = payrollPeriodEndingThisMonth(new Date());
    return {
      empNo: '',
      empName: '',
      departmentName: '',
      position: '',
      leaveType: '',
      approvalStatus: '',
      totalDays: '',
      leaveFrom: period.from,
      leaveTo: period.to,
    };
  },
  columns: [
    { key: 'empNo', label: 'Emp No', render: (row) => display(row.empNo) },
    { key: 'departmentName', label: 'Department', render: (row) => display(row.departmentName) },
    { key: 'empName', label: 'Employee Name', render: (row) => display(row.empName) },
    { key: 'position', label: 'Position', render: (row) => display(row.position) },
    {
      key: 'leaveStartDate',
      label: 'Leave Start Date',
      render: (row) => display(row.leaveStartDate),
    },
    { key: 'leaveEndDate', label: 'Leave End Date', render: (row) => display(row.leaveEndDate) },
    { key: 'totalDays', label: 'Total Days', render: (row) => display(row.totalDays) },
    { key: 'leaveType', label: 'Leave Type', render: (row) => display(row.leaveType) },
    {
      key: 'approvalStatus',
      label: 'Approval Status',
      render: (row) => (
        <Badge tone={statusTone(row.approvalStatus)}>{display(row.approvalStatus)}</Badge>
      ),
    },
  ],
  rowKey: (row, index) =>
    `${row.empNo ?? ''}-${row.leaveStartDate ?? ''}-${row.leaveEndDate ?? ''}-${index}`,
  emptyMessage: 'No absence records match the selected filters.',
};

export default function AbsencePage() {
  return <ReportPage config={config} />;
}
