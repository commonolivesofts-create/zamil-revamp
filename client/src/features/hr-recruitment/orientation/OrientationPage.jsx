import { useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import OrvexaIcon from "@/components/icons/OrvexaIcon.jsx";
import { ConfirmDialog } from "@/features/security-administration/components/AdminUi.jsx";
import { fieldProps } from "@/features/security-administration/adminForms.js";
import { COMMON_TEXT, ORIENTATION_TEXT as T } from "../hrRecruitmentText.js";
import { hrRecruitmentServices } from "../hrRecruitmentService.js";
import { enDate, initials } from "../shared/hrFormat.js";
import { useRecruitmentForm } from "../shared/useRecruitmentForm.js";
import { RecruitmentLoader } from "../shared/components/RecruitmentLoader.jsx";
import { NewFormDialog } from "../shared/components/RecruitmentDialogs.jsx";
import {
  Orbit,
  Pill,
  RecruitmentShell,
  StepHead,
  Tilt,
} from "../shared/components/RecruitmentShell.jsx";
import { HrField } from "../shared/components/RecruitmentInputs.jsx";
import { EmployeePicker } from "../shared/components/EmployeePicker.jsx";
import {
  ORIENTATION_FLAGS,
  isOrientationEditable,
  lineMinutes,
  orientationDays,
  orientationPeriod,
  orientationSaveProblems,
  orientationStatus,
  reversedLines,
  statusTone,
} from "./orientationLegacy.js";

const BASE = "/hr/recruitment/orientation";
const service = hrRecruitmentServices.orientations;
const shortDate = (iso) =>
  iso
    ? new Intl.DateTimeFormat("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }).format(new Date(`${iso}T00:00:00Z`))
    : "";
const weekday = (iso) =>
  new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
const addDays = (iso, count) => {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
};
const spanDays = (from, to) =>
  from && to && to >= from
    ? Math.floor(
        (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
          86400000,
      ) + 1
    : 0;
const isWeekend = (iso) =>
  [5, 6].includes(new Date(`${iso}T00:00:00Z`).getUTCDay());
const emptyLine = (department, lineId = undefined) => ({
  ...(lineId ? { lineId } : {}),
  department,
  departmentHead: "",
  fromDate: "",
  toDate: "",
  timeFrom: "",
  timeTo: "",
  remarks: "",
});
const emptyForm = () => ({
  employee: null,
  flag: "",
  fromOrient: "",
  lines: [],
});
const formFromRecord = (record) => ({
  employee: record.employee,
  flag: record.flag,
  fromOrient: record.fromDate,
  lines: record.lines.map((line) => ({ ...line, remarks: line.remarks ?? "" })),
});
// A row is planned when it has a department head, both dates and both times.
const isPlanned = (line) =>
  Boolean(
    line.departmentHead &&
      line.fromDate &&
      line.toDate &&
      line.timeFrom &&
      line.timeTo,
  );
const hoursOf = (minutes) => `${(minutes / 60).toFixed(1)} h`;
// The variant of the open record: ?flag=Y|N (legacy form/{id}/{flag}).
const flagFrom = (search) => {
  const flag = new URLSearchParams(search).get("flag");
  return ORIENTATION_FLAGS.includes(flag) ? flag : undefined;
};

export default function OrientationPage() {
  const { search } = useLocation();
  const flag = flagFrom(search);
  return (
    <RecruitmentLoader
      current="orientation"
      title={T.title}
      param="scheduleId"
      load={(id, options) => service.getById(id, { ...options, flag })}
      loadLookups={(signal) => service.getLookups({ signal })}
    >
      {({ lookups, record, editorKey }) => (
        <OrientationEditor key={editorKey} lookups={lookups} record={record} />
      )}
    </RecruitmentLoader>
  );
}

function OrientationEditor({ lookups, record: savedRecord }) {
  const navigate = useNavigate();
  const editor = useRecruitmentForm({
    basePath: BASE,
    idKey: "scheduleId",
    record: savedRecord,
    initialForm: savedRecord ? formFromRecord(savedRecord) : emptyForm(),
  });
  const { form, record, step, setStep, patch } = editor;
  const [employee, setEmployee] = useState(savedRecord?.employee ?? null);
  const [errors, setErrors] = useState({});
  const [dialog, setDialog] = useState(null);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState("");
  const setupRequest = useRef(0);
  const managers = lookups.managers ?? [];
  const lines = form.lines;
  // Legacy copies From into the read-only To.
  const toDate = form.fromOrient;
  const planned = lines.filter(isPlanned).length;
  const minutes = lines.reduce((sum, line) => sum + lineMinutes(line), 0);
  const status = orientationStatus(record?.status ?? "Draft");
  const doneSteps = [
    Boolean(employee && form.fromOrient),
    planned === lines.length && lines.length > 0,
    planned > 0,
    Boolean(record),
  ];
  const locked = Boolean(record) && !isOrientationEditable(record.status);
  const lastLineDate = lines.reduce(
    (latest, line) => (line.toDate && line.toDate > latest ? line.toDate : latest),
    "",
  );
  const timelineStart = form.fromOrient || employee?.startDate || "";
  const timelineDays = (() => {
    if (!timelineStart) return [];
    const last =
      lastLineDate && lastLineDate > timelineStart
        ? lastLineDate
        : addDays(timelineStart, 6);
    const count = Math.min(14, Math.max(7, spanDays(timelineStart, last)));
    return Array.from({ length: count }, (_, index) =>
      addDays(timelineStart, index),
    );
  })();

  const updateLine = (index, changes) =>
    patch((current) => ({
      lines: current.lines.map((line, row) =>
        row === index ? { ...line, ...changes } : line,
      ),
    }));
  // Legacy getEmlpoyee(): fill the employee fields and regenerate the training rows of the
  // employee's type.
  const pickEmployee = async (picked) => {
    const requestId = ++setupRequest.current;
    setEmployee(picked);
    setSetupError("");
    setSetupLoading(true);
    try {
      const setup = await service.employeeSetup(picked.employeeNumber);
      if (requestId !== setupRequest.current) return;
      setEmployee(setup.employee);
      patch({
        employee: setup.employee,
        flag: setup.flag,
        lines: setup.departments.map((department) => emptyLine(department)),
      });
      setErrors({});
    } catch (error) {
      if (requestId !== setupRequest.current) return;
      setSetupError(error?.message || T.errors.setup);
      // Keep the selected employee and existing form values visible when a
      // dependent lookup fails. Saving is blocked until setup succeeds.
      setEmployee(picked);
    } finally {
      if (requestId === setupRequest.current) setSetupLoading(false);
    }
  };
  // Leaving with unsaved answers asks first (New form and Report); the report
  // opens on this schedule's table (Shared or Plant).
  const leave = (path) =>
    editor.dirty && !locked ? setDialog({ path }) : navigate(path);
  const requestSave = () => {
    if (locked) return;
    if (
      setupLoading ||
      setupError ||
      (employee && form.employee?.employeeNumber !== employee.employeeNumber)
    ) {
      editor.reject(0, setupError || T.errors.setupPending);
      return;
    }
    const problems = orientationSaveProblems({
      employee,
      fromOrient: form.fromOrient,
      lines,
    });
    const nextErrors = {};
    if (problems.includes("employee")) nextErrors.employee = T.errors.employee;
    if (problems.includes("fromOrient")) nextErrors.fromOrient = T.errors.from;
    if (problems.includes("noLines")) nextErrors.lines = T.errors.noLines;
    if (problems.includes("reversed")) nextErrors.lines = T.errors.reversed;
    setErrors(nextErrors);
    if (problems.length) {
      editor.reject(
        nextErrors.employee || nextErrors.fromOrient ? 0 : 1,
        `${T.errors.cannotSave} ${Object.values(nextErrors)[0]}`,
      );
      return;
    }
    setDialog("save");
  };
  const save = () =>
    editor
      .perform(
        async ({ saved }) => {
          const result = await service.save(
            editor.recordId,
            { employee, fromOrient: form.fromOrient, lines },
            { flag: record?.flag },
          );
          saved(result);
          return result;
        },
        { success: (result) => T.saved(result.scheduleNumber) },
      )
      .then((outcome) => {
        if (outcome.status === "success") setDialog(null);
      });

  // The primary button saves, so the toolbar has no second Save.
  const tools = [
    {
      icon: "printer",
      label: COMMON_TEXT.print,
      onClick: () => window.print(),
    },
    {
      icon: "chart-column",
      label: COMMON_TEXT.report,
      onClick: () => leave(`${BASE}/report?flag=${savedRecord?.flag || "N"}`),
    },
    {
      icon: "file-plus",
      label: T.report.newSchedule,
      onClick: () => leave(BASE),
    },
    {
      icon: "house",
      label: COMMON_TEXT.home,
      onClick: () => navigate("/dashboard"),
    },
  ];
  const employeeFields = [
    [T.labels.type, employee?.employmentType],
    [T.labels.startDate, employee && enDate(employee.startDate)],
    [T.labels.section, employee?.section],
    [T.labels.division, employee?.divisionName || employee?.division],
    [T.labels.position, employee?.position],
    [T.labels.status, T.status[status] ?? status],
  ];

  return (
    <>
      <RecruitmentShell
        current="orientation"
        title={T.title}
        demo={false}
        flowStatus={
          record ? `${record.scheduleNumber} · ${T.status[status] ?? status}` : null
        }
        tools={tools}
        primary={{ label: T.primary, icon: "save", onClick: requestSave }}
        feedback={editor.feedback}
        onDismissFeedback={editor.dismiss}
        locked={locked}
        pending={editor.pending || setupLoading}
        focusError={editor.focusError}
        banner={
          <PrintSheet
            employee={employee}
            record={record}
            form={form}
            status={status}
          />
        }
        steps={T.tabNames.map((name, index) => [
          name,
          index === 1 && lines.length
            ? T.tabHints.planned(planned, lines.length)
            : doneSteps[index]
              ? T.tabHints.done
              : T.tabHints.open,
        ])}
        step={step}
        onStep={setStep}
        doneSteps={doneSteps}
        finalLabel={T.final}
        onFinal={requestSave}
        side={
          <>
            <Tilt aria-label={T.card.label}>
              <div className="zrv-hr-dark__top">
                {/* a new schedule has no number yet; the status pill says Draft */}
                <span className="zrv-hr-mono">{record?.scheduleNumber}</span>
                <Pill tone={statusTone(status)}>
                  {T.status[status] ?? status}
                </Pill>
              </div>
              <div className="zrv-hr-dark__who">
                <span className="zrv-hr-dark__av" aria-hidden="true">
                  {initials(employee?.name)}
                </span>
                <div>
                  <h3
                    className={`zrv-hr-dark__title${employee ? "" : " zrv-hr-is-empty"}`}
                  >
                    {employee?.name || T.card.newJoiner}
                  </h3>
                  <div
                    className={`zrv-hr-dark__sub${employee ? "" : " zrv-hr-is-empty"}`}
                  >
                    {employee
                      ? `${employee.position} · ${employee.section}`
                      : T.card.subtitle}
                  </div>
                </div>
              </div>
              <div className="zrv-hr-dark__badges">
                {employee && (
                  <>
                    <span className="zrv-hr-is-solid">
                      {employee.divisionName || employee.division}
                    </span>
                    <span>{employee.employmentType}</span>
                    <span>{T.card.joins(shortDate(employee.startDate))}</span>
                  </>
                )}
              </div>
              <div className="zrv-hr-dark__grid">
                <div>
                  <small>{T.card.orientation}</small>
                  <b>
                    {form.fromOrient
                      ? shortDate(form.fromOrient)
                      : COMMON_TEXT.dash}
                  </b>
                </div>
                <div>
                  <small>{T.card.time}</small>
                  <b>{hoursOf(minutes)}</b>
                </div>
                <div>
                  <small>{T.card.sessions}</small>
                  <b>
                    {planned}
                    <em>/{lines.length}</em>
                  </b>
                  <div className="zrv-hr-bar">
                    <i
                      style={{
                        transform: `scaleX(${lines.length ? planned / lines.length : 0})`,
                      }}
                    />
                  </div>
                </div>
                <div>
                  <small>{T.card.issues}</small>
                  <b>
                    {reversedLines(lines).length
                      ? T.card.check
                      : lines.length
                        ? T.card.none
                        : COMMON_TEXT.dash}
                  </b>
                </div>
              </div>
            </Tilt>
            <Orbit
              done={
                Number(Boolean(employee)) +
                Number(Boolean(form.fromOrient)) +
                planned
              }
              total={lines.length + 2}
              hint={
                errors.lines ||
                (lines.length
                  ? T.orbit.progress(planned, lines.length)
                  : T.orbit.pickEmployee)
              }
            />
          </>
        }
      >
        {step === 0 && (
          <>
            <StepHead {...T.heads[0]} />
            <EmployeePicker
              id="ori-name"
              label={T.labels.name}
              required
              value={employee}
              onPick={pickEmployee}
              error={errors.employee}
              searchService={(query, options) =>
                query
                  ? service.searchEmployees(query, options)
                  : { items: lookups.employees }
              }
            />
            {setupError && (
              <p className="zrv-auth-field-error" role="alert">
                {setupError}
              </p>
            )}
            <div className="zrv-hr-grid zrv-hr-is-4 zrv-hr-mt">
              {employeeFields.map(([label, value]) => {
                const id = `ori-${label.replace(/\W+/g, "-").toLowerCase()}`;
                return (
                  <HrField key={label} id={id} label={label}>
                    <input
                      id={id}
                      className="ux-input zrv-hr-input"
                      readOnly
                      value={value || ""}
                      placeholder={T.placeholders.fromEmployee}
                    />
                  </HrField>
                );
              })}
            </div>
            <h3 className="zrv-hr-subh">{T.window}</h3>
            <div className="zrv-hr-grid zrv-hr-is-4">
              <HrField
                id="ori-from"
                label={T.labels.from}
                required
                error={errors.fromOrient}
              >
                <input
                  {...fieldProps("ori-from", { error: errors.fromOrient })}
                  type="date"
                  className="ux-input zrv-hr-input"
                  value={form.fromOrient}
                  onChange={(event) => {
                    patch({ fromOrient: event.target.value });
                    setErrors((prev) => ({ ...prev, fromOrient: "" }));
                  }}
                />
              </HrField>
              <HrField id="ori-to" label={T.labels.to} hint={T.hints.to}>
                <input
                  id="ori-to"
                  className="ux-input zrv-hr-input"
                  readOnly
                  value={toDate ? enDate(toDate) : ""}
                  placeholder={COMMON_TEXT.dash}
                />
              </HrField>
              <HrField id="ori-by" label={T.labels.scheduledBy}>
                <input
                  id="ori-by"
                  className="ux-input zrv-hr-input"
                  readOnly
                  value={record?.scheduledByName ?? ""}
                  placeholder={T.ticket.pending}
                />
              </HrField>
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <StepHead {...T.heads[1]} />
            {!employee && <p className="zrv-hr-note">{T.pickFirst}</p>}
            {lines.length > 0 && (
              <div className="zrv-hr-benefits">
                {lines.map((line, index) => {
                  const titleId = `ori-line-${index}-title`;
                  const days = orientationDays(line.fromDate, line.toDate);
                  const period = orientationPeriod(line.timeFrom, line.timeTo);
                  return (
                    <article
                      key={`${line.department}-${index}`}
                      style={{ "--i": index }}
                      className={`zrv-hr-benefit zrv-hr-session${isPlanned(line) ? " zrv-hr-is-done" : ""}`}
                    >
                      <div className="zrv-hr-benefit__h">
                        <span className="zrv-hr-bubble">
                          <OrvexaIcon name="users" size={17} />
                        </span>
                        <b id={titleId}>{line.department}</b>
                        <span className="zrv-hr-session__calc">
                          <span>
                            {T.labels.days}: {days === "" ? COMMON_TEXT.dash : days}
                          </span>
                          <span>
                            {T.labels.period}: {period || COMMON_TEXT.dash}
                          </span>
                        </span>
                        <span className="zrv-hr-benefit__ok" aria-hidden="true">
                          <OrvexaIcon name="check" size={12} />
                        </span>
                      </div>
                      <div
                        className="zrv-hr-session__grid"
                        role="group"
                        aria-labelledby={titleId}
                      >
                        <label className="zrv-hr-session__f zrv-hr-is-wide">
                          <span>{T.labels.head}</span>
                          <select
                            className="ux-select zrv-hr-input"
                            value={line.departmentHead}
                            onChange={(event) =>
                              updateLine(index, {
                                departmentHead: event.target.value,
                              })
                            }
                          >
                            <option value="">{T.placeholders.head}</option>
                            {managers.map((head) => (
                              <option
                                key={`${head.employeeNumber}-${head.name}`}
                                value={head.name}
                              >
                                {head.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="zrv-hr-session__f">
                          <span>{T.labels.sessionFrom}</span>
                          <input
                            type="date"
                            className="ux-input zrv-hr-input"
                            value={line.fromDate}
                            onChange={(event) =>
                              updateLine(index, { fromDate: event.target.value })
                            }
                          />
                        </label>
                        <label className="zrv-hr-session__f">
                          <span>{T.labels.sessionTo}</span>
                          <input
                            type="date"
                            className="ux-input zrv-hr-input"
                            value={line.toDate}
                            min={line.fromDate || undefined}
                            onChange={(event) =>
                              updateLine(index, { toDate: event.target.value })
                            }
                          />
                        </label>
                        <label className="zrv-hr-session__f">
                          <span>{T.labels.timeFrom}</span>
                          <input
                            type="time"
                            step="1"
                            className="ux-input zrv-hr-input"
                            value={line.timeFrom}
                            onChange={(event) =>
                              updateLine(index, { timeFrom: event.target.value })
                            }
                          />
                        </label>
                        <label className="zrv-hr-session__f">
                          <span>{T.labels.timeTo}</span>
                          <input
                            type="time"
                            step="1"
                            className="ux-input zrv-hr-input"
                            value={line.timeTo}
                            onChange={(event) =>
                              updateLine(index, { timeTo: event.target.value })
                            }
                          />
                        </label>
                        <label className="zrv-hr-session__f zrv-hr-is-full">
                          <span>{T.labels.remark}</span>
                          <input
                            className="ux-input zrv-hr-input"
                            value={line.remarks}
                            maxLength={1000}
                            placeholder={T.placeholders.remark}
                            onChange={(event) =>
                              updateLine(index, { remarks: event.target.value })
                            }
                          />
                        </label>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
            {errors.lines && (
              <p className="zrv-auth-field-error" role="alert">
                {errors.lines}
              </p>
            )}
          </>
        )}
        {step === 2 && (
          <>
            <StepHead {...T.heads[2]} />
            {timelineDays.length ? (
              <div
                className="zrv-hr-timeline"
                style={{ "--cols": timelineDays.length }}
                role="img"
                aria-label={T.timeline.label}
              >
                <span
                  className="zrv-hr-timeline__corner"
                  style={{ gridRow: 1, gridColumn: 1 }}
                />
                {timelineDays.map((day, column) => (
                  <span
                    key={day}
                    style={{ gridColumn: column + 2 }}
                    className={`zrv-hr-timeline__day${isWeekend(day) ? " zrv-hr-is-weekend" : ""}${employee && day === employee.startDate ? " zrv-hr-is-start" : ""}`}
                  >
                    <b>{Number(day.slice(8))}</b>
                    <small>{weekday(day)}</small>
                  </span>
                ))}
                {lines.map((line, row) => {
                  const start = timelineDays.indexOf(line.fromDate);
                  const end = timelineDays.indexOf(line.toDate);
                  const visible =
                    line.fromDate && line.toDate && start >= 0 && end >= start;
                  return [
                    <span
                      key={`label-${row}`}
                      className="zrv-hr-timeline__label"
                      style={{ gridRow: row + 2 }}
                    >
                      {line.department}
                    </span>,
                    ...timelineDays.map((day, column) => (
                      <span
                        key={`${row}-${day}`}
                        className={`zrv-hr-timeline__cell${isWeekend(day) ? " zrv-hr-is-weekend" : ""}`}
                        style={{ gridRow: row + 2, gridColumn: column + 2 }}
                      />
                    )),
                    visible && (
                      <span
                        key={`bar-${row}`}
                        className="zrv-hr-timeline__bar"
                        style={{
                          gridRow: row + 2,
                          gridColumn: `${start + 2} / ${end + 3}`,
                        }}
                      >
                        {line.timeFrom && `${line.timeFrom}–${line.timeTo}`}
                      </span>
                    ),
                  ];
                })}
              </div>
            ) : (
              <div className="zrv-hr-timeline__empty">{T.timeline.empty}</div>
            )}
            <div className="zrv-hr-sep" />
            {lines.length ? (
              <ul className="zrv-hr-issues">
                {lines
                  .filter((line) => !isPlanned(line))
                  .map((line) => (
                    <li key={line.department} className="zrv-hr-is-warn">
                      <OrvexaIcon name="clock" size={14} />
                      {T.notPlanned(line.department)}
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="zrv-hr-note">{T.nothingYet}</p>
            )}
          </>
        )}
        {step === 3 && (
          <>
            <StepHead {...T.heads[3]} />
            <dl className="zrv-hr-review zrv-hr-ori-review">
              {lines.map((line) => (
                <div
                  key={line.department}
                  className={isPlanned(line) ? "zrv-hr-is-ok" : undefined}
                >
                  <dt>{line.department}</dt>
                  <dd>
                    {line.fromDate
                      ? `${shortDate(line.fromDate)}${line.toDate && line.toDate !== line.fromDate ? ` – ${shortDate(line.toDate)}` : ""}`
                      : T.review.noDates}
                    {" · "}
                    {line.timeFrom
                      ? `${line.timeFrom}–${line.timeTo} (${orientationPeriod(line.timeFrom, line.timeTo) || COMMON_TEXT.dash})`
                      : T.review.noTimes}
                    <small>
                      {line.departmentHead || T.review.noHead}
                      {line.remarks ? ` · ${line.remarks}` : ""}
                    </small>
                  </dd>
                </div>
              ))}
            </dl>
            {errors.lines && (
              <p className="zrv-auth-field-error" role="alert">
                {errors.lines}
              </p>
            )}
          </>
        )}
      </RecruitmentShell>
      {dialog === "save" && (
        <ConfirmDialog
          title={T.saveTitle}
          description={T.saveBody}
          confirmLabel={T.primary}
          pending={editor.pending}
          feedback={editor.feedback}
          onConfirm={save}
          onClose={() => setDialog(null)}
        >
          <p className="zrv-admin-confirm">
            <b>{employee?.name}</b> · {employee?.position}
            <br />
            {shortDate(form.fromOrient)} · {planned}/{lines.length}{" "}
            {T.card.sessions.toLowerCase()}
          </p>
        </ConfirmDialog>
      )}
      {dialog?.path && (
        <NewFormDialog
          onConfirm={() => {
            const { path } = dialog;
            setDialog(null);
            navigate(path);
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}

// The legacy printout (Newhiretrain/pdf, nhtpdf.php): the schedule on one page whichever step is
// open. Hidden on screen.
function PrintSheet({ employee, record, form, status }) {
  const P = T.print;
  return (
    <section className="zrv-hr-ori-print" aria-hidden="true">
      <h2>{P.title}</h2>
      <table>
        <tbody>
          <tr>
            <th>{P.division}</th>
            <td>{employee?.section ?? ""}</td>
            <th>{P.name}</th>
            <td>{employee?.name ?? ""}</td>
          </tr>
          <tr>
            <th>{P.reference}</th>
            <td>{record?.scheduleNumber ?? ""}</td>
            <th>{P.startDate}</th>
            <td>{employee?.startDate ? enDate(employee.startDate) : ""}</td>
          </tr>
          <tr>
            <th>{P.from}</th>
            <td>{form.fromOrient ? enDate(form.fromOrient) : ""}</td>
            <th>{P.to}</th>
            <td>{form.fromOrient ? enDate(form.fromOrient) : ""}</td>
          </tr>
        </tbody>
      </table>
      <table>
        <thead>
          <tr>
            {P.columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {form.lines.map((line, index) => (
            <tr key={`${line.department}-${index}`}>
              <td>{line.department}</td>
              <td>{line.departmentHead}</td>
              <td>{orientationPeriod(line.timeFrom, line.timeTo)}</td>
              <td>{line.timeFrom}</td>
              <td>{line.timeTo}</td>
              <td>{line.remarks}</td>
              <td />
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <b>{P.scheduledBy}</b> {record?.scheduledByName ?? ""}
      </p>
      <div className="zrv-hr-ori-print__signs">
        {P.signs.map((sign) => (
          <p key={sign}>
            <span>{T.status[status] ?? status}</span>
            <b>{sign}</b>
          </p>
        ))}
      </div>
    </section>
  );
}
