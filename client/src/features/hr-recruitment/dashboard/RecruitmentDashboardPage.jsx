import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import usePermissions from '@/features/access/usePermissions.js'
import { canAccessRoute, findAppRoute } from '@/config/appNavigation.js'
import { useResource } from '@/features/security-administration/useAdminData.js'
import {
  COMMON_TEXT, DASHBOARD_TEXT as T, INSIGHT_TEXT, INTERVIEW_TEXT, OFFER_TEXT, ORIENTATION_TEXT, REQUISITION_TEXT,
} from '../hrRecruitmentText.js'
import { hrRecruitmentServices as services } from '../hrRecruitmentService.js'
import { HR_RECRUITMENT_ACTIONS as ACTIONS } from '../hrRecruitmentActions.js'
import { businessToday, enDate } from '../shared/hrFormat.js'
import { addDays } from '../shared/insightDates.js'
import { Pill } from '../shared/components/RecruitmentShell.jsx'
import { ORIENTATION_FLAGS, orientationStatus, statusTone } from '../orientation/orientationLegacy.js'
import { formTypeLabel } from '../probation/probationRules.js'
import { AttentionList, ColumnChart, Failure, FunnelList, Panel, RecentTable, StatStrip } from './RecruitmentPanels.jsx'
import { DEFAULT_PERIOD, PERIODS, createCounter, periodRange, previousRange, totalOf, trendMonths, within } from './dashboardModel.js'
import '@/styles/hr-recruitment.css'
import '@/styles/hr-insight-report.css'
import '@/styles/hr-recruitment-dashboard.css'

const RECENT = 5
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

const date = (value) => (value ? enDate(value) : '')
const pill = (tone, label) => <Pill tone={tone}>{label}</Pill>
const REQUISITION_TONE = Object.freeze({ Draft: 'warn', Inprocess: 'warn', Approved: 'ok', Rejected: 'bad' })
const INTERVIEW_TONE = Object.freeze({ INCOMPLETE: 'warn', INPROCESS: 'warn', APPROVED: 'ok', REJECTED: 'bad' })
const OUTCOME_TONE = Object.freeze({ PASSED: 'ok', HOLD: 'warn', FAILED: 'bad' })
const PROBATION_STATUS = Object.freeze({ DRAFT: ['Draft', 'warn'], INPROCESS: ['In process', 'warn'], APPROVED: ['Approved', 'ok'], REJECTED: ['Rejected', 'bad'] })
const latest = (list, sortBy, query = {}) => list({ ...query, page: 1, limit: RECENT, sortBy, sortDir: 'desc' })

// Each module: its report and its latest records as table rows, in a fixed order.
const MODULES = Object.freeze([
  {
    key: 'requisitions', icon: 'clipboard-list', report: '/hr/recruitment/requisition/report',
    recent: async () => (await latest(services.requisitions.list, 'requisitionId')).items.map((row) => ({
      key: row.requisitionId, path: `/hr/recruitment/requisition/${row.requisitionId}`, reference: row.requisitionNumber || row.requisitionId,
      title: row.jobTitle, detail: row.departmentName, date: date(row.requestDate),
      status: pill(REQUISITION_TONE[row.status] ?? 'warn', REQUISITION_TEXT.status[row.status] ?? row.status),
    })),
  },
  {
    key: 'interviews', icon: 'messages-square', report: '/hr/recruitment/interview/report',
    recent: async () => (await latest(services.interviews.list, 'HEADER_ID')).items.map((row) => ({
      key: row.assessmentId, path: `/hr/recruitment/interview/${row.assessmentId}`, reference: row.assessmentNumber || row.assessmentId,
      title: row.candidateName, detail: row.positionTitle, date: date(row.interviewDate),
      status: row.outcome ? pill(OUTCOME_TONE[row.outcome], INTERVIEW_TEXT.outcomes[row.outcome]) : pill(INTERVIEW_TONE[row.status], INTERVIEW_TEXT.status[row.status]),
    })),
  },
  {
    key: 'offers', icon: 'file-signature', report: '/hr/recruitment/offer/report',
    recent: async () => (await latest(services.offers.list, 'HEADER_ID')).items.map((row) => ({
      key: row.offerId, path: `/hr/recruitment/offer/${row.offerId}`, reference: row.offerNumber || row.offerId,
      title: row.candidateNameEn, detail: row.position, date: date(row.offerDate), status: pill('warn', OFFER_TEXT.status[row.status] ?? row.status),
    })),
  },
  {
    // Both tables, the latest orientation dates first.
    key: 'orientations', icon: 'calendar-clock', report: '/hr/recruitment/orientation/report',
    recent: async () => {
      const pages = await Promise.all(ORIENTATION_FLAGS.map((flag) => latest(services.orientations.list, 'ORIENTATION_DURATION_FROM', { flag })))
      return pages.flatMap((page) => page.items).sort((a, b) => (b.fromDate ?? '').localeCompare(a.fromDate ?? '')).slice(0, RECENT).map((row) => ({
        key: `${row.flag}:${row.scheduleId}`, path: `/hr/recruitment/orientation/${row.scheduleId}?flag=${row.flag}`, reference: row.scheduleNumber,
        title: row.employeeName, detail: row.divisionName, date: date(row.fromDate),
        status: pill(statusTone(row.status), ORIENTATION_TEXT.status[orientationStatus(row.status)]),
      }))
    },
  },
  {
    key: 'probations', icon: 'clipboard-check', report: '/hr/recruitment/probation-evaluation/report',
    recent: async () => (await latest(services.probations.list, 'HEADER_ID')).items.map((row) => ({
      key: row.evaluationId, path: `/hr/recruitment/probation-evaluation/${row.evaluationId}`, reference: row.evaluationNumber,
      title: row.employeeName, detail: formTypeLabel(row.formType), date: date(row.createdAt),
      status: pill(PROBATION_STATUS[row.status]?.[1] ?? 'warn', PROBATION_STATUS[row.status]?.[0] ?? row.status),
    })),
  },
])
const MODULE = Object.fromEntries(MODULES.map((module) => [module.key, module]))

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
// funnel, the latest records and open work. Every figure is a count or page
// of the recruitment list APIs for the signed-in user; a module whose report
// the user cannot open is left out (the backend still authorizes every request).
export default function RecruitmentDashboardPage() {
  const permissions = usePermissions()
  const [params, setParams] = useSearchParams()
  const period = PERIODS.includes(params.get('period')) ? params.get('period') : DEFAULT_PERIOD
  // One counter per refresh, so Refresh asks the server again.
  const [refreshed, setRefreshed] = useState(() => ({ round: 0, at: new Date(), count: createCounter(SOURCES) }))
  const [chosenChart, setChart] = useState(null)
  const [chosenRecent, setRecent] = useState(null)
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
  const recentKey = allowed.some((module) => module.key === chosenRecent) ? chosenRecent : allowed[0]?.key

  const key = (name, enabled = true, withPeriod = true) => (enabled ? `hr-rd:${name}:${withPeriod ? period : ''}:${today}:${refreshed.round}` : null)
  const inPeriod = (source, query = {}) => count(source, within(query, range))

  const kpis = useResource(key('kpis', allowed.length > 0), () => counts(allowed.map((module) => module.key), async (source) => {
    const [current, before] = await Promise.all([inPeriod(source), previous ? count(source, within({}, previous)) : null])
    return { current, before }
  }))
  const trend = useResource(key('trend', allowed.length > 0, false), () => counts(allowed.map((module) => module.key),
    (source) => Promise.all(months.map((month) => count(source, within({}, month))))))
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
  const recent = useResource(key(`recent:${recentKey}`, Boolean(recentKey), false), () => MODULE[recentKey].recent())
  const attentionItems = ATTENTION.filter(([source]) => can[source])
  const attention = useResource(key('attention', attentionItems.length > 0, false), () => Promise.all(attentionItems.map(([source, , , , query]) =>
    count(source, typeof query === 'function' ? query(today) : query))))

  const busy = [kpis, trend, funnel, recent, attention].some((resource) => resource.status === 'loading')
  const refresh = () => setRefreshed((current) => ({ round: current.round + 1, at: new Date(), count: createCounter(SOURCES) }))
  const choosePeriod = (value) => setParams((current) => {
    const next = new URLSearchParams(current)
    if (value === DEFAULT_PERIOD) next.delete('period')
    else next.set('period', value)
    return next
  }, { replace: true })

  const stages = [
    can.requisitions && ['requisitions', 'clipboard-list'], can.interviews && ['interviews', 'messages-square'],
    can.interviews && ['passed', 'user-round-check'], can.offers && ['offers', 'file-signature'],
    can.orientations && ['orientations', 'calendar-clock'], can.probations && ['confirmed', 'badge-check'],
  ].filter(Boolean).map(([stage, icon]) => ({ key: stage, icon, label: T.funnel.stages[stage], count: funnel.data?.[stage] ?? undefined }))
  const canCreate = permissions.can(ACTIONS.REQUISITION_CREATE) && opens(REQUISITION_FORM)
  const stamp = INSIGHT_TEXT.updated(clock(refreshed.at))
  const tabs = (value, choose, label) => (
    <div className="zrv-rd-tabs" role="group" aria-label={label}>
      {allowed.map((module) => (
        <button key={module.key} type="button" aria-pressed={module.key === value} onClick={() => choose(module.key)}>{T.modules[module.key]}</button>
      ))}
    </div>
  )

  return (
    <div className="zrv-hr zrv-hr--recruitment-dashboard zrv-ir zrv-rd">
      <header className="zrv-rd-head">
        <div>
          <nav aria-label="Breadcrumb"><ol className="zrv-ir-crumb">{COMMON_TEXT.breadcrumb.map((item) => <li key={item}>{item}</li>)}</ol></nav>
          <h1 className="zrv-rd-title">{T.title}</h1>
          <p className="zrv-rd-sub">{T.subtitle}</p>
        </div>
        <div className="zrv-rd-head__tools">
          <span className="zrv-rd-stamp" role="status">{stamp}</span>
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
        {kpis.status === 'error' ? <Failure resource={kpis} /> : (
          <StatStrip label={T.periodNames[period]} items={allowed.map((module) => ({
            key: module.key, icon: module.icon, label: T.modules[module.key], to: module.report,
            value: kpis.data?.[module.key].current, previous: kpis.data ? kpis.data[module.key].before : undefined, trend: trend.data?.[module.key],
          }))} />
        )}

        <div className="zrv-rd-grid">
          <Panel title={T.activity.title} hint={T.activity.hint} className="zrv-rd-span-8"
            actions={<>
              {tabs(chart, setChart, T.activity.title)}
              <button type="button" className="zrv-rd-icon zrv-rd-icon--sm" aria-pressed={table} onClick={() => setTable((value) => !value)}
                title={table ? T.activity.chart : T.activity.table} aria-label={table ? T.activity.chart : T.activity.table}>
                <OrvexaIcon name={table ? 'chart-column' : 'table'} size={15} />
              </button>
            </>}>
            {trend.status === 'error' ? <Failure resource={trend} />
              : <ColumnChart months={months} values={trend.data?.[chart]} label={T.modules[chart]} table={table} />}
          </Panel>

          <Panel title={T.funnel.title} hint={T.periodNames[period]} className="zrv-rd-span-4">
            {funnel.status === 'error' ? <Failure resource={funnel} /> : <FunnelList stages={stages} />}
          </Panel>

          <Panel title={T.recent.title} to={MODULE[recentKey].report} className="zrv-rd-span-8" actions={tabs(recentKey, setRecent, T.recent.title)}>
            {recent.status === 'error' ? <Failure resource={recent} /> : <RecentTable rows={recent.data ?? undefined} />}
          </Panel>

          <Panel title={T.attention.title} hint={T.attention.hint} className="zrv-rd-span-4">
            {attention.status === 'error' ? <Failure resource={attention} /> : (
              <AttentionList items={attentionItems.map(([source, item, icon, tone], index) => ({
                key: item, icon, tone, label: T.attention.items[item], to: MODULE[source].report, count: attention.data?.[index],
              }))} />
            )}
          </Panel>
        </div>
      </>}
    </div>
  )
}
