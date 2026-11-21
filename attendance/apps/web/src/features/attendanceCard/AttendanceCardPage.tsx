// Attendance Card (CI3 /report/attendance-card): the raw daily punches per employee.
import { useState } from 'react';
import {
  can,
  attendanceCardPageSchema,
  type AttendanceCardFilters,
  type AttendanceCardRow,
} from '@attendance/shared';
import { useMe } from '../../app/session';
import { OrvexaIcon } from '../../components/OrvexaIcon';
import { ReportPage } from '../../components/report/ReportPage';
import type { ReportConfig } from '../../components/report/types';
import { display, formatIsoDate } from '../../lib/format';
import { UploadDialog } from './UploadDialog';

type Filters = Required<{ [K in keyof AttendanceCardFilters]: string | undefined }>;

export default function AttendanceCardPage() {
  const canImport = can(useMe().roles, 'attendance:import');
  const [uploading, setUploading] = useState(false);

  const config: ReportConfig<Filters, AttendanceCardRow> = {
    id: 'attendance-card',
    endpoint: '/attendance-card',
    pageSchema: attendanceCardPageSchema,
    pageSize: 30,
    breadcrumb: ['Attendance', 'Reports', 'Attendance Card'],
    title: 'Attendance Card',
    subtitle: 'First and last punch per employee per day, as loaded from the attendance devices.',
    heading: 'All attendance card records',
    filters: [
      { key: 'empNo', label: 'Employee number', type: 'text', placeholder: 'Employee number' },
      { key: 'empName', label: 'Employee name', type: 'text', placeholder: 'Employee name' },
      { key: 'attDate', label: 'Attendance date', type: 'date' },
    ],
    initialFilters: () => ({ empNo: '', empName: '', attDate: '' }),
    columns: [
      { key: 'empNo', label: 'Employee Number', render: (row) => display(row.empNo) },
      { key: 'empName', label: 'Employee Name', render: (row) => display(row.empName) },
      { key: 'attDate', label: 'Attendance Date', render: (row) => formatIsoDate(row.attDate) },
      { key: 'punchIn', label: 'Punch In', render: (row) => display(row.punchIn) },
      { key: 'punchOut', label: 'Punch Out', render: (row) => display(row.punchOut) },
    ],
    rowKey: (row, index) => `${row.empNo ?? ''}-${row.attDate ?? index}`,
    searchPlaceholder: 'Search employee number, name or date',
    emptyMessage: 'No attendance card data available.',
    headerActions: canImport && (
      <button
        type="button"
        className="zrv-ir-btn zrv-ir-btn--primary"
        onClick={() => setUploading(true)}
      >
        <OrvexaIcon name="upload" size={16} />
        Upload File
      </button>
    ),
  };

  return (
    <>
      <ReportPage config={config} />
      {uploading && <UploadDialog onClose={() => setUploading(false)} />}
    </>
  );
}
