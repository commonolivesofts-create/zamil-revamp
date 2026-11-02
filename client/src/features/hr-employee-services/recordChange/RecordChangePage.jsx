import { useState } from 'react'
import { useNavigate } from 'react-router'
import usePermissions from '@/features/access/usePermissions.js'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { ConfirmDialog } from '@/features/security-administration/components/AdminUi.jsx'
import { fieldProps } from '@/features/security-administration/adminForms.js'
import { businessToday, enDate, initials } from '@/features/hr-recruitment/shared/hrFormat.js'
import { useRecruitmentForm } from '@/features/hr-recruitment/shared/useRecruitmentForm.js'
import { RecruitmentLoader } from '@/features/hr-recruitment/shared/components/RecruitmentLoader.jsx'
import { NewFormDialog } from '@/features/hr-recruitment/shared/components/RecruitmentDialogs.jsx'
import { Orbit, PanelHead, Pill, RecruitmentShell, RouteCard, Ticket, Tilt } from '@/features/hr-recruitment/shared/components/RecruitmentShell.jsx'
import { FileDrop, HrField, Review } from '@/features/hr-recruitment/shared/components/RecruitmentInputs.jsx'
import { EmployeePicker } from '@/features/hr-recruitment/shared/components/EmployeePicker.jsx'
import { ES_COMMON_TEXT as C, RECORD_CHANGE_TEXT as T } from '../hrEmployeeServicesText.js'
import { hrEmployeeServices } from '../hrEmployeeServicesService.js'
import { ES_PATHS } from '../employeeServicesPaths.js'
import { hijriDate } from '../shared/esFormat.js'
import { ApprovalSigns, Counter } from '../shared/EmployeeServicesParts.jsx'
import { NO_IDENTIFY, useEmployeeServicesUser } from '../shared/useEmployeeServicesUser.js'
import {
  AMOUNT_MAX_LENGTH, FREE_TEXT_KEYS, GRADE_LEVEL_MAX, PAY_KEYS, TEXT_MAX, amountDelta, amountInput, blankRecordChange, changeTypes, changedKeys,
  counterState, effectiveBeforeStart, isRecordChangeLocked, recordChangePayload, recordTotal, revisedAfterPick, totalGoesDown, validateRecordChange,
} from './recordChangeModel.js'

const RECORD_CHANGE_BASE = ES_PATHS.recordChange
const service = hrEmployeeServices.recordChanges
const loadLookups = (signal) => service.getLookups({ signal })

// Revised values are edited as text: amounts as typed, codes as chosen.
const editable = (values) => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value === null ? '' : String(value)]))

export default function RecordChangePage() {
  useEmployeeServicesUser()
  return (
    <RecruitmentLoader current="record-change" flow={false} identify={NO_IDENTIFY} breadcrumb={C.breadcrumb}
      title={T.title} subtitle={T.subtitle} param="requestId" load={service.getById} loadLookups={loadLookups}>
      {({ lookups, record, editorKey }) => <RecordChangeEditor key={editorKey} lookups={lookups} record={record} />}
    </RecruitmentLoader>
  )
}

function messageOf({ field, code }) {
  if (PAY_KEYS.includes(field)) return code === 'required' ? T.errors.amount.required(T.items[field][0]) : T.errors.amount.amount
  return T.errors[field][code]
}

function RecordChangeEditor({ lookups, record }) {
  const navigate = useNavigate()
  const permissions = usePermissions()
  const editor = useRecruitmentForm({
    basePath: RECORD_CHANGE_BASE, idKey: 'requestId', record,
    initialForm: record ? {
      requestDate: record.requestDate, employee: record.employee, effectiveDate: record.effectiveDate ?? '', revised: editable(record.revised),
      currentFamilyStatus: record.currentFamilyStatus ?? record.employee.current.familyStatusCode ?? '',
      remarks: record.remarks, views: record.views, attachments: record.attachments,
    } : { ...blankRecordChange(businessToday()), employee: null },
  })
  const { form, set, patch, step, setStep } = editor
  const saved = editor.record
  const canSave = permissions.can(saved ? 'HR.PERSONNEL_RECORD_CHANGES:UPDATE' : 'HR.PERSONNEL_RECORD_CHANGES:CREATE')
  const [errors, setErrors] = useState({})
  const [dialog, setDialog] = useState(null)
  const employee = form.employee
  // The current record is the server snapshot; its family status is the editable legacy
  // OLD_MARITAL_STATUS input.
  const current = employee?.current ? { ...employee.current, familyStatusCode: form.currentFamilyStatus ?? '' } : null
  const revised = form.revised
  const positionOptions = [...lookups.positions]
  for (const candidate of [
    { code: current?.positionCode, name: current?.positionName },
    { code: revised?.positionCode, name: revised?.positionName },
  ]) {
    if (candidate.code && candidate.name && !positionOptions.some((item) => item.code === candidate.code)) positionOptions.push(candidate)
  }
  const options = { ...lookups, positions: positionOptions }
  const locked = isRecordChangeLocked(saved?.status) || !canSave
  const types = changeTypes(current, revised)
  const changed = changedKeys(current, revised)
  const totalNow = recordTotal(current)
  const totalRevised = recordTotal(revised)
  const status = saved?.status ?? 'NEW'
  const nameOf = (list, code) => options[list].find((item) => item.code === code)?.name ?? code ?? ''
  const label = { positionCode: 'positions', gradeCode: 'grades', levelCode: 'levels', familyStatusCode: 'familyStatuses' }
  // The picker lists each employee with position and section.
  const searchEmployees = async (search, options) => {
    const page = await service.searchEmployees(search, options)
    return { ...page, items: page.items.map((item) => ({ ...item, position: item.current.positionName || nameOf('positions', item.current.positionCode), section: item.sectionName })) }
  }
  const shown = (key, values) => (PAY_KEYS.includes(key) ? C.sr(values[key]) : FREE_TEXT_KEYS.includes(key) ? (values[key] || '—') : nameOf(label[key], values[key]))

  const clear = (...keys) => setErrors((value) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key))))
  const setText = (key) => (event) => { set(key)(event); clear(key) }
  const setRevised = (key, value) => { patch((state) => ({ revised: { ...state.revised, [key]: value } })); clear(key, 'revised') }
  // Legacy EMP_NO change: fills the current information and record, and the revised position and
  // family status; the revised amounts keep their values (0 on a new form).
  const pickEmployee = (person) => {
    patch((state) => ({ employee: person, revised: revisedAfterPick(state.revised, editable(person.current)), currentFamilyStatus: person.current.familyStatusCode ?? '' }))
    clear('employee', 'effectiveDate', 'revised', 'currentFamilyStatus')
  }

  const check = () => {
    const problems = validateRecordChange(form, employee)
    setErrors(Object.fromEntries(problems.map((problem) => [problem.field, messageOf(problem)])))
    if (!problems.length) return true
    // One problem: its message; several: a count with every message listed.
    editor.reject(problems[0].step, problems.length === 1 ? messageOf(problems[0]) : C.reviewProblems(problems.length),
      problems.length === 1 ? [] : problems.map((problem) => messageOf(problem)))
    return false
  }
  const save = () => {
    if (locked || !check()) return
    editor.perform(async ({ saved: keep }) => {
      const result = await service.save(editor.recordId, recordChangePayload(form, employee), employee)
      keep(result)
      return result
    }, { success: (result) => T.saved(result.requestNumber) })
  }
  const requestSubmit = () => {
    if (locked) return
    if (step !== 3) { setStep(3); return }
    if (check()) setDialog('submit')
  }
  const submit = () => {
    setDialog(null)
    editor.perform(async ({ saved: keep }) => {
      const draft = await service.save(editor.recordId, recordChangePayload(form, employee), employee)
      keep(draft)
      return draft
    }, { success: (result) => T.savedForReview(result.requestNumber) })
  }
  const leave = (path) => (editor.dirty && !locked ? setDialog({ path }) : navigate(path))

  const tools = [
    { icon: 'house', label: C.home, onClick: () => leave('/dashboard') },
    { icon: 'file-plus', label: T.tools.newRequest, onClick: () => leave(RECORD_CHANGE_BASE) },
    { icon: 'layers', label: T.tools.requests, onClick: () => leave(ES_PATHS.recordChangeRequests) },
    { icon: 'save', label: C.save, onClick: save, disabled: locked || editor.pending },
    { icon: 'printer', label: C.print, onClick: () => window.print() },
  ]
  const filled = [employee, form.effectiveDate, revised?.positionCode].filter(Boolean).length + (changed.length ? 1 : 0)
  const approvals = (saved?.approvals ?? [{ role: 'NOTED_BY', state: 'DRAFT' }, { role: 'APPROVED_BY', state: 'DRAFT' }])
    .map((item) => ({ key: item.role, name: T.approvers[item.role][0], role: T.approvers[item.role][1], state: item.state, date: item.date ? enDate(item.date) : null }))
  // Legacy status colours: APPROVED green, REJECTED red.
  const statusTone = status === 'REJECTED' ? 'bad' : status === 'APPROVED' || status === 'INPROCESS' ? 'ok' : 'warn'
  // ARB_DATE as saved (server computed); a new form shows today's.
  const hijri = saved?.arbDate || hijriDate(form.requestDate)

  const row = (key, index) => {
    const money = PAY_KEYS.includes(key)
    const [name, nameAr] = T.items[key]
    const id = `rc-${key}`
    const isChanged = changed.includes(key)
    const delta = money ? amountDelta(current[key], revised[key] || 0) : null
    return (
      <div key={key} className={`zrv-hr-es-row${isChanged ? ' zrv-hr-is-changed' : ''}${errors[key] ? ' zrv-hr-is-bad' : ''}`} style={{ '--i': index }}>
        <div className="zrv-hr-es-row__l">
          <label htmlFor={id}>{name}{!FREE_TEXT_KEYS.includes(key) && <i className="zrv-hr-req" aria-hidden="true">*</i>}</label>
          <small lang="ar" dir="rtl">{nameAr}{money ? ` / ${T.monthly}` : ''}</small>
        </div>
        <span className="zrv-hr-es-row__cur"><span className="zrv-hr-sr">{T.revisedStep.currentPrefix} </span>{shown(key, current)}</span>
        <OrvexaIcon name="arrow-right" size={15} className="zrv-hr-es-row__arrow" aria-hidden="true" />
        <div className="zrv-hr-es-row__in">
          {money ? (
            <><input {...fieldProps(id, { error: errors[key] })} className="ux-input zrv-hr-input" inputMode="decimal" autoComplete="off" aria-required="true"
              maxLength={AMOUNT_MAX_LENGTH} value={revised[key]} onChange={(event) => setRevised(key, amountInput(event.target.value))} /><span className="zrv-hr-es-suffix" aria-hidden="true">SR</span></>
          ) : FREE_TEXT_KEYS.includes(key) ? (
            <input {...fieldProps(id, { error: errors[key] })} className="ux-input zrv-hr-input" autoComplete="off" maxLength={GRADE_LEVEL_MAX}
              value={revised[key] ?? ''} onChange={(event) => setRevised(key, event.target.value)} />
          ) : (
            <select {...fieldProps(id, { error: errors[key] })} className="ux-select zrv-hr-input" aria-required
              disabled={locked}
              value={revised[key]} onChange={(event) => setRevised(key, event.target.value)}>
              <option value="">{C.select}</option>
              {options[label[key]].map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
            </select>
          )}
        </div>
        <span className={`zrv-hr-es-delta zrv-hr-is-${!isChanged ? 'same' : money ? (delta.amount > 0 ? 'up' : 'down') : 'changed'}`}>
          {!isChanged ? C.noChange : money ? `${C.signed(delta.amount)}${delta.percent === null ? '' : ` · ${C.signed(delta.percent)}%`}` : C.changed}
        </span>
        <button type="button" className="zrv-hr-es-reset" onClick={() => setRevised(key, String(current[key] ?? ''))} disabled={!isChanged && !errors[key]}
          title={C.resetTitle} aria-label={C.reset(name)}><OrvexaIcon name="rotate-ccw" size={14} /></button>
        {errors[key] && <small id={`${id}-error`} className="zrv-auth-field-error zrv-hr-es-row__err">{errors[key]}</small>}
      </div>
    )
  }

  return <>
    <RecruitmentShell current="record-change" flow={false} breadcrumb={C.breadcrumb} title={T.title} subtitle={T.subtitle}
      tools={tools} primary={{ label: T.submit, icon: 'save', onClick: requestSubmit, disabled: !canSave }}
      feedback={editor.feedback} onDismissFeedback={editor.dismiss} locked={locked} pending={editor.pending} focusError={editor.focusError}
      ticket={<Ticket avatar={initials(employee?.name)} code={T.formCode} items={[
        { k: T.ticket.ref, v: saved?.requestNumber || C.generated },
        { k: T.ticket.date, v: enDate(form.requestDate) },
        { k: T.ticket.hijri, v: <span lang="ar" dir="rtl">{hijri}</span> },
        { k: T.ticket.employee, v: employee?.name || C.notSelected, big: true },
        { k: T.ticket.status, v: <Pill tone={statusTone}>{C.status[status] ?? status}</Pill> },
      ]} />}
      banner={<PrintSheet employee={employee} current={current} revised={revised} form={form} saved={saved} status={status} hijri={hijri}
        approvals={approvals} shown={shown} totalNow={totalNow} totalRevised={totalRevised} />}
      steps={T.steps} step={step} onStep={setStep} doneSteps={[Boolean(employee && form.effectiveDate), changed.length > 0, true, locked]}
      finalLabel={T.submit} onFinal={requestSubmit}
      side={<>
        <Tilt aria-label={T.card.label}>
          <div className="zrv-hr-dark__top"><span className="zrv-hr-eyebrow">{T.card.label}</span><span className="zrv-hr-mono">{saved?.requestNumber || T.card.draft}</span></div>
          <div className="zrv-hr-dark__who"><span className="zrv-hr-dark__av">{initials(employee?.name)}</span><div>
            <h3 className="zrv-hr-dark__title">{employee?.name || T.card.employee}</h3>
            <div className="zrv-hr-dark__sub">{employee ? `#${employee.employeeNumber} · ${employee.departmentName}` : T.card.employeeHint}</div></div></div>
          <div className="zrv-hr-dark__badges">{types.length
            ? types.map((type) => <span key={type} className={type === 'SALARY_INCREASE' || type === 'POSITION' ? 'zrv-hr-is-solid' : undefined}>{T.changeTypes[type]}</span>)
            : <span>{T.card.noChanges}</span>}</div>
          <div className="zrv-hr-dark__grid">
            <div><small>{T.card.position}</small><b>{current ? (revised.positionCode !== current.positionCode ? `${shown('positionCode', current)} → ${shown('positionCode', revised)}` : shown('positionCode', current)) : '—'}</b></div>
            <div><small>{T.card.effective}</small><b>{form.effectiveDate ? enDate(form.effectiveDate) : '—'}</b></div>
            <div><small>{T.card.totalNow}</small><b>{current ? C.money(totalNow) : '—'}</b></div>
            <div><small>{T.card.totalRevised}</small><b>{revised ? C.money(totalRevised) : '—'}{revised && totalRevised !== totalNow && amountDelta(totalNow, totalRevised).percent !== null
              ? <em> {C.signed(amountDelta(totalNow, totalRevised).percent)}%</em> : null}</b></div>
          </div>
        </Tilt>
        <RouteCard title={T.routeTitle} steps={T.route} />
        <Orbit done={filled} total={4} hint={!employee ? T.orbit.chooseEmployee : !changed.length ? T.orbit.changeSomething : T.orbit.ready(changed.length)} />
      </>}
    >
      {step === 0 && <>
        <PanelHead n={1} eyebrow={T.employeeStep.eyebrow} title={T.employeeStep.title} desc={T.employeeStep.desc} />
        <div className="zrv-hr-es-bi"><span>{T.formTitleEn}</span><span lang="ar" dir="rtl">{T.formTitleAr}</span></div>
        <div className="zrv-hr-grid zrv-hr-is-2">
          <EmployeePicker id="rc-employee" label={T.employeeStep.employee} placeholder={T.employeeStep.employeePlaceholder} required value={employee} onPick={pickEmployee} error={errors.employee}
            searchService={searchEmployees} cacheKey="hr-service-employees" />
          <HrField id="rc-effective" label={T.employeeStep.effective} required error={errors.effectiveDate} hint={form.effectiveDate ? hijriDate(form.effectiveDate) : undefined}>
            <input {...fieldProps('rc-effective', { error: errors.effectiveDate, hint: hijriDate(form.effectiveDate) || undefined })} type="date" className="ux-input zrv-hr-input"
              aria-required="true" value={form.effectiveDate} onChange={setText('effectiveDate')} />
          </HrField>
        </div>
        {effectiveBeforeStart(form.effectiveDate, employee) && <p className="zrv-hr-note">{T.employeeStep.beforeStart}</p>}
        <h3 className="zrv-hr-subh">{T.employeeStep.currentInfo}</h3>
        <div className="zrv-hr-grid zrv-hr-is-3">
          {[['name', employee?.name], ['nationality', employee?.nationality], ['section', employee?.sectionName], ['department', employee?.departmentName],
            ['startDate', employee ? enDate(employee.startDate) : ''], ['position', current ? shown('positionCode', current) : '']].map(([key, value]) => (
            <HrField key={key} id={`rc-info-${key}`} label={T.employeeStep.info[key]}>
              <input id={`rc-info-${key}`} className="ux-input zrv-hr-input" readOnly value={value || ''} placeholder={C.fillsFromEmployee} />
            </HrField>
          ))}
        </div>
        {current && (
          <div className="zrv-hr-grid zrv-hr-is-3">
            <HrField id="rc-current-family" label={T.employeeStep.currentFamilyStatus} error={errors.currentFamilyStatus}>
              <select {...fieldProps('rc-current-family', { error: errors.currentFamilyStatus })} className="ux-select zrv-hr-input"
                value={form.currentFamilyStatus ?? ''} onChange={setText('currentFamilyStatus')}>
                <option value="">{C.select}</option>
                {options.familyStatuses.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
              </select>
            </HrField>
          </div>
        )}
        {current && (
          <div className="zrv-hr-es-curcard">
            <div className="zrv-hr-es-curcard__h"><b>{T.employeeStep.currentRecord}</b><span lang="ar" dir="rtl">{T.employeeStep.currentRecordAr}</span></div>
            <dl>
              {[...PAY_KEYS.map((key) => [T.items[key][0], C.sr(current[key])]), [T.items.gradeCode[0], shown('gradeCode', current)],
                [T.items.levelCode[0], shown('levelCode', current)], [T.items.familyStatusCode[0], shown('familyStatusCode', current)],
                [T.employeeStep.total, C.money(totalNow)]].map(([key, value]) => (
                <div key={key} className={key === T.employeeStep.total ? 'zrv-hr-is-total' : undefined}><dt>{key}</dt><dd>{value}</dd></div>
              ))}
            </dl>
          </div>
        )}
      </>}

      {step === 1 && <>
        <PanelHead n={2} eyebrow={T.revisedStep.eyebrow} title={T.revisedStep.title} desc={T.revisedStep.desc} />
        {!current ? (
          <button type="button" className="btn-secondary zrv-hr-btn" onClick={() => setStep(0)}><OrvexaIcon name="arrow-left" size={16} /> {C.chooseEmployeeFirst}</button>
        ) : <>
          <div className="zrv-hr-es-row zrv-hr-es-row--head" aria-hidden="true">{T.revisedStep.head.map((item, index) => <span key={index}>{item}</span>)}</div>
          <div className="zrv-hr-es-rows">
            {['positionCode', ...PAY_KEYS, 'gradeCode', 'levelCode', 'familyStatusCode'].map(row)}
          </div>
          <p className="zrv-admin-hint">{T.revisedStep.gradeLevelOptional}</p>
          <div className="zrv-hr-es-total">
            <span>{T.revisedStep.total}</span>
            <b>{C.money(totalNow)} <em>→</em> {C.money(totalRevised)}</b>
            <span className={`zrv-hr-es-delta zrv-hr-is-${totalRevised > totalNow ? 'up' : totalRevised < totalNow ? 'down' : 'same'}`}>
              {totalRevised === totalNow ? C.noChange : `${C.signed(totalRevised - totalNow)}${amountDelta(totalNow, totalRevised).percent === null ? '' : ` · ${C.signed(amountDelta(totalNow, totalRevised).percent)}%`}`}
            </span>
          </div>
          {errors.revised && <p className="zrv-auth-field-error" role="alert">{errors.revised}</p>}
          {totalGoesDown(current, revised) && <p className="zrv-hr-note">{T.revisedStep.lowerTotal}</p>}
        </>}
      </>}

      {step === 2 && <>
        <PanelHead n={3} eyebrow={T.remarksStep.eyebrow} title={T.remarksStep.title} desc={T.remarksStep.desc} />
        <div className="zrv-hr-grid">
          {[['remarks', T.remarksStep.remarks, T.remarksStep.remarksPlaceholder], ['views', T.remarksStep.views, T.remarksStep.viewsPlaceholder]].map(([key, text, placeholder]) => (
            <div key={key} className={`zrv-hr-field zrv-hr-is-wide${errors[key] ? ' zrv-hr-is-bad' : ''}`}>
              <div className="field zrv-admin-field">
                <label htmlFor={`rc-${key}`}>{text}</label>
                <textarea id={`rc-${key}`} className="ux-textarea zrv-hr-input" rows={4} value={form[key]} onChange={setText(key)} placeholder={placeholder}
                  aria-invalid={Boolean(errors[key])} aria-describedby={[errors[key] ? `rc-${key}-error` : null, `rc-${key}-count`].filter(Boolean).join(' ')} />
                <Counter id={`rc-${key}-count`} length={form[key].length} max={TEXT_MAX} state={counterState(form[key].length)} />
                {errors[key] && <small id={`rc-${key}-error`} className="zrv-auth-field-error">{errors[key]}</small>}
              </div>
            </div>
          ))}
        </div>
        <h3 className="zrv-hr-subh">{T.remarksStep.documents}</h3>
        <FileDrop files={form.attachments} onChange={set('attachments')} disabled />
        <p className="zrv-admin-hint">{C.uploadNote}</p>
      </>}

      {step === 3 && <>
        <PanelHead n={4} eyebrow={T.reviewStep.eyebrow} title={T.reviewStep.title} desc={T.reviewStep.desc} />
        {current ? <>
          <div className="zrv-hr-recap">
            <div><small>{T.reviewStep.changes}</small><b>{changed.length}</b><span>{types.map((type) => T.changeTypes[type]).join(', ') || T.reviewStep.noneYet}</span></div>
            <div><small>{T.reviewStep.total}</small><b>{C.money(totalRevised)}</b><span>{T.reviewStep.was(C.money(totalNow))}</span></div>
            <div><small>{T.reviewStep.effective}</small><b className="zrv-hr-es-sm">{form.effectiveDate ? enDate(form.effectiveDate) : '—'}</b><span lang="ar" dir="rtl">{hijriDate(form.effectiveDate)}</span></div>
          </div>
          <ul className="zrv-hr-es-changes zrv-hr-mt">
            {changed.map((key) => (
              <li key={key}><b>{T.items[key][0]}</b><span className="zrv-hr-es-old">{shown(key, current)}</span><OrvexaIcon name="arrow-right" size={14} aria-hidden="true" /><span className="zrv-hr-es-new">{PAY_KEYS.includes(key) ? C.sr(revised[key]) : shown(key, revised)}</span></li>
            ))}
            {!changed.length && <li className="zrv-hr-es-none">{T.reviewStep.noChanges}</li>}
          </ul>
          <div className="zrv-hr-sep" />
          <Review rows={[
            [T.reviewStep.employee, `${employee.employeeNumber} · ${employee.name}`, false],
            [T.reviewStep.remarks, form.remarks, !form.remarks.trim()],
            [T.reviewStep.views, form.views, !form.views.trim()],
            [T.reviewStep.documents, T.reviewStep.files(form.attachments.length), false],
          ]} />
          <ApprovalSigns items={approvals} />
        </> : <button type="button" className="btn-secondary zrv-hr-btn" onClick={() => setStep(0)}><OrvexaIcon name="arrow-left" size={16} /> {C.chooseEmployeeFirst}</button>}
      </>}
    </RecruitmentShell>
    {dialog === 'submit' && (
      <ConfirmDialog title={T.confirm.title} confirmLabel={T.confirm.action} pending={editor.pending} onClose={() => setDialog(null)} onConfirm={submit}
        description={T.confirm.body(employee.name, enDate(form.effectiveDate), types.map((type) => T.changeTypes[type]).join(', '), C.money(totalNow), C.money(totalRevised))} />
    )}
    {dialog?.path && <NewFormDialog onConfirm={() => { const { path } = dialog; setDialog(null); navigate(path) }} onClose={() => setDialog(null)} />}
  </>
}

// The legacy printout (window.print of form.php): the whole form on one page, whichever step is
// open. Hidden on screen.
function PrintSheet({ employee, current, revised, form, saved, status, hijri, approvals, shown, totalNow, totalRevised }) {
  const P = T.print
  const keys = ['positionCode', ...PAY_KEYS, 'gradeCode', 'levelCode', 'familyStatusCode']
  const value = (key, values) => (values ? (PAY_KEYS.includes(key) ? C.sr(values[key]) : shown(key, values)) : '')
  return (
    <section className="zrv-hr-es-print" aria-hidden="true">
      <header>
        <h2><span lang="ar" dir="rtl">{T.formTitleAr}</span><span>{P.title}</span></h2>
        <span>{P.status}: {C.status[status] ?? status}</span>
      </header>
      <table>
        <tbody>
          <tr><th>{P.date}</th><td>{enDate(form.requestDate)}</td><th>{P.ref}</th><td>{saved?.requestNumber || C.generated}</td><td lang="ar" dir="rtl">{hijri}</td><th lang="ar" dir="rtl">التاريخ</th></tr>
          <tr><th>{P.effective}</th><td colSpan={5}>{form.effectiveDate ? enDate(form.effectiveDate) : ''}</td></tr>
          <tr><th>{P.empNo}</th><td>{employee?.employeeNumber ?? ''}</td><th>{P.name}</th><td>{employee?.name ?? ''}</td><th>{P.nationality}</th><td>{employee?.nationality ?? ''}</td></tr>
          <tr><th>{P.section}</th><td>{employee?.sectionName ?? ''}</td><th>{P.department}</th><td>{employee?.departmentName ?? ''}</td><th>{P.startDate}</th><td>{employee?.startDate ? enDate(employee.startDate) : ''}</td></tr>
        </tbody>
      </table>
      <table>
        <thead><tr><th>{P.item}</th><th>{P.current}</th><th>{P.revised}</th></tr></thead>
        <tbody>
          {keys.map((key) => <tr key={key}><th>{T.items[key][0]} <span lang="ar" dir="rtl">{T.items[key][1]}</span></th><td>{value(key, current)}</td><td>{value(key, revised)}</td></tr>)}
          <tr><th>{P.total}</th><td>{current ? C.money(totalNow) : ''}</td><td>{revised ? C.money(totalRevised) : ''}</td></tr>
        </tbody>
      </table>
      <table>
        <tbody>
          <tr><th>{P.remarks}</th><td>{form.remarks}</td></tr>
          <tr><th>{P.views}</th><td>{form.views}</td></tr>
        </tbody>
      </table>
      <div className="zrv-hr-es-print__signs">
        {approvals.map((item) => (
          <p key={item.key}><b>{item.role} : {item.name}</b><span className={`zrv-hr-is-${item.state.toLowerCase()}`}>{item.state === 'DRAFT' ? '' : `${C.approval[item.state] ?? item.state} ${item.date ?? ''}`}</span></p>
        ))}
      </div>
    </section>
  )
}
