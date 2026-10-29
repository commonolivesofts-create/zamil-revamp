import { useState } from 'react'
import { useNavigate } from 'react-router'
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
import { employeeServicesDemo, hrEmployeeServices } from '../hrEmployeeServicesService.js'
import { ES_PATHS } from '../employeeServicesPaths.js'
import { hijriDate } from '../shared/esFormat.js'
import { ApprovalSigns, Counter } from '../shared/EmployeeServicesParts.jsx'
import { NO_IDENTIFY, useEmployeeServicesUser } from '../shared/useEmployeeServicesUser.js'
import {
  PAY_KEYS, TEXT_MAX, amountDelta, blankRecordChange, changeTypes, changedKeys, counterState, isRecordChangeLocked, recordChangePayload, recordTotal,
  totalGoesDown, validateRecordChange,
} from './recordChangeModel.js'

const RECORD_CHANGE_BASE = ES_PATHS.recordChange
const service = hrEmployeeServices.recordChanges
const loadLookups = (signal) => hrEmployeeServices.lookups.get({ signal })

// Revised values are edited as text: amounts as typed, codes as chosen.
const editable = (values) => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value === null ? '' : String(value)]))

export default function RecordChangePage() {
  useEmployeeServicesUser()
  return (
    <RecruitmentLoader current="record-change" flow={false} identify={NO_IDENTIFY} breadcrumb={C.breadcrumb} demo={employeeServicesDemo}
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
  const editor = useRecruitmentForm({
    basePath: RECORD_CHANGE_BASE, idKey: 'requestId', record,
    initialForm: record ? {
      requestDate: record.requestDate, employee: record.employee, effectiveDate: record.effectiveDate ?? '', revised: editable(record.revised),
      remarks: record.remarks, views: record.views, attachments: record.attachments,
    } : { ...blankRecordChange(businessToday()), employee: null },
  })
  const { form, set, patch, step, setStep } = editor
  const saved = editor.record
  const [errors, setErrors] = useState({})
  const [dialog, setDialog] = useState(null)
  const employee = form.employee
  const current = employee?.current ?? null
  const revised = form.revised
  const locked = isRecordChangeLocked(saved?.status)
  const types = changeTypes(current, revised)
  const changed = changedKeys(current, revised)
  const totalNow = recordTotal(current)
  const totalRevised = recordTotal(revised)
  const status = saved?.status ?? 'NEW'
  const nameOf = (list, code) => lookups[list].find((item) => item.code === code)?.name ?? code ?? ''
  const label = { positionCode: 'positions', gradeCode: 'grades', levelCode: 'levels', familyStatusCode: 'familyStatuses' }
  // The picker lists each employee with position and section.
  const searchEmployees = async (search, options) => {
    const page = await hrEmployeeServices.employees.search(search, options)
    return { ...page, items: page.items.map((item) => ({ ...item, position: nameOf('positions', item.current.positionCode), section: item.sectionName })) }
  }
  const shown = (key, values) => (PAY_KEYS.includes(key) ? C.sr(values[key]) : nameOf(label[key], values[key]))

  const clear = (...keys) => setErrors((value) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key))))
  const setText = (key) => (event) => { set(key)(event); clear(key) }
  const setRevised = (key, value) => { patch((state) => ({ revised: { ...state.revised, [key]: value } })); clear(key, 'revised') }
  const pickEmployee = (person) => { patch({ employee: person, revised: editable(person.current) }); clear('employee', 'effectiveDate', 'revised') }

  const check = (submit) => {
    const problems = validateRecordChange(form, employee, { submit })
    setErrors(Object.fromEntries(problems.map((problem) => [problem.field, messageOf(problem)])))
    if (!problems.length) return true
    // One problem: its message; several: a count with every message listed.
    editor.reject(problems[0].step, problems.length === 1 ? messageOf(problems[0]) : C.reviewProblems(problems.length),
      problems.length === 1 ? [] : problems.map((problem) => messageOf(problem)))
    return false
  }
  const save = () => {
    if (locked || !check(false)) return
    editor.perform(async ({ saved: keep }) => {
      const result = await service.save(editor.recordId, recordChangePayload(form, employee))
      keep(result)
      return result
    }, { success: (result) => T.saved(result.requestNumber) })
  }
  const requestSubmit = () => {
    if (locked) return
    if (step !== 3) { setStep(3); return }
    if (check(true)) setDialog('submit')
  }
  const submit = () => {
    setDialog(null)
    editor.perform(async ({ saved: keep }) => {
      const draft = await service.save(editor.recordId, recordChangePayload(form, employee))
      keep(draft)
      const result = await service.submit(draft.requestId)
      keep(result)
      return result
    }, { success: (result) => T.submitted(result.requestNumber) })
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
    .map((item) => ({ key: item.role, name: T.approvers[item.role][0], role: T.approvers[item.role][1], state: item.state }))

  const row = (key, index) => {
    const money = PAY_KEYS.includes(key)
    const [name, nameAr] = T.items[key]
    const id = `rc-${key}`
    const isChanged = changed.includes(key)
    const delta = money ? amountDelta(current[key], revised[key] || 0) : null
    return (
      <div key={key} className={`zrv-hr-es-row${isChanged ? ' zrv-hr-is-changed' : ''}${errors[key] ? ' zrv-hr-is-bad' : ''}`} style={{ '--i': index }}>
        <div className="zrv-hr-es-row__l">
          <label htmlFor={id}>{name}{key === 'positionCode' && <i className="zrv-hr-req" aria-hidden="true">*</i>}</label>
          <small lang="ar" dir="rtl">{nameAr}{money ? ` / ${T.monthly}` : ''}</small>
        </div>
        <span className="zrv-hr-es-row__cur"><span className="zrv-hr-sr">{T.revisedStep.currentPrefix} </span>{shown(key, current)}</span>
        <OrvexaIcon name="arrow-right" size={15} className="zrv-hr-es-row__arrow" aria-hidden="true" />
        <div className="zrv-hr-es-row__in">
          {money ? (
            <><input {...fieldProps(id, { error: errors[key] })} className="ux-input zrv-hr-input" inputMode="decimal" autoComplete="off" aria-required="true"
              value={revised[key]} onChange={(event) => setRevised(key, event.target.value.replace(/[^\d.]/g, ''))} /><span className="zrv-hr-es-suffix" aria-hidden="true">SR</span></>
          ) : (
            <select {...fieldProps(id, { error: errors[key] })} className="ux-select zrv-hr-input" aria-required={key === 'positionCode' || undefined}
              value={revised[key]} onChange={(event) => setRevised(key, event.target.value)}>
              <option value="">{C.select}</option>
              {lookups[label[key]].map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
            </select>
          )}
        </div>
        <span className={`zrv-hr-es-delta zrv-hr-is-${!isChanged ? 'same' : money ? (delta.amount > 0 ? 'up' : 'down') : 'changed'}`}>
          {!isChanged ? C.noChange : money ? `${C.signed(delta.amount)}${delta.percent === null ? '' : ` · ${C.signed(delta.percent)}%`}` : C.changed}
        </span>
        <button type="button" className="zrv-hr-es-reset" onClick={() => setRevised(key, String(current[key]))} disabled={!isChanged && !errors[key]}
          title={C.resetTitle} aria-label={C.reset(name)}><OrvexaIcon name="rotate-ccw" size={14} /></button>
        {errors[key] && <small id={`${id}-error`} className="zrv-auth-field-error zrv-hr-es-row__err">{errors[key]}</small>}
      </div>
    )
  }

  return <>
    <RecruitmentShell current="record-change" flow={false} breadcrumb={C.breadcrumb} demo={employeeServicesDemo} title={T.title} subtitle={T.subtitle}
      tools={tools} primary={{ label: T.submit, icon: 'send', onClick: requestSubmit }}
      feedback={editor.feedback} onDismissFeedback={editor.dismiss} locked={locked} pending={editor.pending} focusError={editor.focusError}
      ticket={<Ticket avatar={initials(employee?.name)} code={T.formCode} items={[
        { k: T.ticket.ref, v: saved?.requestNumber || C.generated },
        { k: T.ticket.date, v: enDate(form.requestDate) },
        { k: T.ticket.hijri, v: <span lang="ar" dir="rtl">{hijriDate(form.requestDate)}</span> },
        { k: T.ticket.employee, v: employee?.name || C.notSelected, big: true },
        { k: T.ticket.status, v: <Pill tone={status === 'NEW' || status === 'DRAFT' ? 'warn' : 'ok'}>{C.status[status]}</Pill> },
      ]} />}
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
          <EmployeePicker id="rc-employee" label={T.employeeStep.employee} required value={employee} onPick={pickEmployee} error={errors.employee}
            searchService={searchEmployees} cacheKey="hr-service-employees" />
          <HrField id="rc-effective" label={T.employeeStep.effective} required error={errors.effectiveDate} hint={form.effectiveDate ? hijriDate(form.effectiveDate) : undefined}>
            <input {...fieldProps('rc-effective', { error: errors.effectiveDate, hint: hijriDate(form.effectiveDate) || undefined })} type="date" className="ux-input zrv-hr-input"
              aria-required="true" min={employee?.startDate} value={form.effectiveDate} onChange={setText('effectiveDate')} />
          </HrField>
        </div>
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
        <FileDrop files={form.attachments} onChange={set('attachments')} disabled={locked || editor.pending} />
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
