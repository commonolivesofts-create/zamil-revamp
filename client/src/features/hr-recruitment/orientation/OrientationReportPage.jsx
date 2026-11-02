import { useSearchParams } from "react-router";
import { COMMON_TEXT, ORIENTATION_TEXT as T } from "../hrRecruitmentText.js";
import { hrRecruitmentServices } from "../hrRecruitmentService.js";
import { enDate } from "../shared/hrFormat.js";
import { Pill } from "../shared/components/RecruitmentShell.jsx";
import { RecruitmentReport } from "../shared/components/RecruitmentReport.jsx";
import { ORIENTATION_FLAGS, ORIENTATION_LEGACY_STATUSES, orientationStatus, statusTone } from "./orientationLegacy.js";

const BASE = "/hr/recruitment/orientation";
const R = T.report;
const C = T.reportColumns;
const CREATE = Object.freeze({ permission: "HR.ORIENTATION_TRAININGS:CREATE", path: BASE, tool: R.tool, label: R.newSchedule });
const date = (value) => (value ? enDate(value) : COMMON_TEXT.dash);
// The legacy report columns (nht_list.php).
const COLUMNS = [
  { key: "reference", label: R.reference, sort: "HEADER_ID", render: (row) => row.scheduleNumber },
  { key: "empNo", label: C.empNo, render: (row) => row.employeeNumber || COMMON_TEXT.dash },
  { key: "employee", label: C.employee, sort: "EMPLOYEE_NAME", render: (row) => <b>{row.employeeName || COMMON_TEXT.dash}</b> },
  { key: "division", label: C.division, render: (row) => row.divisionName || COMMON_TEXT.dash },
  { key: "section", label: C.section, render: (row) => row.section || COMMON_TEXT.dash },
  { key: "from", label: C.from, sort: "ORIENTATION_DURATION_FROM", render: (row) => date(row.fromDate) },
  { key: "to", label: C.to, render: (row) => date(row.toDate) },
  { key: "startDate", label: C.startDate, render: (row) => date(row.startDate) },
  { key: "scheduledBy", label: C.scheduledBy, render: (row) => row.scheduledBy || COMMON_TEXT.dash },
  { key: "pendingAt", label: C.pendingAt, render: (row) => row.pendingAt || COMMON_TEXT.dash },
  { key: "workflowStart", label: C.workflowStart, render: (row) => date(row.workflowStart) },
  { key: "workflowEnd", label: C.workflowEnd, render: (row) => date(row.workflowEnd) },
  { key: "lastAction", label: C.lastAction, render: (row) => row.lastAction || COMMON_TEXT.dash },
  { key: "status", label: R.status, render: (row) => <Pill tone={statusTone(row.status)}>{T.status[orientationStatus(row.status)]}</Pill> },
];

// Orientation report: the legacy "Select type to view report" list, one table
// (Shared or Plant) at a time; filtered, sorted and paged by the server. The
// form opens it on the type of the schedule shown (?flag=Y|N).
export default function OrientationReportPage() {
  const [params] = useSearchParams();
  const flag = ORIENTATION_FLAGS.includes(params.get("flag")) ? params.get("flag") : "N";
  const filters = [
    { key: "status", label: R.status, type: "status", options: ORIENTATION_LEGACY_STATUSES.map((value) => ({ value, label: T.status[value] })) },
    { key: "flag", label: R.type, type: "select", initial: flag, options: ORIENTATION_FLAGS.map((value) => ({ value, label: R.flags[value] })) },
    { key: "search", label: R.search, type: "search" },
    { key: "dateFrom", label: R.from, type: "date" },
    { key: "dateTo", label: R.to, type: "date" },
  ];
  return (
    <RecruitmentReport key={flag} variant="orientation-report" title={R.title} subtitle={R.subtitle} create={CREATE}
      list={hrRecruitmentServices.orientations.list} heading={R.heading} resourceKey="hr-orientation-report" filters={filters} columns={COLUMNS}
      defaultSort={{ key: "HEADER_ID", order: "desc" }} numberOf={(row) => row.scheduleNumber}
      pathOf={(row) => `${BASE}/${row.scheduleId}?flag=${row.flag}`} />
  );
}
