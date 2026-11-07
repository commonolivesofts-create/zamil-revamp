import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import usePermissions from '@/features/access/usePermissions.js'
import { canAccessRoute, findAppRoute } from '@/config/appNavigation.js'
import { useResource } from '@/features/security-administration/useAdminData.js'
import {
  COMMON_TEXT, DASHBOARD_TEXT as T, INSIGHT_TEXT, INTERVIEW_TEXT, REQUISITION_TEXT,
} from '../hrRecruitmentText.js'
import { hrRecruitmentServices as services } from '../hrRecruitmentService.js'
import { HR_RECRUITMENT_ACTIONS as ACTIONS } from '../hrRecruitmentActions.js'
import { businessToday } from '../shared/hrFormat.js'
import { addDays } from '../shared/insightDates.js'
import { ORIENTATION_FLAGS } from '../orientation/orientationLegacy.js'
import {
  AttentionList, Banner, ColumnChart, Failure, Funnel, Journey, KpiTiles, MixDonut, ModuleTabs, Panel,
} from './RecruitmentPanels.jsx'
import { DEFAULT_PERIOD, PERIODS, createCounter, periodRange, previousRange, totalOf, trendMonths, within } from './dashboardModel.js'
import '@/styles/hr-recruitment.css'
import '@/styles/hr-insight-report.css'
import '@/styles/hr-recruitment-dashboard.css'

const REQUISITION_FORM = '/hr/recruitment/requisition'
const orientationTotal = totalOf(services.orientations.list)
const SOURCES = Object.freeze({
  requisitions: { total: totalOf(services.requisitions.list) },
  interviews: { total: totalOf(services.interviews.list) },
  offers: { total: totalOf(services.offers.list) },
  // Shared (Y) and Plant (N) are separate tables; without a flag both are counted.
  orientations: {
    total: async (query) => (query.flag ? orientationTotal(query)
      : (await Promise.all(ORIENTATION_FLAGS.map((flag) => orientationTotal({ ...query, flag })))).reduce((sum, value) => sum + value, 0)),
  },
  probations: { total: totalOf(services.probations.list) },
})

// The modules in hiring order (their colour: --rd-<key>) and their reports.
const MODULES = Object.freeze([
  { key: 'requisitions', icon: 'clipboard-list', report: '/hr/recruitment/requisition/report' },
  { key: 'interviews', icon: 'messages-square', report: '/hr/recruitment/interview/report' },
  { key: 'offers', icon: 'file-signature', report: '/hr/recruitment/offer/report' },
  { key: 'orientations', icon: 'calendar-clock', report: '/hr/recruitment/orientation/report' },
  { key: 'probations', icon: 'clipboard-check', report: '/hr/recruitment/probation-evaluation/report' },
])
const MODULE = Object.fromEntries(MODULES.map((module) => [module.key, module]))

// Probation forms of technical and engineering hires.
const TECHNICAL_FORMS = Object.freeze(['Workers_Technicians', 'Engineers_Staff'])
const OUTCOMES = Object.freeze(['Passed', 'Hold', 'Failed'])

// Open work right now, not limited to the period: [module, item, icon, tone, query].
const ATTENTION = Object.freeze([
  ['requisitions', 'requisitionsInApproval', 'hourglass', 'warn', { requisitionStatus: 'Inprocess' }],
  ['requisitions', 'requisitionsDraft', 'file-pen-line', 'calm', { requisitionStatus: 'Draft' }],
  ['interviews', 'interviewsOnHold', 'circle-pause', 'warn', { evaluationStatus: 'Hold' }],
  ['orientations', 'orientationsSoon', 'calendar-clock', 'info', (today) => ({ dateFrom: today, dateTo: addDays(today, 6) })],
  ['orientations', 'orientationsInApproval', 'hourglass', 'warn', { status: 'Inprocess' }],
  ['probations', 'probationsInApproval', 'hourglass', 'warn', { requestStatus: 'INPROCESS' }],
])

const clock = (moment) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(moment)
const counts = async (keys, load) => Object.fromEntries(await Promise.all(keys.map(async (key) => [key, await load(key)])))

// Recruitment dashboard: headline numbers, monthly activity, the hiring
// funnel, performance ratios and open work. Every figure is a count or page
// of the recruitment list APIs for the signed-in user; a module whose report
// the user cannot open is left out (the backend still authorizes every request).
export default function RecruitmentDashboardPage() {
  const permissions = usePermissions()
  const [params, setParams] = useSearchParams()
  const period = PERIODS.includes(params.get('period')) ? params.get('period') : DEFAULT_PERIOD
  // One counter per refresh, so Refresh asks the server again.
  const [refreshed, setRefreshed] = useState(() => ({ round: 0, at: new Date(), count: createCounter(SOURCES) }))
  const [chosenChart, setChart] = useState(null)
  const [table, setTable] = useState(false)
  const { count } = refreshed
  const today = businessToday()
  const range = periodRange(period, today)
  const previous = previousRange(range)
  const months = trendMonths(today)

  // A module counts only when its report page is available to the user (routed, switched on and permitted).
  const opens = (path) => canAccessRoute(findAppRoute(path), permissions)
  const allowed = MODULES.filter((module) => opens(module.report))
  const can = Object.fromEntries(MODULES.map((module) => [module.key, opens(module.report)]))
  const chart = allowed.some((module) => module.key === chosenChart) ? chosenChart : allowed[0]?.key

  const key = (name, enabled = true, withPeriod = true) => (enabled ? `hr-rd:${name}:${withPeriod ? period : ''}:${today}:${refreshed.round}` : null)
  const inPeriod = (source, query = {}) => count(source, within(query, range))

  // Load the headline figures first. These are the numbers users need at a
  // glance; the fuller breakdowns and historical charts can continue after.
  const headline = useResource(key('headline', allowed.length > 0), async () => {
    const [open, interviews, passed, offers, technicalParts] = await Promise.all([
      can.requisitions ? count('requisitions', { requisitionStatus: 'Approved', ticketStatus: 'Open' }) : undefined,
      can.interviews ? inPeriod('interviews') : undefined,
      can.interviews ? inPeriod('interviews', { evaluationStatus: 'Passed' }) : undefined,
      can.offers ? inPeriod('offers') : undefined,
      can.probations ? Promise.all(TECHNICAL_FORMS.map((formType) => inPeriod('probations', { formType }))) : undefined,
    ])
    return {
      open,
      interviews,
      passed,
      offers,
      technical: technicalParts?.reduce((sum, value) => sum + value, 0),
    }
  })

  const kpis = useResource(key('kpis', allowed.length > 0), () => counts(allowed.map((module) => module.key), async (source) => {
    const [current, before] = await Promise.all([inPeriod(source), previous ? count(source, within({}, previous)) : null])
    return { current, before }
  }))
  const funnel = useResource(key('funnel', allowed.length > 0), async () => {
    const [requisitions, interviews, passed, offers, orientations, confirmed] = await Promise.all([
      can.requisitions ? inPeriod('requisitions') : null,
      can.interviews ? inPeriod('interviews') : null,
      can.interviews ? inPeriod('interviews', { evaluationStatus: 'Passed' }) : null,
      can.offers ? inPeriod('offers') : null,
      can.orientations ? inPeriod('orientations') : null,
      can.probations ? inPeriod('probations', { requestStatus: 'APPROVED' }) : null,
    ])
    return { requisitions, interviews, passed, offers, orientations, confirmed }
  })
  // Keep these resources per module. A single slow count used to hold every
  // journey stage and performance tile behind one all-or-nothing Promise.all.
  // The count memo still shares identical queries with the headline, funnel
  // and attention panels.
  const requisitionMetrics = useResource(key('metrics:requisitions', can.requisitions), async () => {
    const [open, approved, rejected, replacement, addition, raised, filled] = await Promise.all([
      count('requisitions', { requisitionStatus: 'Approved', ticketStatus: 'Open' }),
      inPeriod('requisitions', { requisitionStatus: 'Approved' }),
      inPeriod('requisitions', { requisitionStatus: 'Rejected' }),
      inPeriod('requisitions', { reasonOfReq: 'Replacement' }),
      inPeriod('requisitions', { reasonOfReq: 'Addition' }),
      inPeriod('requisitions'),
      inPeriod('requisitions', { ticketStatus: 'Close' }),
    ])
    return { open, approved, rejected, replacement, addition, raised, filled }
  })
  const interviewMetrics = useResource(key('metrics:interviews', can.interviews), async () => {
    const [interviews, passed, hold, failed, online] = await Promise.all([
      inPeriod('interviews'),
      ...OUTCOMES.map((value) => inPeriod('interviews', { evaluationStatus: value })),
      inPeriod('interviews', { interviewType: 'Online' }),
    ])
    return { interviews, passed, hold, failed, online }
  })
  const offerMetrics = useResource(key('metrics:offers', can.offers), async () => ({
    offers: await inPeriod('offers'),
  }))
  const orientationMetrics = useResource(key('metrics:orientations', can.orientations), async () => {
    const [orientations, onboarded, plant, orientingNow] = await Promise.all([
      inPeriod('orientations'),
      inPeriod('orientations', { status: 'Approved' }),
      inPeriod('orientations', { flag: 'N' }),
      inPeriod('orientations', { status: 'Inprocess' }),
    ])
    return { orientations, onboarded, plant, orientingNow }
  })
  const probationMetrics = useResource(key('metrics:probations', can.probations), async () => {
    const [technicalParts, confirmed, notConfirmed, evaluations, evaluatingNow] = await Promise.all([
      Promise.all(TECHNICAL_FORMS.map((formType) => inPeriod('probations', { formType }))),
      inPeriod('probations', { requestStatus: 'APPROVED' }),
      inPeriod('probations', { requestStatus: 'REJECTED' }),
      inPeriod('probations'),
      inPeriod('probations', { requestStatus: 'INPROCESS' }),
    ])
    return { technical: technicalParts.reduce((sum, value) => sum + value, 0), confirmed, notConfirmed, evaluations, evaluatingNow }
  })
  const metricResources = [requisitionMetrics, interviewMetrics, offerMetrics, orientationMetrics, probationMetrics]
  const metricData = Object.assign({}, ...metricResources.map((resource) => resource.data ?? {}))
  const attentionItems = ATTENTION.filter(([source]) => can[source])
  const attention = useResource(key('attention', attentionItems.length > 0, false), () => Promise.all(attentionItems.map(([source, , , , query]) =>
    count(source, typeof query === 'function' ? query(today) : query))))
  // Pace tiles use requisitions, interviews and offers. Other module histories
  // are fetched only when their chart is selected, avoiding unused monthly
  // counts on every dashboard visit.
  const trendModules = allowed.filter((module) => ['requisitions', 'interviews', 'offers'].includes(module.key) || module.key === chart)
  const metricsReady = metricResources.every((resource) => resource.status !== 'loading')
  const trend = useResource(key(`trend:${chart}`, allowed.length > 0 && metricsReady, false), () => counts(trendModules.map((module) => module.key),
    (source) => Promise.all(months.map((month) => count(source, within({}, month))))))
  const busy = [headline, ...metricResources, kpis, funnel, attention].some((resource) => resource.status === 'loading')
  const refresh = () => setRefreshed((current) => ({ round: current.round + 1, at: new Date(), count: createCounter(SOURCES) }))
  const choosePeriod = (value) => setParams((current) => {
    const next = new URLSearchParams(current)
    if (value === DEFAULT_PERIOD) next.delete('period')
    else next.set('period', value)
    return next
  }, { replace: true })


  const m = metricData
  const h = headline.data ?? {}
  const sumOf = (...values) => (values.some((value) => value === undefined) ? undefined : values.reduce((a, b) => a + b, 0))
  const B = T.banner
  const R = T.rates
  const hero = can.requisitions ? { icon: 'briefcase-business', label: B.open, hint: B.openHint, value: h.open, to: MODULE.requisitions.report } : null
  const counters = [
    can.interviews && { key: 'passed', color: 'interviews', icon: 'user-round-check', label: B.passed, value: h.passed },
    can.offers && { key: 'offers', color: 'offers', icon: 'file-signature', label: B.offers, value: h.offers },
    can.probations && { key: 'technical', color: 'probations', icon: 'hard-hat', label: B.technical, value: h.technical },
  ].filter(Boolean)
  const gauge = can.interviews && can.offers ? { label: R.hiring, unit: R.units.interviews, part: h.offers, of: h.interviews } : null
  // The recruitment journey: one coloured stage per module in hiring order,
  // each with its KPIs (`of` makes a rate); `lead` is the stage's main count,
  // compared with the next stage's lead for the conversion between them.
  const J = T.journey
  const rate = (label, part, of, unit) => ({ label, part, of, unit })
  const figure = (label, value, hint) => ({ label, value, hint })
  const journey = [
    can.requisitions && { key: 'requisitions', color: 'requisitions', icon: 'clipboard-list', title: J.requisitions, to: MODULE.requisitions.report, lead: m.raised, kpis: [
      figure(J.raised, m.raised), figure(J.open, m.open, J.openHint),
      rate(J.approval, m.approved, sumOf(m.approved, m.rejected), R.units.decided), rate(J.fill, m.filled, m.approved, J.units.approved),
    ] },
    can.interviews && { key: 'interviews', color: 'interviews', icon: 'messages-square', title: J.interviews, to: MODULE.interviews.report, lead: m.interviews, kpis: [
      figure(J.held, m.interviews), figure(J.hold, m.hold, J.holdHint),
      rate(J.pass, m.passed, sumOf(m.passed, m.hold, m.failed), R.units.rated), rate(J.online, m.online, m.interviews, R.units.interviews),
    ] },
    can.offers && { key: 'offers', color: 'offers', icon: 'file-signature', title: J.offers, to: MODULE.offers.report, lead: m.offers, kpis: [
      figure(J.made, m.offers),
      can.interviews && rate(J.offerRate, m.offers, m.passed, J.units.passed),
      can.requisitions && rate(J.coverage, m.offers, m.approved, J.units.approved),
    ].filter(Boolean) },
    can.orientations && { key: 'orientations', color: 'orientations', icon: 'calendar-clock', title: J.orientations, to: MODULE.orientations.report, lead: m.orientations, kpis: [
      figure(J.scheduled, m.orientations),
      can.offers && rate(J.acceptance, m.orientations, m.offers, R.units.offers),
      rate(J.onboarded, m.onboarded, m.orientations, J.units.scheduled),
    ].filter(Boolean) },
    can.probations && { key: 'probations', color: 'probations', icon: 'badge-check', title: J.probations, to: MODULE.probations.report, lead: m.evaluations, kpis: [
      figure(J.evaluations, m.evaluations), figure(J.technical, m.technical, J.technicalHint),
      rate(J.success, m.confirmed, sumOf(m.confirmed, m.notConfirmed), R.units.decided),
    ] },
  ].filter(Boolean)
  // Performance ratios: efficiency (per requisition, per offer, monthly pace) and quality shares.
  const P = T.performance
  const ratioTile = (key, color, icon, label, part, of, hint) => ({ key, color, icon, label, kind: 'ratio', part, of, hint })
  const shareTile = (key, color, icon, label, part, of, hint) => ({ key, color, icon, label, kind: 'percent', part, of, hint })
  const offerTrend = trend.data?.offers
  const interviewTrend = trend.data?.interviews
  const requisitionTrend = trend.data?.requisitions
  const total = (values) => values && values.reduce((a, b) => a + b, 0)
  const performance = [
    can.requisitions && can.interviews && ratioTile('perRequisition', 'requisitions', 'layers', P.perRequisition, m.interviews, m.raised, P.perRequisitionHint),
    can.interviews && can.offers && ratioTile('perOffer', 'interviews', 'users', P.perOffer, m.interviews, m.offers, P.perOfferHint),
    can.offers && ratioTile('pace', 'offers', 'activity', P.pace, total(offerTrend), offerTrend?.length, P.paceHint),
    can.interviews && ratioTile('interviewPace', 'interviews', 'calendar-range', P.interviewPace, total(interviewTrend), interviewTrend?.length, P.interviewPaceHint),
    can.requisitions && ratioTile('requisitionPace', 'requisitions', 'trending-up', P.requisitionPace, total(requisitionTrend), requisitionTrend?.length, P.requisitionPaceHint),
    can.requisitions && shareTile('growth', 'offers', 'user-plus', P.growth, m.addition, m.raised, P.growthHint),
    can.requisitions && shareTile('pending', 'requisitions', 'hourglass', P.pending, sumOf(m.raised) === undefined ? undefined : Math.max(0, m.raised - m.approved - m.rejected), m.raised, P.pendingHint),
    can.requisitions && shareTile('replacement', 'violet', 'repeat', P.replacement, m.replacement, m.raised, P.replacementHint),
    can.requisitions && shareTile('rejection', 'interviews', 'circle-x', P.rejection, m.rejected, sumOf(m.approved, m.rejected), P.rejectionHint),
    can.interviews && shareTile('failure', 'probations', 'user-x', P.failure, m.failed, sumOf(m.passed, m.hold, m.failed), P.failureHint),
    can.interviews && shareTile('hold', 'orientations', 'circle-pause', P.hold, m.hold, sumOf(m.passed, m.hold, m.failed), P.holdHint),
    can.orientations && shareTile('plant', 'orientations', 'factory', P.plant, m.plant, m.orientations, P.plantHint),
    can.probations && shareTile('technicalShare', 'offers', 'hard-hat', P.technicalShare, m.technical, m.evaluations, P.technicalShareHint),
    can.orientations && shareTile('orientingNow', 'orientations', 'hourglass', P.orientingNow, m.orientingNow, m.orientations, P.orientingNowHint),
    can.probations && shareTile('evaluatingNow', 'probations', 'clipboard-check', P.evaluatingNow, m.evaluatingNow, m.evaluations, P.evaluatingNowHint),
    can.probations && shareTile('probationRejection', 'probations', 'shield-x', P.probationRejection, m.notConfirmed, sumOf(m.confirmed, m.notConfirmed), P.probationRejectionHint),
  ].filter(Boolean)
  const stages = [
    can.requisitions && ['requisitions', 'clipboard-list', 'requisitions'], can.interviews && ['interviews', 'messages-square', 'interviews'],
    can.interviews && ['passed', 'user-round-check', 'interviews'], can.offers && ['offers', 'file-signature', 'offers'],
    can.orientations && ['orientations', 'calendar-clock', 'orientations'], can.probations && ['confirmed', 'badge-check', 'probations'],
  ].filter(Boolean).map(([stage, icon, color]) => ({ key: stage, icon, color, label: T.funnel.stages[stage], count: funnel.data?.[stage] ?? undefined }))
  const mixes = [
    can.interviews && { key: 'outcomes', title: T.mix.outcomes, unit: T.mix.rated, items: [
      { key: 'passed', label: INTERVIEW_TEXT.outcomes.PASSED, color: 'offers', count: m.passed },
      { key: 'hold', label: INTERVIEW_TEXT.outcomes.HOLD, color: 'orientations', count: m.hold },
      { key: 'failed', label: INTERVIEW_TEXT.outcomes.FAILED, color: 'interviews', count: m.failed },
    ] },
    can.requisitions && { key: 'reasons', title: T.mix.reasons, unit: T.mix.requested, items: [
      { key: 'replacement', label: REQUISITION_TEXT.report.reasons.Replacement, color: 'requisitions', count: m.replacement },
      { key: 'addition', label: REQUISITION_TEXT.report.reasons.Addition, color: 'violet', count: m.addition },
    ] },
  ].filter(Boolean)
  const canCreate = permissions.can(ACTIONS.REQUISITION_CREATE) && opens(REQUISITION_FORM)
  const stamp = INSIGHT_TEXT.updated(clock(refreshed.at))

  return (
    <div className="zrv-hr zrv-hr--recruitment-dashboard zrv-rd">
      <header className="zrv-rd-head">
        <div>
          <nav aria-label="Breadcrumb"><ol className="zrv-rd-crumb">{COMMON_TEXT.breadcrumb.map((item) => <li key={item}>{item}</li>)}</ol></nav>
          <h1 className="zrv-rd-title">{T.title}</h1>
          <p className="zrv-rd-sub">{T.subtitle}</p>
        </div>
        <div className="zrv-rd-head__tools">
          <span className="zrv-rd-stamp" role="status"><i aria-hidden="true" />{stamp}</span>
          <div className="zrv-rd-periods" role="radiogroup" aria-label={T.period}>
            {PERIODS.map((value) => (
              <button key={value} type="button" role="radio" aria-checked={value === period} title={T.periodNames[value]}
                aria-label={T.periodNames[value]} onClick={() => choosePeriod(value)}>{T.periods[value]}</button>
            ))}
          </div>
          <button type="button" className="zrv-rd-icon" onClick={refresh} disabled={busy} title={INSIGHT_TEXT.refresh} aria-label={INSIGHT_TEXT.refresh}>
            <OrvexaIcon name="refresh-cw" size={16} className={busy ? 'zrv-rd-spin' : undefined} />
          </button>
          {canCreate && <Link className="zrv-rd-primary" to={REQUISITION_FORM}><OrvexaIcon name="plus" size={15} />{T.newRequisition}</Link>}
        </div>
      </header>

      {allowed.length === 0 ? <p className="zrv-admin-state" role="status">{T.noAccess}</p> : <>
        {headline.status === 'error' ? <Failure resource={headline} /> : <>
          {(hero || counters.length > 0) && <Banner hero={hero} counters={counters} gauge={gauge} />}
          {journey.length > 0 && <Journey stages={journey} />}
        </>}

        <div className="zrv-rd-grid">
          <Panel icon="chart-column" title={T.activity.title} hint={T.activity.hint} className="zrv-rd-span-8"
            actions={<button type="button" className="zrv-rd-icon zrv-rd-icon--sm" aria-pressed={table} onClick={() => setTable((value) => !value)}
              title={table ? T.activity.chart : T.activity.table} aria-label={table ? T.activity.chart : T.activity.table}>
              <OrvexaIcon name={table ? 'chart-column' : 'table'} size={15} />
            </button>}>
            {kpis.status === 'error' ? <Failure resource={kpis} /> : (
              <ModuleTabs label={T.activity.title} value={chart} onChoose={setChart} items={allowed.map((module) => ({
                key: module.key, label: T.modules[module.key], value: kpis.data?.[module.key].current, previous: kpis.data ? kpis.data[module.key].before : undefined,
              }))} />
            )}
            {trend.status === 'error' ? <Failure resource={trend} />
              : <ColumnChart months={months} values={trend.data?.[chart]} label={T.modules[chart]} color={chart} table={table} />}
          </Panel>

          <Panel icon="filter" title={T.funnel.title} hint={T.periodNames[period]} className="zrv-rd-span-4">
            {funnel.status === 'error' ? <Failure resource={funnel} /> : <Funnel stages={stages} />}
          </Panel>

          {performance.length > 0 && (
            <Panel icon="gauge" title={T.performance.title} hint={T.performance.hint} className="zrv-rd-span-8">
              <KpiTiles items={performance} />
            </Panel>
          )}

          <div className="zrv-rd-span-4 zrv-rd-stack">
            {mixes.length > 0 && (
              <Panel icon="chart-pie" title={T.mix.title} hint={T.periodNames[period]}>
                {mixes.map((mix) => <MixDonut key={mix.key} title={mix.title} unit={mix.unit} items={mix.items} />)}
              </Panel>
            )}
            <Panel icon="bell-ring" title={T.attention.title} hint={T.attention.hint}>
              {attention.status === 'error' ? <Failure resource={attention} /> : (
                <AttentionList items={attentionItems.map(([source, item, icon], index) => ({
                  key: item, icon, color: source, label: T.attention.items[item], to: MODULE[source].report, count: attention.data?.[index],
                }))} />
              )}
            </Panel>
          </div>
        </div>
      </>}
    </div>
  )
}
