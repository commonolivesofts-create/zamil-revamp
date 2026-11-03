import { useSearchParams } from "react-router";
import { COMMON_TEXT, INSIGHT_TEXT, ORIENTATION_TEXT as T } from "../hrRecruitmentText.js";
import { hrRecruitmentServices } from "../hrRecruitmentService.js";
import { daysBetween, enDate } from "../shared/hrFormat.js";
import { addDays, dayWindows, monthRanges } from "../shared/insightDates.js";
import { Pill } from "../shared/components/RecruitmentShell.jsx";
import { InsightReport } from "../shared/components/InsightReport.jsx";
import { Card, Hero, Hint, Lanes, Steps, Twin } from "../shared/components/InsightCards.jsx";
import { ORIENTATION_FLAGS, ORIENTATION_LEGACY_STATUSES, orientationStatus, statusTone } from "./orientationLegacy.js";

const BASE = "/hr/recruitment/orientation";
const R = T.report;
const C = T.reportColumns;
const O = R.overview;
const B = R.breakdown;
const CREATE = Object.freeze({ permission: "HR.ORIENTATION_TRAININGS:CREATE", path: BASE, label: R.newSchedule });
const date = (value) => (value ? enDate(value) : COMMON_TEXT.dash);
const statusLabel = (value) => T.status[orientationStatus(value)];
const FLAG_ICON = Object.freeze({ Y: "building-2", N: "factory" });
const STEP = Object.freeze({ Draft: ["file-pen-line", "draft"], Inprocess: ["hourglass", "progress"], Approved: ["circle-check", "ok"], Rejected: ["circle-x", "bad"] });
const FIELDS = [
  { key: "search", label: INSIGHT_TEXT.search, type: "search", placeholder: R.search },
  { key: "dateFrom", label: R.from, type: "date" },
  { key: "dateTo", label: R.to, type: "date" },
];
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
  { key: "status", label: R.status, render: (row) => <Pill tone={statusTone(row.status)}>{statusLabel(row.status)}</Pill> },
];

const step = (key, count, pick) => ({ key, label: T.status[key], icon: STEP[key][0], tone: STEP[key][1], count, ...pick({ status: key }) });
// Overview: where the schedules of this table are in approval, how the Shared
// and Plant tables compare, and how many orientations start in the next weeks.
const CARDS = [
  {
    key: "workflow",
    load: async ({ omit, count }) => {
      const base = omit(["status"]);
      const [all, ...parts] = await Promise.all([count(base), ...ORIENTATION_LEGACY_STATUSES.map((status) => count({ ...base, status }))]);
      return { all, parts: Object.fromEntries(ORIENTATION_LEGACY_STATUSES.map((status, index) => [status, parts[index]])) };
    },
    render: (data, { pick }) => (
      <Card index={0} icon="workflow" label={O.workflow} theme="mint" aside={<Hint>{data && O.schedules(data.all)}</Hint>}>
        <Steps items={["Draft", "Inprocess", "Approved"].map((key) => step(key, data?.parts[key], pick))} branch={step("Rejected", data?.parts.Rejected, pick)} />
      </Card>
    ),
  },
  {
    key: "tables",
    load: async ({ omit, count }) => {
      const base = omit(["flag"]);
      const counts = await Promise.all(ORIENTATION_FLAGS.map((flag) => count({ ...base, flag })));
      return Object.fromEntries(ORIENTATION_FLAGS.map((flag, index) => [flag, counts[index]]));
    },
    render: (data, { pick }) => (
      <Card index={1} icon="columns-2" label={O.tables} theme="primary">
        <Twin items={ORIENTATION_FLAGS.map((flag, index) => ({
          key: flag, label: R.flags[flag], icon: FLAG_ICON[flag], tone: index ? "amber" : "mint", count: data?.[flag], ...pick({ flag }),
        }))} />
      </Card>
    ),
  },
  {
    key: "soon",
    load: async ({ query, today, countIn }) => {
      const weeks = dayWindows(today, 7, 4, { forward: true });
      const counts = await Promise.all(weeks.map((week) => countIn(query, week)));
      return weeks.map((week, index) => ({ key: week.key, label: O.from(week.label), count: counts[index] }));
    },
    render: (data) => (
      <Card index={2} icon="calendar-clock" label={O.soon} theme="amber">
        <Hero value={data?.[0].count} unit={O.nextWeek} />
        <Lanes items={data} slots={4} />
      </Card>
    ),
  },
];

// Quick orientation-date windows around today.
function dateGroups(today) {
  const month = monthRanges(today, 1)[0];
  return [{
    key: "date", title: B.date, tone: "amber", items: [
      { key: "past", label: B.past, patch: { dateFrom: "", dateTo: addDays(today, -1) } },
      { key: "month", label: B.month, patch: { dateFrom: month.from, dateTo: month.to } },
      { key: "upcoming", label: B.upcoming, patch: { dateFrom: today, dateTo: "" } },
    ],
  }];
}

// Orientation report: the legacy "Select type to view report" list, one table
// (Shared or Plant) at a time; filtered, sorted and paged by the server. The
// form opens it on the type of the schedule shown (?flag=Y|N).
export default function OrientationReportPage() {
  const [params] = useSearchParams();
  const flag = ORIENTATION_FLAGS.includes(params.get("flag")) ? params.get("flag") : "N";
  return (
    <InsightReport key={flag} variant="orientation-report" title={R.title} subtitle={R.subtitle} heading={R.heading} resourceKey="hr-orientation-report"
      list={hrRecruitmentServices.orientations.list} create={CREATE} openLabel={R.detail.open} empty={R.empty}
      initial={{ flag, status: "", search: "", dateFrom: "", dateTo: "" }} required={["flag"]} fields={FIELDS} columns={COLUMNS} cards={CARDS} groups={dateGroups}
      defaultSort={{ key: "HEADER_ID", order: "desc" }} numberOf={(row) => row.scheduleNumber} rowKey={(row) => row.scheduleId}
      pathOf={(row) => `${BASE}/${row.scheduleId}?flag=${row.flag}`}
      summary={(row, today) => {
        const days = daysBetween(today, row.fromDate);
        return {
          heading: row.employeeName,
          pill: <Pill tone={statusTone(row.status)}>{statusLabel(row.status)}</Pill>,
          facts: [
            [C.empNo, row.employeeNumber], [R.type, R.flags[row.flag]], [C.division, row.divisionName], [C.section, row.section],
            [R.detail.period, `${date(row.fromDate)} – ${date(row.toDate)}`], [C.startDate, date(row.startDate)],
            [C.scheduledBy, row.scheduledBy], [C.pendingAt, row.pendingAt],
          ],
          timing: days !== null && days >= 0 ? { tone: days <= 7 ? "warn" : "calm", text: R.startsIn(days) } : null,
        };
      }} />
  );
}
