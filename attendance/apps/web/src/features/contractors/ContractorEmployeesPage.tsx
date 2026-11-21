// Contractor Employees (CI3 /contractor/employees): contractor workers in EBS with add / edit / delete,
// filters and search. Needs the Zamil VPN or office network.
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  CONTRACTOR_DEPARTMENTS,
  CONTRACTOR_DIVISIONS,
  CONTRACTOR_STATUSES,
  conEmployeeInputSchema,
  conEmployeeOptionsSchema,
  conEmployeePageSchema,
  mutationResultSchema,
  type ConEmployeeFilters,
  type ConEmployeeOptions,
  type ConEmployeeRow,
} from '@attendance/shared';
import { ConfirmDialog } from '../../components/form/ConfirmDialog';
import { FormDialog } from '../../components/form/FormDialog';
import type { FormField } from '../../components/form/types';
import { OrvexaIcon } from '../../components/OrvexaIcon';
import { ReportPage } from '../../components/report/ReportPage';
import type { ReportConfig } from '../../components/report/types';
import { RowActions } from '../../components/RowActions';
import { StatusBadge } from '../../components/StatusBadges';
import { api } from '../../lib/api';
import { display, formatIsoDate } from '../../lib/format';
import { useSave } from '../../lib/useSave';
import { CONTRACTOR_KEYS } from './contractorKeys';

type Filters = Required<{ [K in keyof ConEmployeeFilters]: string | undefined }>;
type Values = {
  division: string;
  conNumber: string;
  conName: string;
  status: string;
  rate: string;
  employeeNumber: string;
  employeeName: string;
  iqamah: string;
  department: string;
  prodDep: string;
  job: string;
  jobTitle: string;
  directBossId: string;
  directBoss: string;
  place: string;
  replacement: string;
  startDate: string;
  endDate: string;
  flags: string[];
  ajeer: string;
  sfda: string;
  blacklist: string;
  remark: string;
};

const STATUS_OPTIONS = CONTRACTOR_STATUSES.map((value) => ({ value, label: value }));
const FLAG_OPTIONS = [
  { value: 'ajeer', label: 'Ajeer' },
  { value: 'sfda', label: 'Sfda' },
  { value: 'blacklist', label: 'Blacklist' },
];

const EMPTY: Values = {
  division: 'IBM',
  conNumber: '',
  conName: '',
  status: '',
  rate: '',
  employeeNumber: '',
  employeeName: '',
  iqamah: '',
  department: '',
  prodDep: '',
  job: '',
  jobTitle: '',
  directBossId: '',
  directBoss: '',
  place: '',
  replacement: '',
  startDate: '',
  endDate: '',
  flags: [],
  ajeer: '',
  sfda: '',
  blacklist: '',
  remark: '',
};

const toValues = (r: ConEmployeeRow): Values => {
  const flags = FLAG_OPTIONS.map((f) => f.value).filter(
    (key) => r[key as 'ajeer' | 'sfda' | 'blacklist'] === 'on',
  );
  return {
    // Fixed: CI3 pre-filled the list's label ("IPP"), which matched no option, so every edit failed
    // with "The Division field is required."; the stored code is used.
    division: r.divisionCode ?? '',
    conNumber: r.conNumber ?? '',
    conName: r.conName ?? '',
    status: r.status ?? '',
    rate: r.rate ?? '',
    employeeNumber: r.employeeNumber ?? '',
    employeeName: r.employeeName ?? '',
    iqamah: r.iqamah ?? '',
    department: r.department ?? '',
    prodDep: r.prodDep ?? '',
    job: r.job ?? '',
    jobTitle: r.jobTitle ?? '',
    directBossId: r.directBossId ?? '',
    directBoss: r.directBoss ?? '',
    place: r.place ?? '',
    replacement: r.replacement ?? '',
    startDate: r.startDate ?? '',
    endDate: r.endDate ?? '',
    flags,
    ajeer: flags.includes('ajeer') ? 'on' : '',
    sfda: flags.includes('sfda') ? 'on' : '',
    blacklist: flags.includes('blacklist') ? 'on' : '',
    remark: r.remark ?? '',
  };
};

function formFields(options: ConEmployeeOptions | undefined): FormField<Values>[] {
  return [
    {
      name: 'division',
      label: 'Division',
      type: 'select',
      required: true,
      options: CONTRACTOR_DIVISIONS,
      placeholder: 'Select',
    },
    {
      name: 'conNumber',
      label: 'Contractor #',
      type: 'select',
      required: true,
      placeholder: 'Select',
      options: (options?.contractors ?? []).map((c) => ({
        value: c.conNumber,
        label: c.conNumber,
      })),
    },
    { name: 'conName', label: 'Contractor Name', type: 'text', readOnly: true },
    {
      name: 'status',
      label: 'Status',
      type: 'select',
      required: true,
      options: STATUS_OPTIONS,
      placeholder: 'Select',
    },
    { name: 'rate', label: 'Rate / Hour', type: 'number', placeholder: 'Enter rate per hour' },
    {
      name: 'employeeNumber',
      label: 'Employee #',
      type: 'text',
      readOnly: true,
      placeholder: 'Assigned automatically',
    },
    {
      name: 'employeeName',
      label: 'Employee Name',
      type: 'text',
      required: true,
      maxLength: 200,
      placeholder: 'Enter employee name',
    },
    { name: 'iqamah', label: 'Iqamah', type: 'number', placeholder: 'Enter Iqamah #' },
    {
      name: 'department',
      label: 'Department',
      type: 'select',
      placeholder: 'Select',
      options: CONTRACTOR_DEPARTMENTS.map((value) => ({ value, label: value })),
    },
    {
      name: 'prodDep',
      label: 'Production',
      type: 'select',
      placeholder: 'Select',
      options: options?.productionDepartments ?? [],
    },
    {
      name: 'job',
      label: 'Job Title',
      type: 'select',
      placeholder: 'Select',
      options: options?.jobs ?? [],
    },
    {
      name: 'directBossId',
      label: 'Direct Boss',
      type: 'select',
      placeholder: 'Select',
      options: (options?.bosses ?? []).map((b) => ({
        value: b.value,
        label: `${b.label} (${b.value})`,
      })),
    },
    { name: 'place', label: 'Place of Work', type: 'text', placeholder: 'Enter place of work' },
    {
      name: 'replacement',
      label: 'Replacement #',
      type: 'number',
      placeholder: 'Enter replacement #',
    },
    { name: 'startDate', label: 'Start Date', type: 'date', required: true },
    { name: 'endDate', label: 'End Date', type: 'date' },
    { name: 'flags', label: 'Flags', type: 'multiselect', options: FLAG_OPTIONS, wide: true },
    { name: 'remark', label: 'Remark', type: 'textarea', wide: true, placeholder: 'Enter remark' },
  ];
}

export default function ContractorEmployeesPage() {
  const save = useSave(['contractor-employees']);
  const [editing, setEditing] = useState<ConEmployeeRow | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ConEmployeeRow | null>(null);
  const options = useQuery({
    queryKey: [CONTRACTOR_KEYS[2]],
    queryFn: ({ signal }) =>
      api('/contractor-employees/options', conEmployeeOptionsSchema, { signal }),
    staleTime: 5 * 60_000,
  });

  const config: ReportConfig<Filters, ConEmployeeRow> = {
    id: 'contractor-employees',
    endpoint: '/contractor-employees',
    pageSchema: conEmployeePageSchema,
    pageSize: 30,
    breadcrumb: ['Attendance', 'Contractors', 'Contractor Employees'],
    title: 'Contractor Employees',
    subtitle: 'Workers supplied by contractors: division, department, contract dates and status.',
    heading: 'All contractor employee records',
    searchPlaceholder: 'Search employee, contractor, dept...',
    filters: [
      {
        key: 'division',
        label: 'Division',
        type: 'select',
        placeholder: 'All Divisions',
        options: CONTRACTOR_DIVISIONS,
      },
      {
        key: 'department',
        label: 'Department',
        type: 'select',
        placeholder: 'All Departments',
        options: (options.data?.departments ?? []).map((value) => ({ value, label: value })),
      },
      { key: 'conNumber', label: 'Contractor Number', type: 'text', placeholder: 'Contractor #' },
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        placeholder: 'All Statuses',
        options: STATUS_OPTIONS,
      },
      { key: 'startDate', label: 'From Start Date', type: 'date' },
      { key: 'endDate', label: 'To End Date', type: 'date' },
    ],
    initialFilters: () => ({
      division: '',
      department: '',
      conNumber: '',
      status: '',
      startDate: '',
      endDate: '',
    }),
    columns: [
      { key: 'employeeNumber', label: 'Employee #', render: (r) => display(r.employeeNumber) },
      { key: 'division', label: 'Division', render: (r) => display(r.division) },
      { key: 'department', label: 'Department', render: (r) => display(r.department) },
      { key: 'conName', label: 'Contractor Name', render: (r) => display(r.conName) },
      { key: 'conNumber', label: 'Contractor #', render: (r) => display(r.conNumber) },
      { key: 'employeeName', label: 'Employee Name', render: (r) => display(r.employeeName) },
      { key: 'startDate', label: 'Start Date', render: (r) => formatIsoDate(r.startDate) },
      { key: 'endDate', label: 'End Date', render: (r) => formatIsoDate(r.endDate) },
      { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      {
        key: 'actions',
        label: 'Action',
        render: (r) => (
          <RowActions
            label={`employee ${r.employeeName ?? r.employeeNumber ?? ''}`}
            onEdit={() => setEditing(r)}
            onDelete={() => setDeleting(r)}
          />
        ),
      },
    ],
    rowKey: (r) => String(r.id),
    emptyMessage: 'No employee data available.',
    headerActions: (
      <button
        type="button"
        className="zrv-ir-btn zrv-ir-btn--primary"
        onClick={() => setEditing('new')}
      >
        <OrvexaIcon name="plus" size={16} />
        Add Employee
      </button>
    ),
  };

  const isNew = editing === 'new';
  const contractors = options.data?.contractors ?? [];
  const jobs = options.data?.jobs ?? [];
  const bosses = options.data?.bosses ?? [];

  return (
    <>
      <ReportPage config={config} />
      {editing && (
        <FormDialog<Values>
          title={isNew ? 'Add Employee' : 'Update Employee'}
          fields={formFields(options.data)}
          initial={isNew ? EMPTY : toValues(editing)}
          schema={conEmployeeInputSchema}
          submitLabel={isNew ? 'Save Employee' : 'Update Employee'}
          onClose={() => setEditing(null)}
          onFieldChange={(name, values, set) => {
            if (name === 'conNumber')
              set({
                conName: contractors.find((c) => c.conNumber === values.conNumber)?.conName ?? '',
              });
            if (name === 'job')
              set({ jobTitle: jobs.find((j) => j.value === values.job)?.label ?? '' });
            if (name === 'directBossId')
              set({ directBoss: bosses.find((b) => b.value === values.directBossId)?.label ?? '' });
            if (name === 'flags')
              set({
                ajeer: values.flags.includes('ajeer') ? 'on' : '',
                sfda: values.flags.includes('sfda') ? 'on' : '',
                blacklist: values.flags.includes('blacklist') ? 'on' : '',
              });
          }}
          onSubmit={async (values) => {
            const { flags: _flags, ...body } = values;
            await save(() =>
              isNew
                ? api('/contractor-employees', mutationResultSchema, { method: 'POST', body })
                : api(`/contractor-employees/${editing.id}`, mutationResultSchema, {
                    method: 'PUT',
                    body,
                  }),
            );
            setEditing(null);
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete Employee?"
          description={`Are you sure you want to delete "${deleting.employeeName || deleting.employeeNumber || 'this employee'}"?`}
          confirmLabel="Yes, delete"
          danger
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await save(() =>
              api(`/contractor-employees/${deleting.id}`, mutationResultSchema, {
                method: 'DELETE',
              }),
            );
            setDeleting(null);
          }}
        />
      )}
    </>
  );
}
