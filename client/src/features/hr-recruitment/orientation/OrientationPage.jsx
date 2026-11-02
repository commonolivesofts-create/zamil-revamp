import { useRef, useState } from 'react'
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

const BASE = '/hr/recruitment/orientation'
const service = hrRecruitmentServices.orientations
const shortDate = (iso) => (iso ? new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`)) : '')
const weekday = (iso) => new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))
const addDays = (iso, count) => {
  if (!iso) return ''
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + count)
  return date.toISOString().slice(0, 10)
}
const inclusiveDays = (from, to) => from && to && to >= from ? Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1 : 0
const isWeekend = (iso) => [5, 6].includes(new Date(`${iso}T00:00:00Z`).getUTCDay())
const emptyLine = (department, lineId = undefined) => ({ ...(lineId ? { lineId } : {}), department, departmentHead: '', fromDate: '', toDate: '', orientationDays: 0, timeFrom: '', timeTo: '', remarks: '' })
const emptyForm = () => ({ employee: null, flag: '', fromOrient: '', orientationBy: '', lines: [] })
const formFromRecord = (record) => ({
  employee: record.employee,
  flag: record.flag,
  fromOrient: record.fromDate,
  orientationBy: record.scheduledByName,
  lines: record.lines.map((line) => ({ ...line, remarks: line.remarks ?? '' })),
})

export default function OrientationPage() {
  return (
    <RecruitmentLoader current="orientation" title={T.title} subtitle={T.subtitle} param="scheduleId" load={service.getById} loadLookups={(signal) => service.getLookups({ signal })}>
      {({ lookups, record, editorKey }) => <OrientationEditor key={editorKey} lookups={lookups} record={record} />}
    </RecruitmentLoader>
  )
}

function OrientationEditor({ lookups, record: savedRecord }) {
  const navigate = useNavigate()
  const editor = useRecruitmentForm({ basePath: BASE, idKey: 'scheduleId', record: savedRecord, initialForm: savedRecord ? formFromRecord(savedRecord) : emptyForm() })
  const { form, record, step, setStep, patch } = editor
  const [employee, setEmployee] = useState(savedRecord?.employee ?? null)
  const [errors, setErrors] = useState({})
  const [dialog, setDialog] = useState(null)
  const [setupLoading, setSetupLoading] = useState(false)
  const [setupError, setSetupError] = useState('')
  const setupRequest = useRef(0)
  const managers = lookups.managers ?? []
  const lines = form.lines
  const toDate = lines.reduce((latest, line) => line.toDate && line.toDate > latest ? line.toDate : latest, '')
  const planned = lines.filter((line) => line.departmentHead && line.fromDate && line.toDate && line.timeFrom && line.timeTo).length
  const hours = lines.reduce((sum, line) => {
    if (!line.timeFrom || !line.timeTo || line.timeTo <= line.timeFrom) return sum
    const [fromHour, fromMinute] = line.timeFrom.split(':').map(Number)
    const [toHour, toMinute] = line.timeTo.split(':').map(Number)
    return sum + (toHour * 60 + toMinute - fromHour * 60 - fromMinute) / 60 * inclusiveDays(line.fromDate, line.toDate)
  }, 0)
  const days = inclusiveDays(form.fromOrient, toDate)
  const incomplete = lines.filter((line) => !line.departmentHead || !line.fromDate || !line.toDate || !line.timeFrom || !line.timeTo).length
  const status = record?.status ?? 'Draft'
  const timelineStart = form.fromOrient || employee?.startDate || ''
  const timelineDays = (() => {
    if (!timelineStart) return []
    const last = toDate && toDate > timelineStart ? toDate : addDays(timelineStart, 6)
    const count = Math.min(14, Math.max(7, inclusiveDays(timelineStart, last)))
    return Array.from({ length: count }, (_, index) => addDays(timelineStart, index))
  })()

  const updateLine = (index, changes) => patch((current) => ({ lines: current.lines.map((line, row) => row === index ? { ...line, ...changes } : line) }))
  const pickEmployee = async (picked) => {
    const requestId = ++setupRequest.current
    setEmployee(picked)
    setSetupError('')
    setSetupLoading(true)
    try {
      const setup = await service.employeeSetup(picked.employeeNumber)
      if (requestId !== setupRequest.current) return
      setEmployee(setup.employee)
      patch((current) => ({
        employee: setup.employee,
        flag: setup.flag,
        fromOrient: current.fromOrient || setup.employee.startDate,
        lines: setup.departments.map((department) => emptyLine(department)),
      }))
      setErrors({})
    } catch (error) {
      if (requestId !== setupRequest.current) return
      setSetupError(error?.message || 'Unable to load employee orientation details.')
      patch({ employee: null, lines: [] })
      setEmployee(null)
    } finally {
      if (requestId === setupRequest.current) setSetupLoading(false)
    }
  }
  const setDate = (index, key, value) => {
    const line = lines[index]
    const next = { [key]: value }
    if (key === 'fromDate' && line.toDate && line.toDate < value) next.toDate = value
    const start = key === 'fromDate' ? value : line.fromDate
    const end = next.toDate ?? (key === 'toDate' ? value : line.toDate)
    next.orientationDays = inclusiveDays(start, end)
    updateLine(index, next)
  }
  const reportLoad = (params, options) => service.list({ ...params, flag: record?.flag || form.flag || 'Y' }, options)
  const startNew = () => navigate(BASE)
  const requestSave = () => {
    const nextErrors = {}
    if (!employee) nextErrors.employee = T.errors.employee
    if (!form.fromOrient) nextErrors.fromOrient = T.errors.from
    if (!lines.length) nextErrors.lines = 'Select an employee to load the required orientation departments.'
    if (lines.some((line) => !line.departmentHead || !line.fromDate || !line.toDate || !line.timeFrom || !line.timeTo)) nextErrors.lines = 'Complete each department head, date, and time field.'
    if (lines.some((line) => !line.orientationDays || line.toDate < line.fromDate || line.timeTo <= line.timeFrom)) nextErrors.lines = 'Check each line’s date range and ensure the end time is after the start time.'
    if (!toDate || (form.fromOrient && toDate < form.fromOrient) || lines.some((line) => line.fromDate < form.fromOrient || line.toDate > toDate)) nextErrors.lines = 'Each department schedule must fall within the orientation window.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      editor.reject(nextErrors.employee || nextErrors.fromOrient ? 0 : 1, `${T.errors.cannotSave} ${Object.values(nextErrors)[0]}`)
      return
    }
    setDialog('save')
  }
  const save = () => editor.perform(async ({ saved }) => {
    const payload = {
      employee, flag: form.flag, fromOrient: form.fromOrient, toOrient: toDate, orientationBy: form.orientationBy,
      lines: lines.map((line) => ({ ...line, orientationDays: inclusiveDays(line.fromDate, line.toDate) })),
    }
    const result = await service.save(editor.recordId, payload)
    saved(result)
    return result
  }, { success: (result) => T.saved(result.scheduleNumber) }).then((outcome) => {
    if (outcome.status === 'success') setDialog(null)
  })

  const tools = [
    { icon: 'save', label: COMMON_TEXT.save, onClick: requestSave, disabled: editor.pending || setupLoading },
    { icon: 'printer', label: COMMON_TEXT.print, onClick: () => window.print() },
    { icon: 'chart-column', label: COMMON_TEXT.report, onClick: () => setDialog('report'), disabled: !(record?.flag || form.flag) },
    { icon: 'file-plus', label: COMMON_TEXT.requestForm, onClick: () => (editor.dirty ? setDialog('new') : startNew()) },
    { icon: 'house', label: COMMON_TEXT.home, onClick: () => navigate('/dashboard') },
  ]
  const employeeFields = [
    [T.labels.type, employee?.employmentType], [T.labels.startDate, employee && enDate(employee.startDate)], [T.labels.section, employee?.section],
    [T.labels.division, employee?.division], [T.labels.position, employee?.position], [T.labels.status, T.status[status] ?? status],
  ]

  return (
    <>
      <RecruitmentShell current="orientation" title={T.title} subtitle={T.subtitle} demo={false}
        flowStatus={record ? `${record.scheduleNumber} · ${record.status}` : null}
        tools={tools} primary={{ label: T.primary, icon: 'save', onClick: requestSave }}
        feedback={editor.feedback} onDismissFeedback={editor.dismiss} pending={editor.pending || setupLoading} focusError={editor.focusError}
        ticket={<Ticket avatar={initials(employee?.name)} code={T.code} items={[
          { k: T.ticket.number, v: record?.scheduleNumber || T.ticket.numberPending }, { k: T.ticket.name, v: employee?.name || T.ticket.notSelected, big: true },
          { k: T.ticket.type, v: employee?.employmentType || COMMON_TEXT.dash }, { k: T.ticket.startDate, v: employee ? enDate(employee.startDate) : COMMON_TEXT.dash },
          { k: T.ticket.scheduledBy, v: record?.scheduledByName || T.ticket.pending }, { k: T.ticket.status, v: <Pill tone={record ? 'ok' : 'warn'}>{record?.status ?? 'Draft'}</Pill> },
        ]} />}
        steps={T.steps} step={step} onStep={setStep} doneSteps={[Boolean(employee && form.fromOrient), planned === lines.length && lines.length > 0, planned > 0, Boolean(record)]}
        finalLabel={T.final} onFinal={requestSave}
        side={<>
          <Tilt aria-label={T.card.label}>
            <div className="zrv-hr-dark__top"><span className="zrv-hr-eyebrow">{T.card.eyebrow}</span><span className="zrv-hr-mono">{record?.scheduleNumber || T.card.draft}</span></div>
            <div className="zrv-hr-dark__who"><span className="zrv-hr-dark__av" aria-hidden="true">{initials(employee?.name)}</span><div>
              <h3 className={`zrv-hr-dark__title${employee ? '' : ' zrv-hr-is-empty'}`}>{employee?.name || T.card.newJoiner}</h3>
              <div className={`zrv-hr-dark__sub${employee ? '' : ' zrv-hr-is-empty'}`}>{employee ? `${employee.position} · ${employee.section}` : T.card.subtitle}</div>
            </div></div>
            <div className="zrv-hr-dark__badges">{employee ? <><span className="zrv-hr-is-solid">{employee.division}</span><span>{employee.employmentType}</span><span>{T.card.joins(shortDate(employee.startDate))}</span></> : <span>{T.card.draftBadge}</span>}</div>
            <div className="zrv-hr-dark__grid"><div><small>{T.card.orientation}</small><b>{form.fromOrient ? shortDate(form.fromOrient) : COMMON_TEXT.dash}{toDate ? ` – ${shortDate(toDate)}` : ''}</b></div>
              <div><small>{T.card.time}</small><b>{hours.toFixed(1)} h</b></div><div><small>{T.card.sessions}</small><b>{planned}<em>/{lines.length}</em></b><div className="zrv-hr-bar"><i style={{ transform: `scaleX(${lines.length ? planned / lines.length : 0})` }} /></div></div>
              <div><small>{T.card.issues}</small><b>{errors.lines ? 'Check lines' : incomplete ? `${incomplete} incomplete` : lines.length ? T.card.none : COMMON_TEXT.dash}</b></div></div>
          </Tilt>
          <Orbit done={Number(Boolean(employee)) + Number(Boolean(form.fromOrient)) + planned} total={lines.length + 2}
            hint={errors.lines || (lines.length ? `${planned} of ${lines.length} departments completed.` : 'Choose an employee to load orientation departments.')} />
        </>}
      >
        {step === 0 && <>
          <PanelHead n={1} {...T.heads[0]} />
          <EmployeePicker id="ori-name" label={T.labels.name} required value={employee} onPick={pickEmployee} error={errors.employee}
            searchService={(query) => ({ items: lookups.employees.filter((item) => `${item.name} ${item.employeeNumber}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())) })} />
          {setupError && <p className="zrv-auth-field-error" role="alert">{setupError}</p>}
          <div className="zrv-hr-grid zrv-hr-is-3 zrv-hr-mt">{employeeFields.map(([label, value]) => {
            const id = `ori-${label.replace(/\W+/g, '-').toLowerCase()}`
            return <HrField key={label} id={id} label={label}><input id={id} className="ux-input zrv-hr-input" readOnly value={value || ''} placeholder={T.placeholders.fromEmployee} /></HrField>
          })}</div>
          <h3 className="zrv-hr-subh">{T.window}</h3>
          <div className="zrv-hr-grid zrv-hr-is-3">
            <HrField id="ori-from" label={T.labels.from} required error={errors.fromOrient}><input {...fieldProps('ori-from', { error: errors.fromOrient })} type="date" className="ux-input zrv-hr-input" value={form.fromOrient} onChange={(event) => { patch({ fromOrient: event.target.value }); setErrors((prev) => ({ ...prev, fromOrient: '' })) }} /></HrField>
            <HrField id="ori-to" label={T.labels.to} required hint="Calculated from the latest department end date"><input id="ori-to" className="ux-input zrv-hr-input" readOnly value={toDate ? enDate(toDate) : ''} placeholder={COMMON_TEXT.dash} /></HrField>
            <HrField id="ori-by" label={T.labels.scheduledBy}><input id="ori-by" className="ux-input zrv-hr-input" readOnly value={record?.scheduledByName ?? ''} placeholder={T.ticket.pending} /></HrField>
          </div>
        </>}

        {step === 1 && <>
          <PanelHead n={2} {...T.heads[1]} />
          {!employee && <p className="zrv-hr-note">Choose an employee in step 1 to load the departments from the server.</p>}
          {lines.length > 0 && <div className="zrv-hr-benefits">{lines.map((line, index) => {
            const complete = Boolean(line.departmentHead && line.fromDate && line.toDate && line.timeFrom && line.timeTo)
            const titleId = `ori-line-${index}-title`
            return <article key={`${line.department}-${index}`} style={{ '--i': index }} className={`zrv-hr-benefit zrv-hr-session${complete ? ' zrv-hr-is-done' : ''}`}>
              <div className="zrv-hr-benefit__h"><span className="zrv-hr-bubble"><OrvexaIcon name="users" size={17} /></span><b id={titleId}>{line.department}</b>
                <span className="zrv-hr-session__calc"><span>{T.days(inclusiveDays(line.fromDate, line.toDate))}</span><span>{line.timeFrom && line.timeTo ? `${line.timeFrom}–${line.timeTo}` : '—'}</span></span><span className="zrv-hr-benefit__ok" aria-hidden="true"><OrvexaIcon name="check" size={12} /></span></div>
              <div className="zrv-hr-session__grid" role="group" aria-labelledby={titleId}>
                <label className="zrv-hr-session__f zrv-hr-is-wide"><span>{T.labels.head}</span><select className="ux-select zrv-hr-input" value={line.departmentHead} onChange={(event) => updateLine(index, { departmentHead: event.target.value })}>
                  <option value="">{T.placeholders.head}</option>{managers.map((head) => <option key={`${head.employeeNumber}-${head.name}`} value={head.name}>{head.name}</option>)}
                </select></label>
                <label className="zrv-hr-session__f"><span>{T.labels.sessionFrom}</span><input type="date" className="ux-input zrv-hr-input" value={line.fromDate} min={form.fromOrient || undefined} onChange={(event) => setDate(index, 'fromDate', event.target.value)} /></label>
                <label className="zrv-hr-session__f"><span>{T.labels.sessionTo}</span><input type="date" className="ux-input zrv-hr-input" value={line.toDate} min={line.fromDate || form.fromOrient || undefined} onChange={(event) => setDate(index, 'toDate', event.target.value)} /></label>
                <label className="zrv-hr-session__f"><span>{T.labels.timeFrom}</span><input type="time" className="ux-input zrv-hr-input" value={line.timeFrom} onChange={(event) => updateLine(index, { timeFrom: event.target.value })} /></label>
                <label className="zrv-hr-session__f"><span>{T.labels.timeTo}</span><input type="time" className="ux-input zrv-hr-input" value={line.timeTo} min={line.timeFrom || undefined} onChange={(event) => updateLine(index, { timeTo: event.target.value })} /></label>
                <label className="zrv-hr-session__f zrv-hr-is-full"><span>{T.labels.remark}</span><input className="ux-input zrv-hr-input" value={line.remarks} maxLength={500} placeholder={T.placeholders.remark} onChange={(event) => updateLine(index, { remarks: event.target.value })} /></label>
              </div>
            </article>
          })}</div>}
          {errors.lines && <p className="zrv-auth-field-error" role="alert">{errors.lines}</p>}
        </>}

        {step === 2 && <>
          <PanelHead n={3} {...T.heads[2]} />
          {timelineDays.length ? <div className="zrv-hr-timeline" style={{ '--cols': timelineDays.length }} role="img" aria-label="Orientation department schedule timeline">
            <span className="zrv-hr-timeline__corner" style={{ gridRow: 1, gridColumn: 1 }} />
            {timelineDays.map((day, column) => <span key={day} style={{ gridColumn: column + 2 }} className={`zrv-hr-timeline__day${isWeekend(day) ? ' zrv-hr-is-weekend' : ''}${employee && day === employee.startDate ? ' zrv-hr-is-start' : ''}`}><b>{Number(day.slice(8))}</b><small>{weekday(day)}</small></span>)}
            {lines.map((line, row) => {
              const start = timelineDays.indexOf(line.fromDate)
              const end = timelineDays.indexOf(line.toDate)
              const visible = line.fromDate && line.toDate && start >= 0 && end >= start
              return [<span key={`label-${row}`} className="zrv-hr-timeline__label" style={{ gridRow: row + 2 }}>{line.department}</span>, ...timelineDays.map((day, column) => <span key={`${row}-${day}`} className={`zrv-hr-timeline__cell${isWeekend(day) ? ' zrv-hr-is-weekend' : ''}`} style={{ gridRow: row + 2, gridColumn: column + 2 }} />), visible && <span key={`bar-${row}`} className="zrv-hr-timeline__bar" style={{ gridRow: row + 2, gridColumn: `${start + 2} / ${end + 3}` }}>{line.timeFrom && `${line.timeFrom}–${line.timeTo}`}</span>]
            })}
          </div> : <div className="zrv-hr-timeline__empty">Choose an employee to view its departments.</div>}
          <div className="zrv-hr-sep" />
          {lines.length ? <ul className="zrv-hr-issues">{lines.filter((line) => !line.departmentHead || !line.fromDate || !line.toDate || !line.timeFrom || !line.timeTo).map((line) => <li key={line.department} className="zrv-hr-is-warn"><OrvexaIcon name="clock" size={14} />{line.department}: complete all required fields.</li>)}</ul> : <p className="zrv-hr-note">Nothing to review until an employee is selected.</p>}
        </>}

        {step === 3 && <>
          <PanelHead n={4} {...T.heads[3]} />
          <div className="zrv-hr-recap"><div><small>{T.recap.sessions}</small><b>{planned}<em>/{lines.length}</em></b><span>{T.recap.incomplete(incomplete)}</span></div><div><small>{T.recap.time}</small><b>{hours.toFixed(1)} h</b><span>{T.recap.across}</span></div><div><small>{T.recap.days}</small><b>{days || COMMON_TEXT.dash}</b><span>{form.fromOrient ? `${shortDate(form.fromOrient)} – ${toDate ? shortDate(toDate) : '…'}` : T.recap.noDates}</span></div></div>
          <dl className="zrv-hr-review zrv-hr-mt zrv-hr-ori-review">{lines.map((line) => <div key={line.department} className={line.departmentHead && line.fromDate && line.toDate && line.timeFrom && line.timeTo ? 'zrv-hr-is-ok' : undefined}>
            <dt>{line.department}</dt><dd>{line.fromDate ? `${shortDate(line.fromDate)}${line.toDate && line.toDate !== line.fromDate ? ` – ${shortDate(line.toDate)}` : ''}` : 'No dates'}{' · '}{line.timeFrom ? `${line.timeFrom}–${line.timeTo}` : 'no times'}<small>{line.departmentHead || 'No department head'}{line.remarks ? ` · ${line.remarks}` : ''}</small></dd>
          </div>)}</dl>
          {errors.lines && <p className="zrv-auth-field-error" role="alert">{errors.lines}</p>}
        </>}
      </RecruitmentShell>

      {dialog === 'save' && <ConfirmDialog title={T.saveTitle} description="Save this orientation training as a draft? It can be edited later." confirmLabel={T.primary} pending={editor.pending} feedback={editor.feedback} onConfirm={save} onClose={() => setDialog(null)}>
        <p className="zrv-admin-confirm"><b>{employee?.name}</b> · {employee?.position}<br />{shortDate(form.fromOrient)} – {shortDate(toDate)} · {planned}/{lines.length} departments</p>
      </ConfirmDialog>}
      {dialog === 'new' && <NewFormDialog onConfirm={() => { setDialog(null); startNew() }} onClose={() => setDialog(null)} />}
      {dialog === 'report' && <ReportDialog title={T.reportTitle} resourceKey="hr-orientation-report" load={reportLoad} onClose={() => setDialog(null)}
        numberOf={(item) => item.scheduleNumber} statusOf={(item) => item.status} pathOf={(item) => `${BASE}/${item.scheduleId}`}
        columns={[[T.reportColumns.employee, (item) => item.employeeName], [T.reportColumns.from, (item) => enDate(item.fromDate)], [T.reportColumns.to, (item) => enDate(item.toDate)]]} />}
    </>
  )
}
