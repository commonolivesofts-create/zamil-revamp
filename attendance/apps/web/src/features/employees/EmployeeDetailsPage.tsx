// Employee Details (CI3 /report/employee-details): current employees from XX_DIGI_EMP_MASTER.
import { employeePageSchema, type EmployeeFilters, type EmployeeRow } from '@attendance/shared';
import { ReportPage } from '../../components/report/ReportPage';
import type { ReportConfig } from '../../components/report/types';
import { display, formatIsoDate } from '../../lib/format';

type Filters = Required<{ [K in keyof EmployeeFilters]: string | undefined }>;

const config: ReportConfig<Filters, EmployeeRow> = {
  id: 'employees',
  endpoint: '/employees',
  pageSchema: employeePageSchema,
  breadcrumb: ['Attendance', 'Reports', 'Employee Details'],
  title: 'Employee Details',
  subtitle: 'All current employee records from the employee master.',
  heading: 'All employee records',
  filters: [
    { key: 'fullName', label: 'Employee', type: 'text', placeholder: 'Employee name' },
    { key: 'employeeNumber', label: 'Emp No', type: 'text', placeholder: 'Employee number' },
    { key: 'email', label: 'Email', type: 'text', placeholder: 'Email' },
    { key: 'jobTitle', label: 'Job title', type: 'text', placeholder: 'Job title' },
    { key: 'department', label: 'Department', type: 'text', placeholder: 'Department' },
    { key: 'joiningDate', label: 'Joining date', type: 'date' },
  ],
  initialFilters: () => ({
    fullName: '',
    userId: '',
    employeeNumber: '',
    email: '',
    jobTitle: '',
    department: '',
    joiningDate: '',
  }),
  columns: [
    { key: 'employeeNumber', label: 'Emp No', render: (row) => display(row.employeeNumber) },
    { key: 'fullName', label: 'Employee Name', render: (row) => display(row.fullName) },
    { key: 'email', label: 'Email', render: (row) => display(row.email) },
    { key: 'jobTitle', label: 'Job Title', render: (row) => display(row.jobTitle) },
    { key: 'department', label: 'Department', render: (row) => display(row.department) },
    { key: 'joiningDate', label: 'Joining Date', render: (row) => formatIsoDate(row.joiningDate) },
  ],
  rowKey: (row, index) => `${row.employeeNumber ?? ''}-${row.userId ?? index}`,
  searchPlaceholder: 'Search name, number, email, job or department',
  emptyMessage: 'No employees match the selected filters.',
};

export default function EmployeeDetailsPage() {
  return <ReportPage config={config} />;
}
