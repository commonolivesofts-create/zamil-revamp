import { COMMON_TEXT, REQUISITION_TEXT as T } from "../hrRecruitmentText.js";
import { hrRecruitmentServices } from "../hrRecruitmentService.js";
import { HR_RECRUITMENT_ACTIONS as ACTIONS } from "../hrRecruitmentActions.js";
import { enDate } from "../shared/hrFormat.js";
import { Pill } from "../shared/components/RecruitmentShell.jsx";
import { RecruitmentReport } from "../shared/components/RecruitmentReport.jsx";

const BASE = "/hr/recruitment/requisition";
const R = T.report;
const STATUS_TONE = Object.freeze({ Draft: "warn", Inprocess: "warn", Approved: "ok", Rejected: "bad" });
const options = (labels) => Object.entries(labels).map(([value, label]) => ({ value, label }));
const CREATE = Object.freeze({ permission: ACTIONS.REQUISITION_CREATE, path: BASE, tool: R.tool, label: R.newRequisition });
const FILTERS = [
  { key: "requisitionStatus", label: R.columns.status, type: "status", options: ["Draft", "Inprocess", "Approved", "Rejected"].map((value) => ({ value, label: T.status[value] })) },
  { key: "search", label: R.filters.search, type: "search" },
  { key: "ticketStatus", label: R.filters.ticketStatus, type: "select", options: options(R.ticketStatus) },
  { key: "reasonOfReq", label: R.filters.reason, type: "select", options: options(R.reasons) },
  { key: "dateFrom", label: R.filters.from, type: "date" },
  { key: "dateTo", label: R.filters.to, type: "date" },
];
const COLUMNS = [
  { key: "number", label: R.columns.number, sort: "requisitionId", render: (row) => row.requisitionNumber || row.requisitionId },
  { key: "job", label: R.columns.job, render: (row) => <><b>{row.jobTitle || COMMON_TEXT.dash}</b><small className="zrv-hr-es-subline">{row.departmentName}</small></> },
  { key: "requester", label: R.columns.requester, sort: "requesterName", render: (row) => row.requesterName || COMMON_TEXT.dash },
  { key: "requestDate", label: R.columns.requestDate, sort: "requestDate", render: (row) => (row.requestDate ? enDate(row.requestDate) : COMMON_TEXT.dash) },
  { key: "neededDate", label: R.columns.neededDate, sort: "dateNeeded", render: (row) => (row.neededDate ? enDate(row.neededDate) : COMMON_TEXT.dash) },
  { key: "reason", label: R.columns.reason, render: (row) => R.reasons[row.reason] ?? (row.reason || COMMON_TEXT.dash) },
  { key: "ticketStatus", label: R.columns.ticketStatus, render: (row) => R.ticketStatus[row.ticketStatus] ?? (row.ticketStatus || COMMON_TEXT.dash) },
  { key: "status", label: R.columns.status, render: (row) => <Pill tone={STATUS_TONE[row.status] ?? "warn"}>{T.status[row.status] ?? row.status}</Pill> },
];

// Requisition report: the requisitions the user may see (HR every one, others
// their own and their team's), filtered, sorted and paged by the server; a
// requisition opens by its number.
export default function RequisitionReportPage() {
  return (
    <RecruitmentReport variant="requisition-report" title={R.title} subtitle={R.subtitle} create={CREATE}
      list={hrRecruitmentServices.requisitions.list} heading={R.heading} resourceKey="hr-requisition-report" filters={FILTERS} columns={COLUMNS}
      defaultSort={{ key: "requisitionId", order: "desc" }} numberOf={(row) => row.requisitionNumber || row.requisitionId}
      pathOf={(row) => `${BASE}/${row.requisitionId}`} />
  );
}
