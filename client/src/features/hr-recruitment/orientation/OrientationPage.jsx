import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { ConfirmDialog } from '@/features/security-administration/components/AdminUi.jsx'
import { fieldProps } from '@/features/security-administration/adminForms.js'
import { COMMON_TEXT, ORIENTATION_TEXT as T } from '../hrRecruitmentText.js'
import { hrRecruitmentServices } from '../hrRecruitmentService.js'
import { enDate, initials } from '../shared/hrFormat.js'
import { useRecruitmentForm } from '../shared/useRecruitmentForm.js'
import { RecruitmentLoader } from '../shared/components/RecruitmentLoader.jsx'
import { NewFormDialog, ReportDialog } from '../shared/components/RecruitmentDialogs.jsx'
import { Orbit, PanelHead, Pill, RecruitmentShell, Ticket, Tilt } from '../shared/components/RecruitmentShell.jsx'
import { HrField } from '../shared/components/RecruitmentInputs.jsx'
import { EmployeePicker } from '../shared/components/EmployeePicker.jsx'
import {
  SESSION_KEYS, addDays, blankOrientation, calendarDays, draftPlan, formatHours, isOrientationLocked, isSessionComplete, isWeekend,
  nextWorkday, orientationFormFromRecord, orientationPayload, plannedCount, scheduleIssues, scheduleToDate, sessionDays, sessionHours,
  totalHours, validateOrientation,
} from './orientationModel.js'

const BASE = '/hr/recruitment/orientation'
const service = hrRecruitmentServices.orientations
const SESSION_ICONS = Object.freeze({ hr: 'users', safety: 'shield-check', it: 'monitor', tour: 'factory', meet: 'circle-check' })
const shortDate = (iso) => (iso ? new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`)) : '')
const weekday = (iso) => new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))

export default function OrientationPage() {
  return (
    <RecruitmentLoader current="orientation" title={T.title} subtitle={T.subtitle} param="scheduleId" load={service.getById}>
      {({ lookups, record, editorKey }) => <OrientationEditor key={editorKey} lookups={lookups} record={record} />}
    </RecruitmentLoader>
  )
}

function OrientationEditor({ lookups, record: savedRecord }) {
  const navigate = useNavigate()
  const heads = lookups.orientation.departmentHeads
  const editor = useRecruitmentForm({
    basePath: BASE, idKey: 'scheduleId', record: savedRecord,
    initialForm: savedRecord ? orientationFormFromRecord(savedRecord) : blankOrientation(),
  })
  const { form, record, step, setStep, patch } = editor
  const [employee, setEmployee] = useState(savedRecord?.employee ?? null)
  const [errors, setErrors] = useState({})
  const [dialog, setDialog] = useState(null)
  const [flash, setFlash] = useState(false)
  const locked = isOrientationLocked(record?.status)
  const sessions = form.sessions
  const toDate = scheduleToDate(sessions)
  const issues = scheduleIssues(sessions, { joiningDate: employee?.startDate, fromDate: form.fromDate })
  const planned = plannedCount(sessions)
  const hours = totalHours(sessions)
  const days = calendarDays(form.fromDate, toDate)
  const status = record?.status ?? (planned === SESSION_KEYS.length ? 'READY' : 'DRAFT')
  const headName = (key, code) => heads[key].find((head) => head.code === code)?.name ?? ''

  useEffect(() => {
    if (!flash) return undefined
    const timer = setTimeout(() => setFlash(false), 1400)
    return () => clearTimeout(timer)
  }, [flash])

  const setSession = (key, changes) => {
    patch((current) => ({ sessions: { ...current.sessions, [key]: { ...current.sessions[key], ...changes } } }))
    setErrors((current) => ({ ...current, toDate: undefined, sessions: undefined }))
  }
  const pickEmployee = (picked) => {
    setEmployee(picked)
    patch((current) => ({ employeeId: picked.employeeId, fromDate: current.fromDate || nextWorkday(picked.startDate) }))
    setErrors((current) => ({ ...current, employeeId: undefined, fromDate: undefined }))
  }
  const plan = () => {
    const begin = nextWorkday(form.fromDate || employee?.startDate || '')
    if (!begin) return editor.showProblem(T.pickFirst)
    patch((current) => ({ fromDate: begin, sessions: draftPlan(begin, current.sessions, heads) }))
    setFlash(true)
    editor.dismiss()
    setStep(1)
  }

  const requestSave = () => {
    if (locked) return editor.showProblem(T.locked)
    const result = validateOrientation(form, issues)
    setErrors(result.errors)
    if (!result.valid) return editor.reject(result.firstStep, `${T.errors.cannotSave} ${Object.values(result.errors)[0]}`)
    setDialog('save')
  }
  const save = () => editor.perform(async ({ saved }) => {
    const result = await service.save(orientationPayload(form))
    saved(result)
    return result
  }, { success: (result) => T.saved(result.scheduleNumber) }).then((outcome) => {
    if (outcome.status === 'success') setDialog(null)
  })
  const startNew = () => navigate(BASE)

  const tools = [
    { icon: 'save', label: COMMON_TEXT.save, onClick: requestSave, disabled: locked || editor.pending },
    { icon: 'printer', label: COMMON_TEXT.print, onClick: () => window.print() },
    { icon: 'chart-column', label: COMMON_TEXT.report, onClick: () => setDialog('report') },
    { icon: 'file-plus', label: COMMON_TEXT.requestForm, onClick: () => (editor.dirty ? setDialog('new') : startNew()) },
    { icon: 'house', label: COMMON_TEXT.home, onClick: () => navigate('/dashboard') },
  ]

  // Timeline: 7 to 14 days from the orientation start (or joining day).
  const timelineStart = form.fromDate || employee?.startDate || ''
  const timelineDays = (() => {
    if (!timelineStart) return []
    const last = toDate && toDate > timelineStart ? toDate : addDays(timelineStart, 6)
    const count = Math.min(14, Math.max(7, calendarDays(timelineStart, last)))
    return Array.from({ length: count }, (_, index) => addDays(timelineStart, index))
  })()
  const employeeFields = [
    [T.labels.type, employee?.employmentType], [T.labels.startDate, employee && enDate(employee.startDate)], [T.labels.section, employee?.section],
    [T.labels.division, employee?.division], [T.labels.position, employee?.position], [T.labels.status, T.status[status]],
  ]

  return (
    <>
      <RecruitmentShell
        current="orientation" title={T.title} subtitle={T.subtitle}
        flowStatus={record ? `${record.scheduleNumber} · ${T.status[record.status]}` : null}
        tools={tools} primary={{ label: T.primary, icon: 'save', onClick: requestSave }}
        feedback={editor.feedback} onDismissFeedback={editor.dismiss} locked={locked} pending={editor.pending} focusError={editor.focusError}
        ticket={<Ticket avatar={initials(employee?.name)} code={T.code} items={[
          { k: T.ticket.number, v: record?.scheduleNumber || T.ticket.numberPending },
          { k: T.ticket.name, v: employee?.name || T.ticket.notSelected, big: true },
          { k: T.ticket.type, v: employee?.employmentType || COMMON_TEXT.dash },
          { k: T.ticket.startDate, v: employee ? enDate(employee.startDate) : COMMON_TEXT.dash },
          { k: T.ticket.scheduledBy, v: record?.scheduledByName || T.ticket.pending },
          { k: T.ticket.status, v: <Pill tone={record ? 'ok' : 'warn'}>{T.status[status]}</Pill> },
        ]} />}
        steps={T.steps} step={step} onStep={setStep}
        doneSteps={[Boolean(employee && form.fromDate), planned === SESSION_KEYS.length, planned > 0 && !issues.some((issue) => issue.level === 'bad'), locked]}
        finalLabel={T.final} onFinal={requestSave}
        side={<>
          <Tilt aria-label={T.card.label}>
            <div className="zrv-hr-dark__top"><span className="zrv-hr-eyebrow">{T.card.eyebrow}</span><span className="zrv-hr-mono">{record?.scheduleNumber || T.card.draft}</span></div>
            <div className="zrv-hr-dark__who">
              <span className="zrv-hr-dark__av" aria-hidden="true">{initials(employee?.name)}</span>
              <div>
                <h3 className={`zrv-hr-dark__title${employee ? '' : ' zrv-hr-is-empty'}`}>{employee?.name || T.card.newJoiner}</h3>
                <div className={`zrv-hr-dark__sub${employee ? '' : ' zrv-hr-is-empty'}`}>{employee ? `${employee.position} · ${employee.section}` : T.card.subtitle}</div>
              </div>
            </div>
            <div className="zrv-hr-dark__badges">
              {employee
                ? <><span className="zrv-hr-is-solid">{employee.division}</span><span>{employee.employmentType}</span><span>{T.card.joins(shortDate(employee.startDate))}</span></>
                : <span>{T.card.draftBadge}</span>}
            </div>
            <div className="zrv-hr-dark__grid">
              <div><small>{T.card.orientation}</small><b>{form.fromDate ? shortDate(form.fromDate) : COMMON_TEXT.dash}{toDate ? ` – ${shortDate(toDate)}` : ''}</b></div>
              <div><small>{T.card.time}</small><b>{formatHours(hours)}</b></div>
              <div><small>{T.card.sessions}</small><b>{planned}<em>/{SESSION_KEYS.length}</em></b><div className="zrv-hr-bar"><i style={{ transform: `scaleX(${planned / SESSION_KEYS.length})` }} /></div></div>
              <div><small>{T.card.issues}</small><b>{issues.length || T.card.none}</b></div>
            </div>
          </Tilt>
          <Orbit done={planned + (employee ? 1 : 0) + (form.fromDate ? 1 : 0)} total={SESSION_KEYS.length + 2}
            hint={issues.length ? issues[0].text : planned === SESSION_KEYS.length ? T.orbit.ready : T.orbit.left(SESSION_KEYS.length - planned)} />
        </>}
      >
        {step === 0 && <>
          <PanelHead n={1} {...T.heads[0]} />
          <EmployeePicker id="ori-name" label={T.labels.name} required value={employee} onPick={pickEmployee} error={errors.employeeId} />
          <div className="zrv-hr-grid zrv-hr-is-3 zrv-hr-mt">
            {employeeFields.map(([label, value]) => (
              <HrField key={label} id={`ori-${label.replace(/\W+/g, '-').toLowerCase()}`} label={label}>
                <input id={`ori-${label.replace(/\W+/g, '-').toLowerCase()}`} className="ux-input zrv-hr-input" readOnly value={value || ''} placeholder={T.placeholders.fromEmployee} />
              </HrField>
            ))}
          </div>
          <h3 className="zrv-hr-subh">{T.window}</h3>
          <div className="zrv-hr-grid zrv-hr-is-3">
            <HrField id="ori-from" label={T.labels.from} required error={errors.fromDate}>
              <input {...fieldProps('ori-from', { error: errors.fromDate })} type="date" className="ux-input zrv-hr-input" value={form.fromDate} aria-required="true"
                onChange={(event) => { editor.set('fromDate')(event); setErrors((current) => ({ ...current, fromDate: undefined })) }} />
            </HrField>
            <HrField id="ori-to" label={T.labels.to} required error={errors.toDate} hint={T.hints.to}>
              <input {...fieldProps('ori-to', { error: errors.toDate, hint: T.hints.to })} className="ux-input zrv-hr-input" readOnly value={toDate ? enDate(toDate) : ''} placeholder={COMMON_TEXT.dash} />
            </HrField>
            <HrField id="ori-by" label={T.labels.scheduledBy}>
              <input id="ori-by" className="ux-input zrv-hr-input" readOnly value={record?.scheduledByName ?? ''} placeholder={T.ticket.pending} />
            </HrField>
          </div>
          {employee && planned === 0 && !locked && (
            <div className="zrv-hr-cta zrv-hr-reveal">
              <span className="zrv-hr-bubble"><OrvexaIcon name="sparkles" size={18} /></span>
              <div><b>{T.cta.title}</b><small>{T.cta.desc}</small></div>
              <button type="button" className="btn-primary zrv-hr-btn" onClick={plan}>{T.cta.action}</button>
            </div>
          )}
        </>}

        {step === 1 && <>
          <PanelHead n={2} {...T.heads[1]} />
          <div className="zrv-hr-benefits">
            {SESSION_KEYS.map((key, index) => {
              const session = sessions[key]
              const mine = issues.filter((issue) => issue.key === key)
              const count = sessionDays(session)
              const titleId = `ori-${key}-title`
              const bad = mine.some((issue) => issue.level === 'bad')
              return (
                <article key={key} style={{ '--i': index }}
                  className={`zrv-hr-benefit zrv-hr-session${isSessionComplete(session) ? ' zrv-hr-is-done' : ''}${flash ? ' zrv-hr-is-flash' : ''}${bad ? ' zrv-hr-is-bad' : ''}`}>
                  <div className="zrv-hr-benefit__h">
                    <span className="zrv-hr-bubble"><OrvexaIcon name={SESSION_ICONS[key]} size={17} /></span>
                    <b id={titleId}>{T.sessions[key].name}</b>
                    <span className="zrv-hr-session__calc"><span>{T.days(count)}</span><span>{formatHours(sessionHours(session))}</span></span>
                    <span className="zrv-hr-benefit__ok" aria-hidden="true"><OrvexaIcon name="check" size={12} /></span>
                  </div>
                  <div className="zrv-hr-session__grid" role="group" aria-labelledby={titleId} aria-describedby={mine.length ? `ori-${key}-issue` : undefined}>
                    <label className="zrv-hr-session__f zrv-hr-is-wide"><span>{T.labels.head}</span>
                      <select className="ux-select zrv-hr-input" value={session.headCode} onChange={(event) => setSession(key, { headCode: event.target.value })}>
                        <option value="">{T.placeholders.head}</option>
                        {heads[key].map((head) => <option key={head.code} value={head.code}>{head.name}</option>)}
                      </select>
                    </label>
                    <label className="zrv-hr-session__f"><span>{T.labels.sessionFrom}</span>
                      <input type="date" className="ux-input zrv-hr-input" value={session.fromDate}
                        onChange={(event) => { const value = event.target.value; setSession(key, { fromDate: value, toDate: session.toDate && session.toDate >= value ? session.toDate : value }) }} />
                    </label>
                    <label className="zrv-hr-session__f"><span>{T.labels.sessionTo}</span>
                      <input type="date" className="ux-input zrv-hr-input" value={session.toDate} min={session.fromDate || undefined} aria-invalid={mine.some((issue) => issue.code === 'END_BEFORE_START') || undefined}
                        onChange={(event) => setSession(key, { toDate: event.target.value })} />
                    </label>
                    <label className="zrv-hr-session__f"><span>{T.labels.timeFrom}</span>
                      <input type="time" className="ux-input zrv-hr-input" value={session.timeFrom} onChange={(event) => setSession(key, { timeFrom: event.target.value })} />
                    </label>
                    <label className="zrv-hr-session__f"><span>{T.labels.timeTo}</span>
                      <input type="time" className="ux-input zrv-hr-input" value={session.timeTo} aria-invalid={mine.some((issue) => issue.code === 'TIME_ORDER' || issue.code === 'CLASH') || undefined}
                        onChange={(event) => setSession(key, { timeTo: event.target.value })} />
                    </label>
                    <label className="zrv-hr-session__f zrv-hr-is-full"><span>{T.labels.remark}</span>
                      <input className="ux-input zrv-hr-input" value={session.remark} maxLength={500} placeholder={T.placeholders.remark} onChange={(event) => setSession(key, { remark: event.target.value })} />
                    </label>
                  </div>
                  {mine.length > 0 && <p id={`ori-${key}-issue`} className={`zrv-hr-session__warn zrv-hr-is-${mine[0].level}`}>{mine[0].text}</p>}
                </article>
              )
            })}
          </div>
        </>}

        {step === 2 && <>
          <PanelHead n={3} {...T.heads[2]} />
          {timelineDays.length > 0 ? (
            <div className="zrv-hr-timeline" style={{ '--cols': timelineDays.length }} role="img"
              aria-label={`${T.timeline.label}: ${SESSION_KEYS.map((key) => `${T.sessions[key].short} ${sessions[key].fromDate ? shortDate(sessions[key].fromDate) : T.review.noDates}`).join(', ')}`}>
              <span className="zrv-hr-timeline__corner" style={{ gridRow: 1, gridColumn: 1 }} />
              {timelineDays.map((day, column) => (
                <span key={day} style={{ gridColumn: column + 2 }}
                  className={`zrv-hr-timeline__day${isWeekend(day) ? ' zrv-hr-is-weekend' : ''}${employee && day === employee.startDate ? ' zrv-hr-is-start' : ''}`}>
                  <b>{Number(day.slice(8))}</b><small>{weekday(day)}</small>
                </span>
              ))}
              {SESSION_KEYS.map((key, row) => {
                const session = sessions[key]
                const start = timelineDays.indexOf(session.fromDate)
                const end = timelineDays.indexOf(session.toDate)
                const visible = session.fromDate && session.toDate && start >= 0 && end >= start
                return [
                  <span key={`${key}-label`} className="zrv-hr-timeline__label" style={{ gridRow: row + 2 }}>{T.sessions[key].short}</span>,
                  ...timelineDays.map((day, column) => (
                    <span key={`${key}-${day}`} className={`zrv-hr-timeline__cell${isWeekend(day) ? ' zrv-hr-is-weekend' : ''}`} style={{ gridRow: row + 2, gridColumn: column + 2 }} />
                  )),
                  visible ? (
                    <span key={`${key}-bar`} className="zrv-hr-timeline__bar" style={{ gridRow: row + 2, gridColumn: `${start + 2} / ${end + 3}` }}>
                      {session.timeFrom && `${session.timeFrom}–${session.timeTo}`}
                    </span>
                  ) : null,
                ]
              })}
            </div>
          ) : <div className="zrv-hr-timeline__empty">{T.timeline.empty}</div>}
          <div className="zrv-hr-sep" />
          {issues.length ? (
            <ul className="zrv-hr-issues">
              {issues.map((issue) => <li key={issue.text} className={`zrv-hr-is-${issue.level}`}><OrvexaIcon name={issue.level === 'bad' ? 'x' : 'clock'} size={14} />{issue.text}</li>)}
            </ul>
          ) : <p className="zrv-hr-note">{planned ? T.noIssues : T.nothingYet}</p>}
          {errors.sessions && <p className="zrv-auth-field-error" role="alert">{errors.sessions}</p>}
        </>}

        {step === 3 && <>
          <PanelHead n={4} {...T.heads[3]} />
          <div className="zrv-hr-recap">
            <div><small>{T.recap.sessions}</small><b>{planned}<em>/{SESSION_KEYS.length}</em></b><span>{T.recap.incomplete(SESSION_KEYS.length - planned)}</span></div>
            <div><small>{T.recap.time}</small><b>{formatHours(hours)}</b><span>{T.recap.across}</span></div>
            <div><small>{T.recap.days}</small><b>{days || COMMON_TEXT.dash}</b><span>{form.fromDate ? `${shortDate(form.fromDate)} – ${toDate ? shortDate(toDate) : '…'}` : T.recap.noDates}</span></div>
          </div>
          <dl className="zrv-hr-review zrv-hr-mt zrv-hr-ori-review">
            {SESSION_KEYS.map((key) => {
              const session = sessions[key]
              return (
                <div key={key} className={isSessionComplete(session) ? 'zrv-hr-is-ok' : undefined}>
                  <dt>{T.sessions[key].short}</dt>
                  <dd>
                    {session.fromDate ? `${shortDate(session.fromDate)}${session.toDate && session.toDate !== session.fromDate ? ` – ${shortDate(session.toDate)}` : ''}` : T.review.noDates}
                    {' · '}{session.timeFrom ? `${session.timeFrom}–${session.timeTo}` : T.review.noTimes}
                    <small>{headName(key, session.headCode) || T.review.noHead}{session.remark ? ` · ${session.remark}` : ''}</small>
                  </dd>
                </div>
              )
            })}
          </dl>
        </>}
      </RecruitmentShell>

      {dialog === 'save' && (
        <ConfirmDialog title={T.saveTitle} description={T.saveBody} confirmLabel={T.primary} pending={editor.pending} feedback={editor.feedback}
          onConfirm={save} onClose={() => setDialog(null)}>
          <p className="zrv-admin-confirm">
            <b>{employee?.name}</b> · {employee?.position}<br />
            {shortDate(form.fromDate)} – {shortDate(toDate)} · {planned}/{SESSION_KEYS.length} · {formatHours(hours)}
          </p>
        </ConfirmDialog>
      )}
      {dialog === 'new' && <NewFormDialog onConfirm={() => { setDialog(null); startNew() }} onClose={() => setDialog(null)} />}
      {dialog === 'report' && (
        <ReportDialog title={T.reportTitle} resourceKey="hr-orientation-report" load={service.list} onClose={() => setDialog(null)}
          numberOf={(item) => item.scheduleNumber} statusOf={(item) => T.status[item.status]} pathOf={(item) => `${BASE}/${item.scheduleId}`}
          columns={[[T.reportColumns.employee, (item) => item.employeeName], [T.reportColumns.from, (item) => enDate(item.fromDate)], [T.reportColumns.to, (item) => enDate(item.toDate)]]} />
      )}
    </>
  )
}
