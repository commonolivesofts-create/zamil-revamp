import OrvexaIcon from "@/components/icons/OrvexaIcon.jsx";
import { COMMON_TEXT, INSIGHT_TEXT, REQUISITION_TEXT as T } from "../hrRecruitmentText.js";
import { hrRecruitmentServices } from "../hrRecruitmentService.js";
import { HR_RECRUITMENT_ACTIONS as ACTIONS } from "../hrRecruitmentActions.js";
import { businessToday, enDate } from "../shared/hrFormat.js";
import { monthRanges } from "../shared/insightDates.js";
import { Pill } from "../shared/components/RecruitmentShell.jsx";
import { InsightReport } from "../shared/components/InsightReport.jsx";
import { Card, Columns, Delta, Distribution, Foot, Hero, Hint, Ring } from "../shared/components/InsightCards.jsx";
import { dueSignal } from "../shared/insightFormat.js";

const BASE = "/hr/recruitment/requisition";
const R = T.report;
const O = R.overview;
const MONTHS = 6;
const STATUS_TONE = Object.freeze({ Draft: "warn", Inprocess: "warn", Approved: "ok", Rejected: "bad" });
const STATUSES = Object.freeze([["Draft", "draft"], ["Inprocess", "progress"], ["Approved", "ok"], ["Rejected", "bad"]]);
const TICKETS = Object.keys(R.ticketStatus);
const REASONS = Object.keys(R.reasons);
const OPEN_STATUSES = new Set(["Draft", "Inprocess"]);
const statusLabel = (key) => T.status[key] ?? key;
const date = (value) => (value ? enDate(value) : COMMON_TEXT.dash);
// Days to the needed date while the requisition is still open (draft or in approval).
const dueOf = (row, today) => (OPEN_STATUSES.has(row.status) ? dueSignal(today, row.neededDate) : null);

const INITIAL = Object.freeze({ requisitionStatus: "", search: "", reasonOfReq: "", ticketStatus: "", dateFrom: "", dateTo: "" });
const FIELDS = [
  { key: "search", label: INSIGHT_TEXT.search, type: "search", placeholder: R.filters.search },
  { key: "reasonOfReq", label: R.filters.reason, type: "select", options: REASONS.map((value) => ({ value, label: R.reasons[value] })) },
  { key: "ticketStatus", label: R.filters.ticketStatus, type: "select", options: TICKETS.map((value) => ({ value, label: R.ticketStatus[value] })) },
  { key: "dateFrom", label: R.filters.from, type: "date" },
  { key: "dateTo", label: R.filters.to, type: "date" },
];
const COLUMNS = [
  { key: "number", label: R.columns.number, sort: "requisitionId", render: (row) => row.requisitionNumber || row.requisitionId, sub: (row) => date(row.requestDate) },
  { key: "position", label: R.position, render: (row) => <><b>{row.jobTitle || COMMON_TEXT.dash}</b><small>{row.departmentName}</small></> },
  { key: "requester", label: R.columns.requester, sort: "requesterName", render: (row) => row.requesterName || COMMON_TEXT.dash },
  { key: "reason", label: R.columns.reason, render: (row) => (row.reason ? <span className="zrv-ir-chip"><OrvexaIcon name={row.reason === "Replacement" ? "repeat" : "user-plus"} size={13} />{R.reasons[row.reason] ?? row.reason}</span> : COMMON_TEXT.dash) },
  { key: "needed", label: R.neededBy, sort: "dateNeeded", render: (row) => <Needed row={row} /> },
  { key: "ticket", label: R.columns.ticketStatus, render: (row) => (row.ticketStatus ? <span className={`zrv-ir-ticket zrv-ir-ticket--${row.ticketStatus.toLowerCase()}`}>{R.ticketStatus[row.ticketStatus] ?? row.ticketStatus}</span> : COMMON_TEXT.dash) },
  { key: "status", label: R.columns.status, render: (row) => <Pill tone={STATUS_TONE[row.status] ?? "warn"}>{statusLabel(row.status)}</Pill> },
];

// Overview: where requisitions are in approval, how many decided ones were
// approved, and how many are requested each month.
const CARDS = [
  {
    key: "pipeline",
    load: async ({ omit, count }) => {
      const base = omit(["requisitionStatus"]);
      const [all, ...parts] = await Promise.all([count(base), ...STATUSES.map(([key]) => count({ ...base, requisitionStatus: key }))]);
      return { all, parts: Object.fromEntries(STATUSES.map(([key], index) => [key, parts[index]])) };
    },
    render: (data, { pick }) => (
      <Card index={0} icon="git-pull-request-arrow" label={O.pipeline} theme="mint"
        aside={<Hint>{data && O.awaiting((data.parts.Draft ?? 0) + (data.parts.Inprocess ?? 0))}</Hint>}>
        <Hero value={data?.all} unit={O.total} />
        <Distribution total={data?.all} all={pick({ requisitionStatus: "" }).onPick}
          items={STATUSES.map(([key, tone]) => ({ key, tone, label: statusLabel(key), count: data?.parts[key], ...pick({ requisitionStatus: key }) }))} />
      </Card>
    ),
  },
  {
    key: "decision",
    load: async ({ omit, count }) => {
      const base = omit(["requisitionStatus"]);
      const [approved, rejected] = await Promise.all([count({ ...base, requisitionStatus: "Approved" }), count({ ...base, requisitionStatus: "Rejected" })]);
      return { approved, decided: approved + rejected };
    },
    render: (data) => (
      <Card index={1} icon="gauge" label={O.decision} theme="primary">
        <Ring value={data?.approved} of={data?.decided} />
        <Foot>{data && (data.decided ? O.approvedOf(data.approved, data.decided) : O.undecided)}</Foot>
      </Card>
    ),
  },
  {
    key: "volume",
    load: async ({ query, today, countIn }) => {
      const months = monthRanges(today, MONTHS);
      const counts = await Promise.all(months.map((month) => countIn(query, month)));
      return months.map((month, index) => ({ ...month, count: counts[index] }));
    },
    render: (data) => (
      <Card index={2} icon="calendar-range" label={O.volume} theme="amber"
        aside={data && <Delta value={data.at(-1).count - data.at(-2).count} label={data.at(-2).label} />}>
        <Hero value={data?.at(-1).count} unit={O.thisMonth} />
        <Columns items={data} count={MONTHS} />
      </Card>
    ),
  },
];
const GROUPS = [
  { key: "tickets", title: R.breakdown.tickets, tone: "mint", items: TICKETS.map((value) => ({ key: value, label: R.ticketStatus[value], patch: { ticketStatus: value } })) },
  { key: "reasons", title: R.breakdown.reasons, tone: "amber", items: REASONS.map((value) => ({ key: value, label: R.reasons[value], patch: { reasonOfReq: value } })) },
];

function Needed({ row }) {
  const due = dueOf(row, businessToday());
  return <><b>{date(row.neededDate)}</b>{due && <small className={`zrv-ir-due zrv-ir-is-${due.tone}`}>{due.text}</small>}</>;
}

// Requisition report: the requisitions the user may see (HR every one, others
// their own and their team's), filtered, sorted and paged by the server.
export default function RequisitionReportPage() {
  return (
    <InsightReport variant="requisition-report" title={R.title} subtitle={R.subtitle} heading={R.heading} resourceKey="hr-requisition-report"
      list={hrRecruitmentServices.requisitions.list} create={{ permission: ACTIONS.REQUISITION_CREATE, path: BASE, label: R.newRequisition }}
      openLabel={R.detail.open} empty={R.empty} initial={INITIAL} fields={FIELDS} columns={COLUMNS} cards={CARDS} groups={GROUPS}
      defaultSort={{ key: "requisitionId", order: "desc" }} numberOf={(row) => row.requisitionNumber || row.requisitionId}
      rowKey={(row) => row.requisitionId} pathOf={(row) => `${BASE}/${row.requisitionId}`}
      summary={(row, today) => ({
        heading: row.jobTitle,
        pill: <Pill tone={STATUS_TONE[row.status] ?? "warn"}>{statusLabel(row.status)}</Pill>,
        facts: [
          [R.detail.requester, row.requesterName], [R.detail.department, row.departmentName],
          [R.detail.requestDate, date(row.requestDate)], [R.detail.neededDate, date(row.neededDate)],
          [R.detail.reason, R.reasons[row.reason] ?? row.reason], [R.detail.ticket, R.ticketStatus[row.ticketStatus] ?? row.ticketStatus],
        ],
        timing: dueOf(row, today),
      })} />
  );
}
