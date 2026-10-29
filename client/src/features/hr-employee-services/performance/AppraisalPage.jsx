import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { ConfirmDialog, ResourceState } from '@/features/security-administration/components/AdminUi.jsx'
import { fieldProps } from '@/features/security-administration/adminForms.js'
import { useResource } from '@/features/security-administration/useAdminData.js'
import { businessToday, enDate, initials } from '@/features/hr-recruitment/shared/hrFormat.js'
import { useRecruitmentForm } from '@/features/hr-recruitment/shared/useRecruitmentForm.js'
import { RecruitmentLoader } from '@/features/hr-recruitment/shared/components/RecruitmentLoader.jsx'
import { NewFormDialog, ReportDialog } from '@/features/hr-recruitment/shared/components/RecruitmentDialogs.jsx'
import { Orbit, PanelHead, Pill, RecruitmentShell, Ticket, Tilt } from '@/features/hr-recruitment/shared/components/RecruitmentShell.jsx'
import { HrField } from '@/features/hr-recruitment/shared/components/RecruitmentInputs.jsx'
import { APPRAISAL_TEXT as T, ES_COMMON_TEXT as C } from '../hrEmployeeServicesText.js'
import { employeeServicesDemo, hrEmployeeServices } from '../hrEmployeeServicesService.js'
import { ES_PATHS } from '../employeeServicesPaths.js'
import { NO_IDENTIFY, useEmployeeServicesUser } from '../shared/useEmployeeServicesUser.js'
import '@/styles/hr-employee-services.css'
import {
  EXPLANATION_MAX, GOALS_MAX, GOALS_MIN, GRADES, RATINGS, TEXT_MAX, TRAINING_MAX, appraisalPayload, appraisalResult, blankAppraisal, filledLines,
  isAppraisalLocked, missingExplanations, needsExplanation, ratedCount, validateAppraisal, yearsUntil,
} from './appraisalModel.js'

const BASE = ES_PATHS.appraisal
const service = hrEmployeeServices.appraisals
const loadLookups = (signal) => hrEmployeeServices.performance.lookups({ signal })
// Signature strokes for the two signature pads.
const INK = ['M6 30 C 18 6, 26 40, 36 20 S 52 8, 58 26 S 76 36, 84 14 S 104 30, 118 22 S 140 10, 150 28', 'M8 24 C 20 40, 30 4, 44 22 S 60 36, 70 16 S 92 8, 100 28 C 108 40, 126 6, 150 20']

export default function AppraisalPage() {
  useEmployeeServicesUser()
  return (
    <RecruitmentLoader current="appraisal" flow={false} identify={NO_IDENTIFY} breadcrumb={C.performanceBreadcrumb} demo={employeeServicesDemo}
      title={T.title} subtitle={T.subtitle} param="appraisalId" load={service.getById} loadLookups={loadLookups}>
      {({ lookups, record, editorKey }) => <AppraisalEditor key={editorKey} lookups={lookups} record={record} />}
    </RecruitmentLoader>
  )
}

const loadTeam = (periodCode) => (signal) => hrEmployeeServices.performance.team(periodCode, { signal })

// The team (and the appraiser) of the first review period loads before the form.
function AppraisalEditor({ lookups, record }) {
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
  const tabs = useRef({})
  const locked = isAppraisalLocked(saved?.status)
  const { criteria, scale, distribution, periods } = lookups
  // Another period loads its own team; until it is ready its employee list stays empty.
  const teamResource = useResource(`hr-appraisal-team:${form.periodCode}`, loadTeam(form.periodCode))
  const team = teamResource.status === 'ready' ? teamResource.data
    : form.periodCode === initialPeriod ? initialTeam : { appraiser: initialTeam.appraiser, members: [] }
  const teamNotice = teamResource.status === 'ready' || form.periodCode === initialPeriod ? null : (
    <ResourceState resource={teamResource} label={T.employeeStep.loadingTeam} empty={C.list.empty}>{() => null}</ResourceState>
  )
  const members = team.members
  const appraiser = saved?.appraiser ?? team.appraiser
  const employee = members.find((member) => member.employeeId === form.employeeId) ?? saved?.employee ?? null
  const period = periods.find((item) => item.code === form.periodCode) ?? periods[0]
  const today = businessToday()
  const result = appraisalResult(form, criteria, members, scale, distribution)
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
  const rate = (code, change) => { patch((state) => ({ ratings: { ...state.ratings, [code]: { rating: null, explanation: '', ...state.ratings[code], ...change } } })); clear(code) }
  const choosePeriod = (event) => { patch({ periodCode: event.target.value, employeeId: '' }); clear('employeeId') }
  const sign = (role) => { patch((state) => ({ signatures: { ...state.signatures, [role]: state.signatures[role] ? null : today } })); clear(role) }

  const check = (submit) => {
    const problems = validateAppraisal(form, { criteria, team: members, scale, distribution }, { submit })
    setErrors(Object.fromEntries(problems.map((problem) => [problem.field, messageOf(problem)])))
    if (!problems.length) return true
    if (problems.some((problem) => problem.field === 'goals' || problem.field === 'training')) setTab(problems.find((problem) => problem.field === 'goals') ? 'goals' : 'training')
    const criteriaProblems = problems.filter((problem) => criteria.some((item) => item.code === problem.field)).length
    const message = problems.length === 1 ? messageOf(problems[0]) : criteriaProblems ? T.errors.criteriaCount(criteriaProblems) : C.reviewProblems(problems.length)
    editor.reject(problems[0].step, message, problems.length === 1 ? [] : [...new Set(problems.map(messageOf))])
    return false
  }
  const save = () => {
    if (locked || !check(false)) return
    editor.perform(async ({ saved: keep }) => {
      const value = await service.save(editor.recordId, appraisalPayload(form, criteria))
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
      const draft = await service.save(editor.recordId, appraisalPayload(form, criteria))
      keep(draft)
      const value = await service.submit(draft.appraisalId)
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
    { icon: 'house', label: C.home, onClick: () => leave('/dashboard') },
    { icon: 'chart-column', label: T.tools.report, onClick: () => setDialog('report') },
    { icon: 'send', label: T.submit, onClick: requestSubmit, disabled: locked || editor.pending },
    { icon: 'save', label: C.save, onClick: save, disabled: locked || editor.pending },
    { icon: 'file-plus', label: T.tools.newAppraisal, onClick: () => leave(BASE) },
    { icon: 'printer', label: C.print, onClick: () => window.print() },
  ]
  const doneSteps = [Boolean(employee), result.complete && !unexplained.length, goals.length >= GOALS_MIN, Boolean(form.signatures.appraiser)]
  const years = (from) => (employee ? yearsUntil(from, period.to, today)?.toFixed(1) ?? '' : '')

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
    <RecruitmentShell current="appraisal" flow={false} compact breadcrumb={C.performanceBreadcrumb} demo={employeeServicesDemo} title={T.title} subtitle={T.subtitle}
      tools={tools} primary={{ label: T.save, icon: 'save', onClick: save }}
      feedback={editor.feedback} onDismissFeedback={editor.dismiss} lookupNotice={teamNotice} locked={locked} pending={editor.pending} focusError={editor.focusError}
      ticket={<Ticket avatar={initials(employee?.name)} code={T.formCode} items={[
        { k: T.ticket.number, v: saved?.appraisalNumber || T.ticket.onSave },
        { k: T.ticket.employee, v: employee?.name || C.notSelected, big: true },
        { k: T.ticket.period, v: `${enDate(period.from)} – ${enDate(period.to)}` },
        { k: T.ticket.appraiser, v: appraiser.name },
        { k: T.ticket.status, v: <Pill tone={status === 'DRAFT' ? 'warn' : 'ok'}>{C.status[status]}</Pill> },
      ]} />}
      steps={T.steps} step={step} onStep={setStep} doneSteps={doneSteps} finalLabel={T.submit} onFinal={requestSubmit}
      side={<>
        <Tilt aria-label={T.card.label}>
          <div className="zrv-hr-dark__top"><span className="zrv-hr-eyebrow">{T.card.label}</span><span className="zrv-hr-mono">{saved?.appraisalNumber || T.card.draft(form.periodCode)}</span></div>
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
        <PanelHead n={1} eyebrow={T.employeeStep.eyebrow} title={T.employeeStep.title} desc={T.employeeStep.desc} />
        <div className="zrv-hr-grid zrv-hr-is-2">
          <HrField id="ap-period" label={T.employeeStep.period}>
            <select id="ap-period" className="ux-select zrv-hr-input" value={form.periodCode} onChange={choosePeriod} disabled={Boolean(saved)}>
              {periods.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
            </select>
          </HrField>
          <HrField id="ap-employee" label={T.employeeStep.employee} required error={errors.employeeId}>
            <select {...fieldProps('ap-employee', { error: errors.employeeId })} className="ux-select zrv-hr-input" aria-required="true" disabled={Boolean(saved)}
              value={form.employeeId} onChange={setValue('employeeId')}>
              <option value="">{T.employeeStep.selectEmployee}</option>
              {members.map((member) => <option key={member.employeeId} value={member.employeeId}>{T.employeeStep.option(member.name, member.employeeNumber)}</option>)}
            </select>
          </HrField>
        </div>
        <div className="zrv-hr-grid zrv-hr-is-4 zrv-hr-mt">
          {[['employeeNumber', employee?.employeeNumber], ['jobTitle', employee?.jobTitle], ['grade', employee?.grade], ['company', employee?.companyName],
            ['department', employee?.departmentName], ['yearsCompany', years(employee?.joinedDate)], ['yearsPosition', years(employee?.positionDate)],
            ['appraiser', appraiser.name]].map(([key, value]) => (
            <HrField key={key} id={`ap-info-${key}`} label={T.employeeStep.info[key]}>
              <input id={`ap-info-${key}`} className="ux-input zrv-hr-input" readOnly value={value ?? ''} placeholder={C.fillsFromEmployee} />
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
        <PanelHead n={2} eyebrow={T.criteriaStep.eyebrow} title={T.criteriaStep.title} desc={T.criteriaStep.desc} />
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
        <PanelHead n={3} eyebrow={T.resultStep.eyebrow} title={T.resultStep.title} desc={T.resultStep.desc} />
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
            : listEditor('training', T.resultStep.training, TRAINING_MAX, 1, T.resultStep.trainingPlaceholder)}
        </div>
      </>}

      {step === 3 && <>
        <PanelHead n={4} eyebrow={T.meetingStep.eyebrow} title={T.meetingStep.title} desc={T.meetingStep.desc} />
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
          {[['employee', employee?.name || T.card.employee, T.meetingStep.employeeRole], ['appraiser', appraiser.name, T.meetingStep.appraiserRole]].map(([role, name, label], index) => {
            const date = form.signatures[role]
            return (
              <div key={role} className={`zrv-hr-sign${date ? ' zrv-hr-is-signed' : ''}${errors[role] ? ' zrv-hr-is-bad' : ''}`}>
                <div className="zrv-hr-sign__pad">{date ? <svg viewBox="0 0 160 44" aria-hidden="true"><path className="zrv-hr-ink" d={INK[index]} /></svg> : T.meetingStep.notSigned}</div>
                <b>{name}</b><small>{label}{date ? T.meetingStep.signedOn(enDate(date)) : ''}</small>
                <button type="button" className="btn-secondary zrv-hr-btn" aria-pressed={Boolean(date)} aria-invalid={Boolean(errors[role]) || undefined}
                  aria-describedby={errors[role] ? `ap-sign-${role}-error` : undefined} onClick={() => sign(role)}>
                  <OrvexaIcon name={date ? 'x' : 'pen-line'} size={15} /> {date ? T.meetingStep.unsign : T.meetingStep.sign}
                </button>
                {errors[role] && <small id={`ap-sign-${role}-error`} className="zrv-auth-field-error">{errors[role]}</small>}
              </div>
            )
          })}
        </div>
      </>}
    </RecruitmentShell>
    {dialog === 'submit' && (
      <ConfirmDialog title={T.confirm.title} confirmLabel={T.confirm.action} pending={editor.pending} onClose={() => setDialog(null)} onConfirm={submit}
        description={T.confirm.body(employee.name, period.label, average, result.band.grade, band.title, goals.length, Boolean(form.signatures.employee))} />
    )}
    {dialog === 'report' && (
      <ReportDialog title={T.report.title} resourceKey="hr-appraisal-report" load={(params, options) => service.list(options)} onClose={() => setDialog(null)}
        numberOf={(item) => item.appraisalNumber} statusOf={(item) => C.status[item.status]} pathOf={(item) => `${BASE}/${item.appraisalId}`}
        columns={[[T.report.columns.employee, (item) => item.employeeName], [T.report.columns.period, (item) => item.periodCode],
          [T.report.columns.rating, (item) => (item.rating === null ? '' : item.rating.toFixed(2))], [T.report.columns.grade, (item) => item.grade ?? '']]} />
    )}
    {dialog?.path && <NewFormDialog onConfirm={() => { const { path } = dialog; setDialog(null); navigate(path) }} onClose={() => setDialog(null)} />}
  </>
}
