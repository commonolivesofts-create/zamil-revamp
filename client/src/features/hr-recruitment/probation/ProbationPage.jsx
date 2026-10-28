import { useState } from 'react'
import { useNavigate } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { ConfirmDialog } from '@/features/security-administration/components/AdminUi.jsx'
import { fieldProps } from '@/features/security-administration/adminForms.js'
import { COMMON_TEXT, PROBATION_TEXT as T } from '../hrRecruitmentText.js'
import { hrRecruitmentDemo, hrRecruitmentServices } from '../hrRecruitmentService.js'
import { businessToday, daysBetween, enDate, initials } from '../shared/hrFormat.js'
import { useRecruitmentForm } from '../shared/useRecruitmentForm.js'
import { RecruitmentLoader } from '../shared/components/RecruitmentLoader.jsx'
import { NewFormDialog, ReportDialog } from '../shared/components/RecruitmentDialogs.jsx'
import { Orbit, PanelHead, Pill, RecruitmentShell, Ticket, Tilt } from '../shared/components/RecruitmentShell.jsx'
import { HrField, RadioCards } from '../shared/components/RecruitmentInputs.jsx'
import { EmployeePicker } from '../shared/components/EmployeePicker.jsx'
import { Gauge } from '../interview/Scores.jsx'
import {
  EXTENSIONS, PASS_MARK, QUICK_PICKS, blankProbation, clampPoints, contradictsResult, evaluationTotals, isProbationLocked, probationElapsed,
  probationEnd, probationFormFromRecord, probationPayload, quickPoints, ratingFor, resultFor, suggestedRecommendation, validateProbation,
  withEmployee, withFormType,
} from './probationModel.js'

const BASE = '/hr/recruitment/probation-evaluation'
const service = hrRecruitmentServices.probations
const GAUGE_BANDS = Object.freeze([Object.freeze([0, 'NOT_ACCEPTABLE']), Object.freeze([PASS_MARK, 'ACCEPTABLE']), Object.freeze([91, 'OUTSTANDING'])])
const RECOMMENDATION_ICONS = Object.freeze({ CONFIRM: ['circle-check', null], EXTEND: ['clock', 'hold'], END: ['x', 'fail'] })
// Decorative pen strokes for a recorded signature.
const INK = Object.freeze([
  'M6 30 C 18 6, 26 40, 36 20 S 52 8, 58 26 S 76 36, 84 14 S 104 30, 118 22 S 140 10, 150 28',
  'M8 24 C 20 40, 30 4, 44 22 S 60 36, 70 16 S 92 8, 100 28 C 108 40, 126 6, 150 20',
])

export default function ProbationPage() {
  return (
    <RecruitmentLoader current="probation" demo={hrRecruitmentDemo} title={T.title} subtitle={T.subtitle} param="evaluationId" load={service.getById}>
      {({ lookups, record, editorKey }) => <ProbationEditor key={editorKey} lookups={lookups} record={record} />}
    </RecruitmentLoader>
  )
}

function ProbationEditor({ lookups, record: savedRecord }) {
  const navigate = useNavigate()
  const today = businessToday()
  const { formTypes, ratingScale } = lookups.probation
  const editor = useRecruitmentForm({
    basePath: BASE, idKey: 'evaluationId', record: savedRecord,
    initialForm: savedRecord ? probationFormFromRecord(savedRecord) : blankProbation(),
  })
  const { form, record, step, setStep, patch } = editor
  const [employee, setEmployee] = useState(savedRecord?.employee ?? null)
  const [errors, setErrors] = useState({})
  const [dialog, setDialog] = useState(null)
  const locked = isProbationLocked(record?.status)
  const formType = formTypes.find((type) => type.code === form.formTypeCode) ?? null
  const criteria = formType?.criteria ?? []
  const totals = evaluationTotals(criteria, form.scores)
  const rating = ratingFor(totals.percent, ratingScale)
  const suggested = suggestedRecommendation(totals)
  const contradicts = contradictsResult(form.recommendation, totals)
  const endDate = employee ? probationEnd(employee.startDate, form.recommendation, form.extendBy) : ''
  const daysLeft = daysBetween(today, endDate)
  const elapsed = employee ? probationElapsed(employee.startDate, endDate, today) : 0
  const usualType = employee && form.formTypeCode && employee.evaluationFormCode && employee.evaluationFormCode !== form.formTypeCode && !Object.keys(form.scores).length
    ? formTypes.find((type) => type.code === employee.evaluationFormCode) : null
  const status = record?.status ?? 'NEW'
  const doneSteps = [Boolean(form.formTypeCode && form.fromDate && form.toDate && form.employeeId), totals.complete, Boolean(form.recommendation), Boolean(form.signatures.evaluator)]
  const filled = [form.formTypeCode, form.fromDate, form.toDate, form.employeeId].filter(Boolean).length + totals.scored + (form.recommendation ? 1 : 0) + (form.signatures.evaluator ? 1 : 0)
  const preparedBy = record?.preparedByName

  const clear = (...keys) => setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !keys.includes(key))))
  const set = (key) => (eventOrValue) => { editor.set(key)(eventOrValue); clear(key) }
  const pickEmployee = (picked) => {
    setEmployee(picked)
    patch((current) => withEmployee(current, picked))
    clear('employeeId', 'formTypeCode', 'fromDate', 'toDate')
  }
  const pickType = (code) => { patch((current) => withFormType(current, code)); clear('formTypeCode') }
  const score = (criterion, value) => {
    patch((current) => ({ scores: { ...current.scores, [criterion.code]: clampPoints(value, criterion.points) } }))
    clear(`criterion:${criterion.code}`)
  }
  const sign = (key) => {
    patch((current) => ({ signatures: { ...current.signatures, [key]: current.signatures[key] ? null : new Date().toISOString() } }))
    if (key === 'evaluator') clear('evaluatorSignature')
  }

  const validate = (submit) => {
    const result = validateProbation(form, { employee, criteria }, { submit })
    setErrors(result.errors)
    if (!result.valid) {
      const messages = Object.values(result.errors)
      editor.reject(result.firstStep, messages.length === 1 ? messages[0] : T.errors.count(messages.length))
    }
    return result.valid
  }
  const saveRecord = async ({ saved }) => {
    const result = await service.save(editor.recordId, probationPayload(form))
    saved(result)
    return result
  }
  const save = () => {
    if (locked) return editor.showProblem(T.locked)
    if (validate(false)) editor.perform(saveRecord, { success: (result) => T.saved(result.evaluationNumber) })
  }
  const requestSubmit = () => {
    if (locked) return editor.showProblem(T.locked)
    if (validate(true)) setDialog('submit')
  }
  const submit = () => editor.perform(async (context) => {
    const draft = await saveRecord(context)
    const result = await service.submit(draft.evaluationId)
    context.saved(result)
    return result
  }, { success: (result) => T.submitted(result.evaluationNumber) }).then((outcome) => {
    if (outcome.status === 'success') setDialog(null)
  })
  const startNew = () => navigate(BASE)

  const tools = [
    { icon: 'send', label: COMMON_TEXT.submit, onClick: requestSubmit, disabled: locked || editor.pending },
    { icon: 'save', label: COMMON_TEXT.save, onClick: save, disabled: locked || editor.pending },
    { icon: 'printer', label: COMMON_TEXT.print, onClick: () => window.print() },
    { icon: 'chart-column', label: COMMON_TEXT.report, onClick: () => setDialog('report') },
    { icon: 'file-plus', label: COMMON_TEXT.requestForm, onClick: () => (editor.dirty ? setDialog('new') : startNew()) },
    { icon: 'house', label: COMMON_TEXT.home, onClick: () => navigate('/dashboard') },
  ]
  const readOnly = (id, label, value) => (
    <HrField id={id} label={label}><input id={id} className="ux-input zrv-hr-input" readOnly value={value || ''} placeholder={T.placeholders.fromEmployee} /></HrField>
  )

  return (
    <>
      <RecruitmentShell
        current="probation" title={T.title} subtitle={T.subtitle} demo={hrRecruitmentDemo}
        flowStatus={record ? `${record.evaluationNumber} · ${T.status[record.status]}` : null}
        tools={tools} primary={{ label: T.primary, icon: 'save', onClick: save }}
        feedback={editor.feedback} onDismissFeedback={editor.dismiss} locked={locked} pending={editor.pending} focusError={editor.focusError}
        ticket={<Ticket avatar={initials(employee?.name)} code={T.code} items={[
          { k: T.ticket.number, v: record?.evaluationNumber || T.ticket.numberPending },
          { k: T.ticket.employee, v: employee?.name || T.ticket.notSelected, big: true },
          { k: T.ticket.formType, v: formType?.name || COMMON_TEXT.dash },
          { k: T.ticket.preparedBy, v: preparedBy || T.ticket.pending },
          { k: T.ticket.status, v: <Pill tone={record?.status === 'SUBMITTED' ? 'ok' : 'warn'}>{T.status[status]}</Pill> },
        ]} />}
        steps={T.steps} step={step} onStep={setStep} doneSteps={doneSteps} finalLabel={T.final} onFinal={requestSubmit}
        side={<>
          <Tilt aria-label={T.card.label}>
            <div className="zrv-hr-dark__top"><span className="zrv-hr-eyebrow">{T.card.eyebrow}</span><span className="zrv-hr-mono">{employee ? `#${employee.employeeNumber}` : T.card.draft}</span></div>
            <div className="zrv-hr-dark__who">
              <span className="zrv-hr-dark__av" aria-hidden="true">{initials(employee?.name)}</span>
              <div>
                <h3 className={`zrv-hr-dark__title${employee ? '' : ' zrv-hr-is-empty'}`}>{employee?.name || T.card.employee}</h3>
                <div className={`zrv-hr-dark__sub${employee ? '' : ' zrv-hr-is-empty'}`}>{employee ? `${employee.position} · ${employee.grade}` : T.card.subtitle}</div>
              </div>
            </div>
            <div className="zrv-hr-dark__badges">
              {totals.complete
                ? <span className={`zrv-hr-is-solid${totals.acceptable ? '' : ' zrv-hr-is-failed'}`}>{T.result[resultFor(totals.percent)]}</span>
                : <span>{T.card.notScored}</span>}
              {formType && <span>{formType.name}</span>}
              {employee && <span>{employee.departmentName}</span>}
            </div>
            <div className="zrv-hr-probation-time" role="group" aria-label={T.card.timeline}>
              <div className="zrv-hr-probation-time__h"><small>{T.card.probation}</small><b>{employee && daysLeft !== null ? T.card.left(daysLeft) : COMMON_TEXT.dash}</b></div>
              <div className="zrv-hr-probation-time__bar"><i style={{ transform: `scaleX(${elapsed})` }} /><em style={{ left: `${(elapsed * 100).toFixed(1)}%` }} /></div>
              <div className="zrv-hr-probation-time__k"><span>{employee ? enDate(employee.startDate) : T.card.joining}</span><span>{endDate ? enDate(endDate) : T.card.end}</span></div>
            </div>
          </Tilt>
          <section className="zrv-hr-scorecard zrv-hr-card">
            <Gauge total={totals.total} max={100} bands={GAUGE_BANDS} rated={totals.scored} count={criteria.length || 1} labels={T.gauge} />
            <p className="zrv-hr-probation-mark">{T.passMark(PASS_MARK, totals.scored && rating ? rating.label : COMMON_TEXT.dash)}</p>
          </section>
          <Orbit done={filled} total={4 + Math.max(criteria.length, 1) + 2}
            hint={doneSteps.every(Boolean) ? T.orbitReady : COMMON_TEXT.stillOpen(T.steps.filter((_, index) => !doneSteps[index]).map(([name]) => name))} />
        </>}
      >
        {step === 0 && <>
          <PanelHead n={1} {...T.heads[0]} />
          <div className="zrv-hr-official">
            <span>{T.officialEn}</span>
            <span lang="ar" dir="rtl">{T.officialAr}</span>
          </div>
          <EmployeePicker id="pa-emp" label={T.labels.employee} required value={employee} onPick={pickEmployee} error={errors.employeeId} />
          <div className="zrv-hr-mt">
            <RadioCards name="pa-type" label={T.labels.formType} value={form.formTypeCode} onChange={pickType} error={errors.formTypeCode} variant="type"
              options={formTypes.map((type) => ({ value: type.code, title: type.name, desc: type.nameAr, lang: 'ar', meta: T.criteriaCount(type.criteria.length) }))} />
          </div>
          {usualType && <p className="zrv-hr-note zrv-hr-reveal">{T.usualType(employee.name, usualType.name)}</p>}
          <div className="zrv-hr-sep" />
          <div className="zrv-hr-grid zrv-hr-is-3">
            {readOnly('pa-no', T.labels.employeeNumber, employee?.employeeNumber)}
            {readOnly('pa-join', T.labels.joining, employee && enDate(employee.startDate))}
            {readOnly('pa-title', T.labels.jobTitle, employee?.position)}
            {readOnly('pa-grade', T.labels.grade, employee?.grade)}
            {readOnly('pa-dept', T.labels.department, employee?.departmentName)}
          </div>
          <h3 className="zrv-hr-subh">{T.period}</h3>
          <div className="zrv-hr-grid zrv-hr-is-3">
            <HrField id="pa-from" label={T.labels.from} required error={errors.fromDate}>
              <input {...fieldProps('pa-from', { error: errors.fromDate })} type="date" className="ux-input zrv-hr-input" value={form.fromDate} onChange={set('fromDate')} aria-required="true" />
            </HrField>
            <HrField id="pa-to" label={T.labels.to} required error={errors.toDate}>
              <input {...fieldProps('pa-to', { error: errors.toDate })} type="date" className="ux-input zrv-hr-input" value={form.toDate} onChange={set('toDate')} aria-required="true" />
            </HrField>
            <div className="zrv-hr-field">
              <span className="zrv-hr-label">{T.labels.probationEnds}</span>
              <div className="zrv-hr-chipbox">
                {endDate ? <Pill tone={daysLeft !== null && daysLeft < 14 ? 'warn' : 'ok'}>{T.probationChip(enDate(endDate), daysLeft)}</Pill> : <Pill tone="warn">{T.selectEmployee}</Pill>}
              </div>
            </div>
          </div>
        </>}

        {step === 1 && <>
          <PanelHead n={2} eyebrow={T.heads[1].eyebrow} title={T.heads[1].title(formType?.name)} desc={T.heads[1].desc(totals.allocated)} />
          {!formType ? (
            <button type="button" className="btn-secondary zrv-hr-btn" onClick={() => setStep(0)}><OrvexaIcon name="arrow-left" size={16} /> {T.chooseType}</button>
          ) : (
            <div className="zrv-hr-criteria">
              <div className="zrv-hr-criteria__head" aria-hidden="true">
                <span>{T.columns.number}</span><span>{T.columns.criteria}</span><span>{T.columns.allocated}</span><span>{T.columns.points}</span>
              </div>
              {criteria.map((criterion, index) => {
                const value = form.scores[criterion.code]
                const has = value !== '' && value !== undefined && value !== null
                const error = errors[`criterion:${criterion.code}`]
                const nameId = `pa-c-${criterion.code}`
                return (
                  <div key={criterion.code} style={{ '--i': index }} className={`zrv-hr-criterion${has ? ' zrv-hr-is-done' : ''}${error ? ' zrv-hr-is-bad' : ''}`}>
                    <span className="zrv-hr-row__n" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                    <div className="zrv-hr-criterion__name"><b id={nameId}>{criterion.name}</b><small lang="ar" dir="rtl">{criterion.nameAr}</small></div>
                    <span className="zrv-hr-criterion__alloc">{criterion.points}</span>
                    <div className="zrv-hr-criterion__score">
                      <div className="zrv-hr-criterion__quick" role="group" aria-labelledby={nameId}>
                        {QUICK_PICKS.map((fraction) => {
                          const points = quickPoints(criterion.points, fraction)
                          return (
                            <button key={fraction} type="button" aria-pressed={has && Number(value) === points} onClick={() => score(criterion, points)}
                              aria-label={T.labels.quick(Math.round(fraction * 100), points, criterion.points)}>{Math.round(fraction * 100)}%</button>
                          )
                        })}
                      </div>
                      <input className="ux-input zrv-hr-input zrv-hr-criterion__pts" type="number" min="0" max={criterion.points} step="1" inputMode="numeric"
                        value={has ? value : ''} onChange={(event) => score(criterion, event.target.value)} aria-label={T.labels.points(criterion.name, criterion.points)}
                        aria-invalid={Boolean(error)} aria-describedby={error ? `${nameId}-error` : undefined} />
                    </div>
                    <div className="zrv-hr-criterion__bar" aria-hidden="true"><i style={{ transform: `scaleX(${has ? Number(value) / criterion.points : 0})` }} /></div>
                    <input className="zrv-hr-row__rem zrv-hr-criterion__note" value={form.notes[criterion.code] || ''} maxLength={500} placeholder={T.placeholders.evidence}
                      aria-label={T.labels.evidence(criterion.name)}
                      onChange={(event) => { const note = event.target.value; patch((current) => ({ notes: { ...current.notes, [criterion.code]: note } })) }} />
                    {error && <small id={`${nameId}-error`} className="zrv-auth-field-error zrv-hr-criterion__err">{error}</small>}
                  </div>
                )
              })}
              <div className="zrv-hr-criteria__total"><span>{T.total}</span><b>{totals.total}<em>/{totals.allocated}</em></b></div>
            </div>
          )}
        </>}

        {step === 2 && <>
          <PanelHead n={3} {...T.heads[2]} />
          <div className="zrv-hr-result">
            <div className={`zrv-hr-result__card${!totals.complete ? '' : totals.acceptable ? ' zrv-hr-is-ok' : ' zrv-hr-is-no'}`}>
              <small>{T.result.label}</small>
              <b>{totals.complete ? T.result[resultFor(totals.percent)] : T.result.none}</b>
              <span>{totals.complete ? T.result[`${resultFor(totals.percent)}_NOTE`] : T.result.scored(totals.scored, criteria.length)}</span>
            </div>
            <div className="zrv-hr-result__card"><small>{T.result.total}</small><b>{totals.total}<em>/100</em></b><span>{T.result.passMark(PASS_MARK)}</span></div>
            <div className="zrv-hr-result__card"><small>{T.result.rating}</small><b>{totals.scored && rating ? rating.label : COMMON_TEXT.dash}</b><span lang="ar" dir="rtl">{totals.scored && rating ? rating.labelAr : ''}</span></div>
          </div>
          <div className="zrv-hr-mt">
            <RadioCards name="pa-rec" value={form.recommendation} onChange={set('recommendation')} error={errors.recommendation}
              label={`${T.recommendation}${suggested ? T.suggested(T.recommendations[suggested].short) : ''}`}
              options={['CONFIRM', 'EXTEND', 'END'].map((value) => ({
                value, title: T.recommendations[value].title, desc: T.recommendations[value].desc, icon: RECOMMENDATION_ICONS[value][0], tone: RECOMMENDATION_ICONS[value][1],
              }))} />
          </div>
          {form.recommendation === 'EXTEND' && (
            <div className="zrv-hr-reveal zrv-hr-mt">
              <span className="zrv-hr-label" id="pa-ext-label">{T.extendBy}</span>
              <div className={`zrv-hr-seg zrv-hr-seg--wide${errors.extendBy ? ' zrv-hr-is-bad' : ''}`} role="group" aria-labelledby="pa-ext-label"
                aria-describedby={errors.extendBy ? 'pa-ext-error' : undefined} style={{ '--li': Math.max(0, EXTENSIONS.indexOf(Number(form.extendBy))) }}>
                {form.extendBy && <span className="zrv-hr-seg__pill" aria-hidden="true" />}
                {EXTENSIONS.map((months) => (
                  <button key={months} type="button" aria-pressed={form.extendBy === String(months)} aria-invalid={errors.extendBy && months === 1 ? true : undefined}
                    onClick={() => set('extendBy')(String(months))}>{T.months(months)}</button>
                ))}
              </div>
              {errors.extendBy && <small id="pa-ext-error" className="zrv-auth-field-error">{errors.extendBy}</small>}
              {form.extendBy && <p className="zrv-hr-note">{T.newEnd} <b>{enDate(endDate)}</b>.</p>}
            </div>
          )}
          {contradicts && (
            <div className="zrv-hr-reveal zrv-hr-mt">
              <HrField id="pa-just" label={T.labels.justification} required error={errors.justification}>
                <textarea {...fieldProps('pa-just', { error: errors.justification })} className="ux-textarea zrv-hr-input" value={form.justification} onChange={set('justification')} aria-required="true" />
              </HrField>
            </div>
          )}
          <div className="zrv-hr-sep" />
          <div className="zrv-hr-grid zrv-hr-is-2">
            <HrField id="pa-str" label={T.labels.strengths}><textarea id="pa-str" className="ux-textarea zrv-hr-input" value={form.strengths} onChange={set('strengths')} /></HrField>
            <HrField id="pa-imp" label={T.labels.improvements}><textarea id="pa-imp" className="ux-textarea zrv-hr-input" value={form.improvements} onChange={set('improvements')} /></HrField>
            <HrField id="pa-trn" label={T.labels.training} wide><input id="pa-trn" className="ux-input zrv-hr-input" value={form.training} onChange={set('training')} placeholder={T.placeholders.training} maxLength={1000} /></HrField>
          </div>
        </>}

        {step === 3 && <>
          <PanelHead n={4} {...T.heads[3]} />
          <div className="zrv-hr-grid zrv-hr-is-2">
            <HrField id="pa-com" label={T.labels.comments}><textarea id="pa-com" className="ux-textarea zrv-hr-input" value={form.comments} onChange={set('comments')} /></HrField>
            <HrField id="pa-sug" label={T.labels.suggestion}><textarea id="pa-sug" className="ux-textarea zrv-hr-input" value={form.suggestion} onChange={set('suggestion')} /></HrField>
          </div>
          <div className="zrv-hr-signs zrv-hr-mt">
            {[['evaluator', preparedBy || T.sign.evaluator, T.sign.evaluatorRole], ['employee', employee?.name || T.ticket.employee, T.sign.employeeRole]].map(([key, name, role], index) => {
              const signed = Boolean(form.signatures[key])
              const bad = key === 'evaluator' && errors.evaluatorSignature
              return (
                <div key={key} className={`zrv-hr-sign${signed ? ' zrv-hr-is-signed' : ''}${bad ? ' zrv-hr-is-bad' : ''}`}>
                  <div className="zrv-hr-sign__pad">{signed ? <svg viewBox="0 0 160 44" aria-hidden="true"><path className="zrv-hr-ink" d={INK[index]} /></svg> : T.sign.notSigned}</div>
                  <b>{name}</b><small>{role}</small>
                  <button type="button" className="btn-secondary zrv-hr-btn" aria-pressed={signed} aria-invalid={bad ? true : undefined}
                    aria-describedby={bad ? 'pa-sign-error' : undefined} onClick={() => sign(key)}>
                    <OrvexaIcon name={signed ? 'x' : 'pen-line'} size={15} /> {signed ? T.sign.remove : T.sign.sign}
                  </button>
                  {bad && <small id="pa-sign-error" className="zrv-auth-field-error">{errors.evaluatorSignature}</small>}
                </div>
              )
            })}
            <div className="zrv-hr-sign zrv-hr-sign--approve">
              <div className="zrv-hr-sign__pad"><OrvexaIcon name="lock" size={18} /></div>
              <b>{T.sign.approvedBy}</b><small>{locked ? T.sign.pending : T.sign.afterSubmit}</small>
              <ol className="zrv-hr-workflow" aria-label={T.sign.workflowLabel}>
                {T.sign.workflow.map((name, index) => (
                  <li key={name} className={index === 0 || (index === 1 && locked) ? 'zrv-hr-is-on' : undefined} aria-current={(locked ? 1 : 0) === index ? 'step' : undefined}>{name}</li>
                ))}
              </ol>
            </div>
          </div>
        </>}
      </RecruitmentShell>

      {dialog === 'submit' && (
        <ConfirmDialog title={T.submitTitle} confirmLabel={T.submitConfirm} pending={editor.pending} feedback={editor.feedback} onConfirm={submit} onClose={() => setDialog(null)}>
          <p className="zrv-admin-confirm">
            <b>{employee?.name}</b> · {employee?.position}<br />
            {T.submitBody.score(totals.total, rating?.label ?? COMMON_TEXT.dash, T.result[resultFor(totals.percent)])}<br />
            {T.submitBody.recommendation} <b>{form.recommendation === 'EXTEND' ? T.submitBody.extend(Number(form.extendBy)) : T.recommendations[form.recommendation]?.title}</b>
          </p>
        </ConfirmDialog>
      )}
      {dialog === 'new' && <NewFormDialog onConfirm={() => { setDialog(null); startNew() }} onClose={() => setDialog(null)} />}
      {dialog === 'report' && (
        <ReportDialog title={T.reportTitle} resourceKey="hr-probation-report" load={service.list} onClose={() => setDialog(null)}
          numberOf={(item) => item.evaluationNumber} statusOf={(item) => T.status[item.status]} pathOf={(item) => `${BASE}/${item.evaluationId}`}
          columns={[[T.reportColumns.employee, (item) => item.employeeName], [T.reportColumns.formType, (item) => formTypes.find((type) => type.code === item.formTypeCode)?.name], [T.reportColumns.score, (item) => `${item.totalPoints}/100`]]} />
      )}
    </>
  )
}
