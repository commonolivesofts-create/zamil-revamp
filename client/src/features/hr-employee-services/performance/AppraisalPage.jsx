import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { ConfirmDialog, ResourceState } from '@/features/security-administration/components/AdminUi.jsx'
import { fieldProps } from '@/features/security-administration/adminForms.js'
import { useResource } from '@/features/security-administration/useAdminData.js'
import { businessToday, enDate, initials } from '@/features/hr-recruitment/shared/hrFormat.js'
import { useRecruitmentForm } from '@/features/hr-recruitment/shared/useRecruitmentForm.js'
import { RecruitmentLoader } from '@/features/hr-recruitment/shared/components/RecruitmentLoader.jsx'
import { NewFormDialog } from '@/features/hr-recruitment/shared/components/RecruitmentDialogs.jsx'
import { EmployeePicker } from '@/features/hr-recruitment/shared/components/EmployeePicker.jsx'
import { Orbit, Pill, RecruitmentShell, StepHead, Ticket, Tilt } from '@/features/hr-recruitment/shared/components/RecruitmentShell.jsx'
import { HrField } from '@/features/hr-recruitment/shared/components/RecruitmentInputs.jsx'
import { APPRAISAL_TEXT as EN_TEXT, APPRAISAL_TEXT_AR as AR_TEXT, ES_COMMON_TEXT as C } from '../hrEmployeeServicesText.js'
import { hrEmployeeServices } from '../hrEmployeeServicesService.js'
import { ES_PATHS } from '../employeeServicesPaths.js'
import { NO_IDENTIFY, useEmployeeServicesUser } from '../shared/useEmployeeServicesUser.js'
import { lockedStepsOf, problemsInStep } from '../shared/stepGating.js'
import '@/styles/hr-employee-services.css'
import {
  APPRAISAL_CRITERIA_AR, APPRAISAL_SCALE_AR,
  EXPLANATION_MAX, GOALS_MAX, GOALS_MIN, GRADES, RATINGS, TEXT_MAX, TRAINING_MAX, appraisalPayload, appraisalResult, blankAppraisal, filledLines,
  isAppraisalLocked, missingExplanations, needsExplanation, ratedCount, validateAppraisal, yearsUntil,
} from './appraisalModel.js'
import SignaturePad from './SignaturePad.jsx'

const BASE = ES_PATHS.appraisal
const service = hrEmployeeServices.appraisals
const loadLookups = (signal) => hrEmployeeServices.performance.lookups({ signal })

// A signature is stored as a drawn image with its date. Records made before
// signing on screen only hold a date string; both are read here.
const signatureOf = (value) => {
  if (!value) return { image: null, date: null }
  if (typeof value === 'string') {
    return value.startsWith('data:image')
      ? { image: value, date: null }
      : { image: null, date: value }
  }
  return { image: value.image ?? null, date: value.date ?? null }
}

export default function AppraisalPage() {
  useEmployeeServicesUser()
  const T = EN_TEXT
  return (
    <RecruitmentLoader current="appraisal" flow={false} identify={NO_IDENTIFY} breadcrumb={C.performanceBreadcrumb} demo={false}
      title={T.title} param="appraisalId" load={service.getById} loadLookups={loadLookups}>
      {({ lookups, record, editorKey }) => <AppraisalEditor key={editorKey} lookups={lookups} record={record} />}
    </RecruitmentLoader>
  )
}

const loadTeam = (periodCode) => (signal) => hrEmployeeServices.performance.team(periodCode, { signal })

// The team (and the appraiser) of the first review period loads before the form.
function AppraisalEditor({ lookups, record }) {
  const T = EN_TEXT
  const periodCode = record?.periodCode ?? lookups.periods[0].code
  const team = useResource(`hr-appraisal-team:${periodCode}`, loadTeam(periodCode))
  if (team.status !== 'ready') {
    return (
      <div className="zrv-hr zrv-hr--appraisal zrv-hr--compact">
        <div className="zrv-admin-panel"><ResourceState resource={team} label={T.employeeStep.loadingTeam} empty={C.list.empty}>{() => null}</ResourceState></div>
      </div>
    )
  }
  return <AppraisalForm lookups={lookups} record={record} initialTeam={team.data} initialPeriod={periodCode} />
}

function AppraisalForm({ lookups, record, initialTeam, initialPeriod }) {
  const navigate = useNavigate()
  const editor = useRecruitmentForm({
    basePath: BASE, idKey: 'appraisalId', record,
    initialForm: record ? {
      periodCode: record.periodCode, employeeId: record.employee.employeeId, ratings: record.ratings,
      goals: record.goals.length >= GOALS_MIN ? [...record.goals] : [...record.goals, ...Array(GOALS_MIN - record.goals.length).fill('')],
      training: record.training.length ? [...record.training] : [''], employeeRemarks: record.employeeRemarks, appraiserRemarks: record.appraiserRemarks,
      signatures: record.signatures,
    } : blankAppraisal(initialPeriod),
  })
  const { form, set, patch, step, setStep } = editor
  const saved = editor.record
  const [errors, setErrors] = useState({})
  const [dialog, setDialog] = useState(null)
  const [tab, setTab] = useState('goals')
  const [language, setLanguage] = useState('en')
  const tabs = useRef({})
  const locked = isAppraisalLocked(saved?.status)
  const T = language === 'ar' ? AR_TEXT : EN_TEXT
  const arabic = language === 'ar'
  const periods = lookups.periods
  const distribution = lookups.distribution
  const criteria = arabic
    ? lookups.criteria.map((item, index) => ({ ...item, label: APPRAISAL_CRITERIA_AR[index] ?? item.label }))
    : lookups.criteria
  const scale = arabic
    ? lookups.scale.map((item) => ({ ...item, ...APPRAISAL_SCALE_AR[item.grade] }))
    : lookups.scale
  // Another period loads its own team; until it is ready its employee list stays empty.
  const teamResource = useResource(`hr-appraisal-team:${form.periodCode}`, loadTeam(form.periodCode))
  const team = teamResource.status === 'ready' ? teamResource.data
    : form.periodCode === initialPeriod ? initialTeam : { appraiser: initialTeam.appraiser, members: [] }
  const teamNotice = teamResource.status === 'ready' || form.periodCode === initialPeriod ? null : (
    <ResourceState resource={teamResource} label={T.employeeStep.loadingTeam} empty={T.common.empty}>{() => null}</ResourceState>
  )
  const members = team.members
  const appraiser = saved?.appraiser ?? team.appraiser
  const selectedEmployee = members.find((member) => member.employeeId === form.employeeId) ?? null
  const employeeLookup = useResource(selectedEmployee && !saved
    ? `hr-appraisal-employee:${form.periodCode}:${selectedEmployee.employeeId}` : null,
  (signal) => hrEmployeeServices.performance.employee(selectedEmployee.name, form.periodCode, { signal }))
  const employee = saved?.employee ?? (employeeLookup.status === 'ready' ? employeeLookup.data : selectedEmployee)
  const period = periods.find((item) => item.code === form.periodCode) ?? periods[0]
  const today = businessToday()
  const result = appraisalResult(form, criteria, members, scale, distribution, lookups.gradeStats)
  const band = result.band ? scale.find((item) => item.grade === result.band.grade) : null
  const rated = ratedCount(form.ratings, criteria)
  const unexplained = missingExplanations(form.ratings, criteria)
  const goals = filledLines(form.goals)
  const training = filledLines(form.training)
  const status = saved?.status ?? 'DRAFT'
  const firstUnrated = criteria.find((item) => !RATINGS.includes(form.ratings[item.code]?.rating))
  const average = result.average === null ? '—' : result.average.toFixed(2)

  const messageOf = ({ field, code }) => {
    if (criteria.some((item) => item.code === field)) return T.errors.criterion[code]
    if (field === 'appraiserRemarks' && code === 'overQuota') return T.errors.appraiserRemarks.overQuota(result.band.grade, distribution[result.band.grade])
    return T.errors[field][code]
  }
  const clear = (...keys) => setErrors((value) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key))))
  const setValue = (key) => (eventOrValue) => { set(key)(eventOrValue); clear(key) }
  const searchEmployees = async (search) => {
    const term = String(search).trim().toLocaleLowerCase()
    const matches = term ? members.filter((member) => `${member.name} ${member.employeeNumber}`.toLocaleLowerCase().includes(term)) : members
    const items = matches.map((member) => ({ ...member, position: member.jobTitle, section: member.departmentName }))
    return { items, pagination: { page: 1, limit: items.length, total: items.length, totalPages: items.length ? 1 : 0, hasNextPage: false, hasPreviousPage: false } }
  }
  const pickEmployee = (person) => { setValue('employeeId')(person.employeeId); clear('employeeId') }
  const rate = (code, change) => { patch((state) => ({ ratings: { ...state.ratings, [code]: { rating: null, explanation: '', ...state.ratings[code], ...change } } })); clear(code) }
  const choosePeriod = (event) => { patch({ periodCode: event.target.value, employeeId: '' }); clear('employeeId') }
  const setSignature = (role, image) => {
    patch((state) => ({ signatures: { ...state.signatures, [role]: image ? { image, date: today } : null } }))
    clear(role)
  }

  const check = (submit) => {
    const validationTeam = employee?.personId ? members : members.filter((member) => member.employeeId !== form.employeeId)
    const problems = validateAppraisal(form, { criteria, team: validationTeam, scale, distribution }, { submit, appraiserSignature: false })
    setErrors(Object.fromEntries(problems.map((problem) => [problem.field, messageOf(problem)])))
    if (!problems.length) return true
    if (problems.some((problem) => problem.field === 'goals' || problem.field === 'training')) setTab(problems.find((problem) => problem.field === 'goals') ? 'goals' : 'training')
    editor.reject(problems[0].step)
    return false
  }
  // Continue checks the open step against the submission rules (the signature is
  // asked for on the last step, not to move between steps).
  const continueStep = () => {
    const validationTeam = employee?.personId ? members : members.filter((member) => member.employeeId !== form.employeeId)
    const problems = problemsInStep(validateAppraisal(form, { criteria, team: validationTeam, scale, distribution }, { submit: true, appraiserSignature: false }), step)
    setErrors(Object.fromEntries(problems.map((problem) => [problem.field, messageOf(problem)])))
    if (!problems.length) return true
    if (problems.some((problem) => problem.field === 'goals' || problem.field === 'training')) {
      setTab(problems.find((problem) => problem.field === 'goals') ? 'goals' : 'training')
    }
    editor.reject(step)
    return false
  }
  const save = () => {
    if (locked || !check(true)) return
    editor.perform(async ({ saved: keep }) => {
      const value = await service.save(editor.recordId, appraisalPayload(form, criteria), employee)
      keep(value)
      return value
    }, { success: (value) => T.saved(value.appraisalNumber) })
  }
  const requestSubmit = () => {
    if (!locked && check(true)) setDialog('submit')
  }
  const submit = () => {
    setDialog(null)
    editor.perform(async ({ saved: keep }) => {
      const value = await service.save(editor.recordId, appraisalPayload(form, criteria), employee)
      keep(value)
      return value
    }, { success: (value) => T.submitted(value.appraisalNumber) })
  }
  const leave = (path) => (editor.dirty && !locked ? setDialog({ path }) : navigate(path))
  const onTabKey = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const next = tab === 'goals' ? 'training' : 'goals'
    setTab(next)
    tabs.current[next]?.focus()
  }

  const tools = [
    { icon: 'house', label: T.common.home, onClick: () => leave('/dashboard') },
    { icon: 'chart-column', label: T.tools.report, onClick: () => leave(ES_PATHS.appraisalReport) },
    { icon: 'languages', label: arabic ? 'English' : 'العربية', onClick: () => setLanguage(arabic ? 'en' : 'ar') },
    { icon: 'send', label: T.submit, onClick: requestSubmit, disabled: locked || editor.pending },
    { icon: 'file-plus', label: T.tools.newAppraisal, onClick: () => leave(BASE) },
    { icon: 'printer', label: T.common.print, onClick: () => window.print() },
  ]
  const doneSteps = [Boolean(employee), result.complete && !unexplained.length, goals.length >= GOALS_MIN, Boolean(form.signatures.appraiser)]
  const lockedSteps = lockedStepsOf(doneSteps)
  const years = (from, serverValue) => (employee ? (serverValue ?? yearsUntil(from, period.to, today))?.toFixed(1) ?? '' : '')

  const listEditor = (key, label, max, min, placeholder) => {
    const items = form[key]
    const error = errors[key]
    return (
      <div className={`zrv-hr-es-lines${error ? ' zrv-hr-is-bad' : ''}`} role="group" aria-labelledby={`ap-${key}-label`}
        aria-describedby={error ? `ap-${key}-error` : undefined}>
        <span className="zrv-hr-label" id={`ap-${key}-label`}>{label}</span>
        {items.map((value, index) => (
          <div key={index} className="zrv-hr-es-line">
            <span className="zrv-hr-es-line__n" aria-hidden="true">{index + 1}</span>
            <input className="ux-input zrv-hr-input" value={value} placeholder={placeholder} maxLength={300} aria-label={T.resultStep.item(label, index + 1)}
              aria-invalid={Boolean(error) && !value.trim()} onChange={(event) => { setValue(key)(items.map((item, row) => (row === index ? event.target.value : item))) }} />
            <button type="button" className="zrv-hr-es-reset" aria-label={T.resultStep.remove(label, index + 1)} disabled={items.length <= min}
              onClick={() => setValue(key)(items.filter((_, row) => row !== index))}><OrvexaIcon name="trash-2" size={14} /></button>
          </div>
        ))}
        {items.length < max && (
          <button type="button" className="zrv-hr-es-add" onClick={() => setValue(key)([...items, ''])}><OrvexaIcon name="plus" size={14} /> {T.resultStep.add}</button>
        )}
        {error && <small id={`ap-${key}-error`} className="zrv-auth-field-error">{error}</small>}
      </div>
    )
  }

  return <>
    <RecruitmentShell current="appraisal" flow={false} compact breadcrumb={C.performanceBreadcrumb} demo={false} title={T.title}
      dir={arabic ? 'rtl' : undefined}
      tools={tools} primary={{ label: T.save, icon: 'save', onClick: save }}
      feedback={editor.feedback} onDismissFeedback={editor.dismiss} lookupNotice={teamNotice} locked={locked} pending={editor.pending} focusError={editor.focusError}
      ticket={<Ticket avatar={initials(employee?.name)} code={T.formCode} items={[
        { k: T.ticket.number, v: saved?.appraisalNumber || T.ticket.onSave },
        { k: T.ticket.employee, v: employee?.name || T.common.notSelected, big: true },
        { k: T.ticket.period, v: `${enDate(period.from)} – ${enDate(period.to)}` },
        { k: T.ticket.appraiser, v: appraiser.name },
        { k: T.ticket.status, v: <Pill tone={status === 'DRAFT' ? 'warn' : 'ok'}>{T.common.status[status]}</Pill> },
      ]} />}
      steps={T.steps.map(([name], index) => [name, index === 1 ? T.common.rated(rated, criteria.length) : doneSteps[index] ? T.common.done : T.common.open])}
      step={step} onStep={setStep} doneSteps={doneSteps} lockedSteps={lockedSteps} onContinue={continueStep} finalLabel={T.submit} onFinal={requestSubmit}
      side={<>
        <Tilt aria-label={T.card.label}>
          <div className="zrv-hr-dark__top"><span className="zrv-hr-mono">{saved?.appraisalNumber || T.card.draft(form.periodCode)}</span></div>
          <div className="zrv-hr-dark__who"><span className="zrv-hr-dark__av">{initials(employee?.name)}</span><div>
            <h3 className="zrv-hr-dark__title">{employee?.name || T.card.employee}</h3>
            <div className="zrv-hr-dark__sub">{employee ? `${employee.jobTitle} · ${employee.grade}` : T.card.employeeHint}</div></div></div>
          <div className="zrv-hr-es-score">
            <div className={`zrv-hr-es-grade zrv-hr-is-g${result.band?.grade ?? 'x'}`} role="img" aria-label={result.band ? T.card.grade(result.band.grade) : T.card.notGraded}>{result.band?.grade ?? '–'}</div>
            <div><small>{T.card.overall}</small><b>{average}<em>{T.card.of5}</em></b><span>{band ? band.title : T.card.rated(rated, criteria.length)}</span></div>
          </div>
          <div className="zrv-hr-bar zrv-hr-es-progress" aria-hidden="true"><i style={{ transform: `scaleX(${rated / criteria.length})` }} /></div>
          <div className="zrv-hr-es-dist" role="img" aria-label={`${T.card.distribution}: ${GRADES.map((grade) => `${grade} ${result.allocation[grade]}/${result.quotas[grade]}`).join(', ')}`}>
            {GRADES.map((grade) => (
              <div key={grade} className={`${result.band?.grade === grade && result.complete ? 'zrv-hr-is-mine' : ''}${result.allocation[grade] > result.quotas[grade] ? ' zrv-hr-is-over' : ''}`}>
                <span className="zrv-hr-es-dist__c"><i style={{ height: `${Math.min(100, (result.allocation[grade] / Math.max(result.quotas[grade], result.allocation[grade], 1)) * 100)}%` }} /></span>
                <b>{grade}</b><small>{result.allocation[grade]}/{result.quotas[grade]}</small>
              </div>
            ))}
          </div>
          <p className="zrv-hr-es-dist__n">{T.card.teamNote(members.length)}</p>
        </Tilt>
        <Orbit done={(employee ? 1 : 0) + rated + Math.min(goals.length, GOALS_MIN) + (form.signatures.appraiser ? 1 : 0)} total={1 + criteria.length + GOALS_MIN + 1}
          hint={!employee ? T.orbit.start : firstUnrated ? T.orbit.next(firstUnrated.label) : unexplained.length ? T.orbit.explain(unexplained.length)
            : goals.length < GOALS_MIN ? T.orbit.goals : !form.signatures.appraiser ? T.orbit.sign : T.orbit.ready} />
      </>}
    >
      {step === 0 && <>
        <StepHead title={T.employeeStep.title} desc={T.employeeStep.desc} />
        <div className="zrv-hr-grid zrv-hr-is-2">
          <HrField id="ap-period" label={T.employeeStep.period}>
            <select id="ap-period" className="ux-select zrv-hr-input" value={form.periodCode} onChange={choosePeriod} disabled={Boolean(saved)}>
              {periods.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
            </select>
          </HrField>
          <EmployeePicker id="ap-employee" label={T.employeeStep.employee} required tight value={employee} onPick={pickEmployee}
            error={errors.employeeId} disabled={Boolean(saved)} searchService={searchEmployees} cacheKey={`hr-appraisal-employees:${form.periodCode}`} />
          {selectedEmployee && employeeLookup.status !== 'ready' && <ResourceState resource={employeeLookup} label={T.employeeStep.loadingEmployee} empty={T.common.empty}>{() => null}</ResourceState>}
        </div>
        <div className="zrv-hr-grid zrv-hr-is-4 zrv-hr-mt">
          {[['employeeNumber', employee?.employeeNumber], ['jobTitle', employee?.jobTitle], ['grade', employee?.grade], ['company', employee?.companyName],
            ['department', employee?.departmentName], ['yearsCompany', years(employee?.joinedDate, employee?.yearsInCompany)], ['yearsPosition', years(employee?.positionDate, employee?.yearsInPosition)],
            ['appraiser', appraiser.name]].map(([key, value]) => (
            <HrField key={key} id={`ap-info-${key}`} label={T.employeeStep.info[key]}>
              <input id={`ap-info-${key}`} className="ux-input zrv-hr-input" readOnly value={value ?? ''} placeholder={T.common.fillsFromEmployee} />
            </HrField>
          ))}
        </div>
        <h3 className="zrv-hr-subh">{T.employeeStep.scale}</h3>
        <ul className="zrv-hr-es-scale">
          {scale.map((item) => (
            <li key={item.grade} className={`zrv-hr-is-g${item.grade}`}><span className="zrv-hr-es-range">{item.range}</span><b>{item.grade} · {item.title}</b><small>{item.description}</small></li>
          ))}
        </ul>
      </>}

      {step === 1 && <>
        <StepHead title={T.criteriaStep.title} desc={T.criteriaStep.desc} />
        <div className="zrv-hr-es-legend" aria-live="polite">
          <span>{T.criteriaStep.rated(rated, criteria.length)}</span><span>{T.criteriaStep.average} <b>{average}</b></span>
          {band && <span className={`zrv-hr-es-chip zrv-hr-is-g${band.grade}`}>{band.grade} · {band.title}</span>}
        </div>
        <div className="zrv-hr-rows">
          {criteria.map((item, index) => {
            const entry = form.ratings[item.code] ?? { rating: null, explanation: '' }
            const error = errors[item.code]
            const labelId = `ap-${item.code}-label`
            return (
              <div key={item.code} className={`zrv-hr-row${entry.rating ? ' zrv-hr-is-rated' : ''}${error ? ' zrv-hr-is-bad' : ''}`} style={{ '--i': index }}>
                <span className="zrv-hr-row__n" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <span className="zrv-hr-row__l" id={labelId}>{item.label}</span>
                <div className="zrv-hr-pips" role="radiogroup" aria-labelledby={labelId} aria-required="true" aria-invalid={error && !entry.rating ? true : undefined}
                  aria-describedby={error ? `ap-${item.code}-error` : undefined} data-val={entry.rating || 0}>
                  {RATINGS.map((n) => (
                    <label key={n}>
                      <input type="radio" name={`ap-${item.code}`} value={n} checked={entry.rating === n} onChange={() => rate(item.code, { rating: n })} aria-label={T.criteriaStep.of(n)} />
                      <span aria-hidden="true">{n}</span>
                    </label>
                  ))}
                </div>
                <input className="zrv-hr-row__rem" value={entry.explanation} maxLength={EXPLANATION_MAX} onChange={(event) => rate(item.code, { explanation: event.target.value })}
                  placeholder={needsExplanation(entry.rating) ? T.criteriaStep.explanationRequired : T.criteriaStep.explanation}
                  aria-label={T.criteriaStep.explanationFor(item.label)} aria-invalid={Boolean(error) && Boolean(entry.rating)}
                  aria-describedby={error ? `ap-${item.code}-error` : undefined} />
                {error && <small id={`ap-${item.code}-error`} className="zrv-auth-field-error zrv-hr-es-row-error">{error}</small>}
              </div>
            )
          })}
        </div>
      </>}

      {step === 2 && <>
        <StepHead title={T.resultStep.title} desc={T.resultStep.desc} />
        <div className="zrv-hr-es-result">
          <div className="zrv-hr-es-res"><small>{T.resultStep.rating}</small><b>{average}</b><span>{T.resultStep.criteria(rated, criteria.length)}</span></div>
          <div className={`zrv-hr-es-res zrv-hr-is-big zrv-hr-is-g${result.band?.grade ?? 'x'}`}><small>{T.resultStep.grade}</small><b>{result.band?.grade ?? '—'}</b><span>{band ? band.range : T.resultStep.notRated}</span></div>
          <div className="zrv-hr-es-res zrv-hr-is-wide"><small>{T.resultStep.description}</small><b className="zrv-hr-es-sm">{band ? band.title : '—'}</b><span>{band ? band.description : T.resultStep.rateFirst}</span></div>
        </div>
        <table className="zrv-hr-es-dtable zrv-hr-mt">
          <caption className="zrv-hr-sr">{T.resultStep.distribution}</caption>
          <thead><tr><th scope="col">{T.resultStep.team(members.length)}</th>{GRADES.map((grade) => <th key={grade} scope="col" className={result.band?.grade === grade ? 'zrv-hr-is-mine' : undefined}>{grade}</th>)}</tr></thead>
          <tbody>
            <tr><th scope="row">{T.resultStep.percentage}</th>{GRADES.map((grade) => <td key={grade}>{distribution[grade]}%</td>)}</tr>
            <tr><th scope="row">{T.resultStep.allowed}</th>{GRADES.map((grade) => <td key={grade}>{result.quotas[grade]}</td>)}</tr>
            <tr><th scope="row">{T.resultStep.allocated}</th>{GRADES.map((grade) => <td key={grade} className={result.allocation[grade] > result.quotas[grade] ? 'zrv-hr-is-over' : undefined}>{result.allocation[grade]}</td>)}</tr>
          </tbody>
        </table>
        {result.overQuota && <p className="zrv-hr-note" role="status">{T.resultStep.overQuota(result.band.grade, distribution[result.band.grade])}</p>}
        <div className="zrv-hr-es-tabs zrv-hr-mt" role="tablist" aria-label={T.resultStep.development}>
          {[['goals', T.resultStep.goalsTab(goals.length)], ['training', T.resultStep.trainingTab(training.length)]].map(([key, label]) => (
            <button key={key} ref={(node) => { tabs.current[key] = node }} type="button" role="tab" id={`ap-tab-${key}`} aria-selected={tab === key}
              aria-controls={`ap-panel-${key}`} tabIndex={tab === key ? 0 : -1} onClick={() => setTab(key)} onKeyDown={onTabKey}>{label}</button>
          ))}
        </div>
        <div role="tabpanel" id={`ap-panel-${tab}`} aria-labelledby={`ap-tab-${tab}`} className="zrv-hr-es-panel">
          {tab === 'goals'
            ? listEditor('goals', T.resultStep.goals, GOALS_MAX, GOALS_MIN, T.resultStep.goalsPlaceholder)
            : <>
              <p className="zrv-hr-note zrv-hr-es-tab-hint">{T.resultStep.trainingHint}</p>
              {listEditor('training', T.resultStep.training, TRAINING_MAX, 1, T.resultStep.trainingPlaceholder)}
            </>}
        </div>
      </>}

      {step === 3 && <>
        <StepHead title={T.meetingStep.title} desc={T.meetingStep.desc} />
        <p className="zrv-hr-es-ack">{T.meetingStep.acknowledgement}</p>
        <div className="zrv-hr-grid zrv-hr-is-2 zrv-hr-mt">
          <HrField id="ap-employee-remarks" label={T.meetingStep.employeeRemarks} error={errors.employeeRemarks}>
            <textarea {...fieldProps('ap-employee-remarks', { error: errors.employeeRemarks })} className="ux-textarea zrv-hr-input" maxLength={TEXT_MAX}
              value={form.employeeRemarks} onChange={setValue('employeeRemarks')} placeholder={T.meetingStep.employeeRemarksPlaceholder} />
          </HrField>
          <HrField id="ap-appraiser-remarks" label={T.meetingStep.appraiserRemarks} required={result.overQuota} error={errors.appraiserRemarks}>
            <textarea {...fieldProps('ap-appraiser-remarks', { error: errors.appraiserRemarks })} className="ux-textarea zrv-hr-input" maxLength={TEXT_MAX}
              aria-required={result.overQuota || undefined} value={form.appraiserRemarks} onChange={setValue('appraiserRemarks')} />
          </HrField>
        </div>
        <div className="zrv-hr-signs zrv-hr-mt">
          {[['employee', employee?.name || T.card.employee, T.meetingStep.employeeRole], ['appraiser', appraiser.name, T.meetingStep.appraiserRole]].map(([role, name, label]) => {
            const signature = signatureOf(form.signatures[role])
            const signed = Boolean(signature.image || signature.date)
            return (
              <div key={role} className={`zrv-hr-sign${signed ? ' zrv-hr-is-signed' : ''}${errors[role] ? ' zrv-hr-is-bad' : ''}`}>
                <SignaturePad id={`ap-sign-${role}`} label={`${label} — ${name}`} hint={T.meetingStep.signHint} clearLabel={T.meetingStep.clearSign}
                  value={signature.image} onChange={(image) => setSignature(role, image)} disabled={locked} />
                <b>{name}</b>
                <small>{label}{signature.date ? T.meetingStep.signedOn(enDate(signature.date)) : signature.image ? T.meetingStep.signedOn(enDate(today)) : ` · ${T.meetingStep.notSigned}`}</small>
                {errors[role] && <small id={`ap-sign-${role}-error`} className="zrv-auth-field-error" aria-invalid="true">{errors[role]}</small>}
              </div>
            )
          })}
        </div>
      </>}
    </RecruitmentShell>
    {dialog === 'submit' && (
      <ConfirmDialog title={T.confirm.title} confirmLabel={T.confirm.action} pending={editor.pending} onClose={() => setDialog(null)} onConfirm={submit}
        description={T.confirm.body(employee.name, period.label, average, result.band.grade, band.title, goals.length)} />
    )}
    {dialog?.path && <NewFormDialog onConfirm={() => { const { path } = dialog; setDialog(null); navigate(path) }} onClose={() => setDialog(null)} />}
  </>
}
