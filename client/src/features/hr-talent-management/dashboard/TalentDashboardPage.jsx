import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import usePermissions from '@/features/access/usePermissions.js'
import { canAccessRoute, findAppRoute, navigationEntries } from '@/config/appNavigation.js'
import { useResource } from '@/features/security-administration/useAdminData.js'
import { hrEmployeeServices } from '@/features/hr-employee-services/hrEmployeeServicesService.js'
import { rewardDemo, rewardService } from '@/features/hr-employee-services/reward/rewardService.js'
import { businessToday } from '@/features/hr-recruitment/shared/hrFormat.js'
import { dashboardCounter } from '@/features/hr-recruitment/dashboard/dashboardModel.js'
import { TALENT_DASHBOARD_TEXT as T } from './talentDashboardText.js'
import {
  GRADES,
  GRADE_POLICY,
  overQuota,
  percentOf,
  summarizeCatalog,
  summarizeMatrix,
  summarizeTeam,
  yearMonths,
  yearRange,
  yearsUpTo,
} from './talentDashboardModel.js'
import { trainingHub } from './trainingHubClient.js'
import {
  ActionList,
  AreaCard,
  Badge,
  Delta,
  GradeMix,
  IndexGauge,
  Ring,
  SegmentBar,
  TargetTracker,
  Sparkline,
  Stat,
  Ticker,
  TrendChart,
  Value,
} from './TalentWidgets.jsx'
import { AREAS, TARGETS, buildScorecard, talentIndex } from './talentKpis.js'
import '@/styles/hr-talent-dashboard.css'

const APPRAISAL_FORM = '/hr/performance/appraisal'
const APPRAISAL_REPORT = '/hr/performance/appraisal/report'
const REWARD_REPORT = '/hr/talent-management/reward-nomination/report'
// The TrainingHub pages of Talent Management (registry external entries).
const HUB_ENTRIES = Object.freeze({
  matrix: 'training-hub-job-skill-matrix',
  catalog: 'training-hub-catalog',
  team: 'training-hub-team-skills',
})
// Each area's figures in one counts request per render (`counts`); `total` is the
// one-row-page fallback (the reward demo adapter has no counts route).
const SOURCES = Object.freeze({
  appraisals: {
    total: (query) => hrEmployeeServices.appraisals.total(query),
    counts: (queries, options) => hrEmployeeServices.appraisals.counts(queries, options),
  },
  rewards: {
    total: async (query) =>
      (await rewardService.list({ ...query, page: 1, pageSize: 1 })).pagination.total,
    ...(!rewardDemo && {
      counts: (queries, options) => rewardService.counts(queries, options),
    }),
  },
})
const REWARD_STATUSES = Object.freeze(['APPROVED', 'INPROCESS', 'DRAFT', 'REJECTED'])
const clock = (moment) =>
  new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(moment)
const sumOf = (...values) =>
  values.some((value) => value === undefined) ? undefined : values.reduce((a, b) => a + b, 0)

// Talent Management dashboard: appraisals and reward nominations from their
// list APIs, and the Job Skills Matrix, training catalog and team skills from
// TrainingHub, all for the signed-in user. An area whose page the user cannot
// open is left out; the backends still authorise every request.
export default function TalentDashboardPage() {
  const permissions = usePermissions()
  const [params, setParams] = useSearchParams()
  const today = businessToday()
  const years = yearsUpTo(today)
  const currentYear = years[0]
  const year = years.includes(Number(params.get('year'))) ? Number(params.get('year')) : currentYear
  const isCurrent = year === currentYear
  // The figures of a visit in the last minute are reused (dashboardCounter); Refresh starts a
  // fresh counter, so it asks the server again past its counts cache.
  const [refreshed, setRefreshed] = useState(() => {
    const { at, count } = dashboardCounter('talent', SOURCES)
    return { round: 0, at: new Date(at), count }
  })
  const [chosenChart, setChart] = useState(null)
  const { count } = refreshed

  // An area counts only when its page is available to the user (routed, switched on and permitted).
  const opens = (path) => canAccessRoute(findAppRoute(path), permissions)
  const hubHref = Object.fromEntries(
    Object.entries(HUB_ENTRIES).map(([key, id]) => {
      const entry = navigationEntries.find((item) => item.id === id)
      return [key, entry?.implemented && canAccessRoute(entry, permissions) ? entry.href : null]
    }),
  )
  const can = {
    appraisals: opens(APPRAISAL_REPORT),
    rewards: opens(REWARD_REPORT),
    matrix: Boolean(hubHref.matrix),
    catalog: Boolean(hubHref.catalog),
    team: Boolean(hubHref.team),
  }
  const usesHub = can.matrix || can.catalog || can.team
  const anything = Object.values(can).some(Boolean)

  const key = (name, enabled = true) =>
    enabled ? `hr-td:${name}:${year}:${today}:${refreshed.round}` : null
  const range = yearRange(year, today)
  const previous = yearRange(year - 1, today)
  const months = yearMonths(year, today)
  const inYear = (query = {}, window = range) => ({
    ...query,
    date_from: window.from,
    date_to: window.to,
  })

  const appraisals = useResource(key('appraisals', can.appraisals), async () => {
    const [total, before, inApproval, approved, rejected, gradeCounts] = await Promise.all([
      count('appraisals', { year }),
      count('appraisals', { year: year - 1 }),
      count('appraisals', { year, status: 'INPROCESS' }),
      count('appraisals', { year, status: 'APPROVED' }),
      count('appraisals', { year, status: 'REJECTED' }),
      Promise.all(GRADES.map((grade) => count('appraisals', { year, grade }))),
    ])
    return {
      total,
      before,
      inApproval,
      approved,
      rejected,
      grades: Object.fromEntries(GRADES.map((grade, index) => [grade, gradeCounts[index]])),
    }
  })
  // The appraiser's team is known for the current year only.
  const team = useResource(key('team-stats', can.appraisals && isCurrent), () =>
    hrEmployeeServices.appraisals.teamStats(),
  )
  const rewards = useResource(key('rewards', can.rewards), async () => {
    const [total, before, statusCounts, production] = await Promise.all([
      count('rewards', inYear()),
      count('rewards', inYear({}, previous)),
      Promise.all(REWARD_STATUSES.map((status) => count('rewards', inYear({ status })))),
      count('rewards', inYear({ department: 'production' })),
    ])
    return {
      total,
      before,
      production,
      status: Object.fromEntries(
        REWARD_STATUSES.map((status, index) => [status, statusCounts[index]]),
      ),
    }
  })
  // TrainingHub shows its current state (not a year); one load for its three areas.
  const hub = useResource(key('hub', usesHub), async (signal) => {
    const me = await trainingHub.connect({ signal })
    const [catalog, matrix, people] = await Promise.all([
      can.catalog ? trainingHub.catalog(today, { signal }) : null,
      can.matrix ? trainingHub.matrix({ signal }) : null,
      can.team && me?.hasTeam !== false ? trainingHub.team({ signal }) : null,
    ])
    return {
      me,
      catalog: catalog && summarizeCatalog(catalog, today),
      matrix: matrix && summarizeMatrix(matrix),
      team: people && people.length ? summarizeTeam(people) : null,
    }
  })

  const chartModules = [can.appraisals && 'appraisals', can.rewards && 'rewards'].filter(Boolean)
  const chart = chartModules.includes(chosenChart) ? chosenChart : chartModules[0]
  const chartYears = [...years].reverse()
  // Both series load with the other figures (same counts requests): the chart
  // shows one, and the Recognition card's sparkline always needs the months.
  const appraisalTrend = useResource(key('trend:appraisals', can.appraisals), () =>
    Promise.all(chartYears.map((value) => count('appraisals', { year: value }))),
  )
  const rewardTrend = useResource(key('trend:rewards', can.rewards), () =>
    Promise.all(months.map((month) => count('rewards', inYear({}, month)))),
  )

  const busy = [appraisals, team, rewards, hub, appraisalTrend, rewardTrend].some(
    (resource) => resource.status === 'loading',
  )
  const refresh = () =>
    setRefreshed((current) => {
      const { at, count } = dashboardCounter('talent', SOURCES, { fresh: true })
      return { round: current.round + 1, at: new Date(at), count }
    })
  const chooseYear = (value) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value === currentYear) next.delete('year')
        else next.set('year', String(value))
        return next
      },
      { replace: true },
    )

  const a = appraisals.data ?? {}
  const r = rewards.data ?? {}
  const rs = r.status ?? {}
  const hubReady = hub.status === 'ready'
  const mx = hubReady ? hub.data.matrix : undefined
  const ct = hubReady ? hub.data.catalog : undefined
  const tm = hubReady ? hub.data.team : undefined
  const hubFailed = hub.status === 'error'
  // A TrainingHub area shows when it is permitted and, once loaded, has data.
  const shows = (area) => can[area] && !hubFailed && (!hubReady || hub.data[area] !== null)
  const ts = team.data
  const graded = a.grades ? sumOf(...GRADES.map((grade) => a.grades[grade])) : undefined
  const decided = sumOf(a.approved, a.rejected)
  const rewardsDecided = sumOf(rs.APPROVED, rs.REJECTED)
  const appraised = ts ? GRADES.reduce((sum, grade) => sum + ts.allocated[grade], 0) : undefined
  const overGrades = overQuota(ts)
  const U = T.ui
  const P = T.performance
  const J = T.journey
  const A = T.attention.items

  // Pulse: the headline figures of the masthead.
  const readiness = percentOf(tm?.readinessPoints, tm?.readinessMax)
  const pulse = [
    can.appraisals && {
      key: 'appraisals',
      icon: 'star',
      label: U.pulse.appraisals,
      value: a.total,
      delta: <Delta current={a.total} previous={a.before} />,
    },
    can.rewards && { key: 'winners', icon: 'award', label: U.pulse.winners, value: rs.APPROVED },
    shows('catalog') && {
      key: 'sessions',
      icon: 'calendar-days',
      label: U.pulse.sessions,
      value: ct?.sessions,
    },
    shows('team') && {
      key: 'readiness',
      icon: 'target',
      label: U.pulse.readiness,
      value: hubReady ? readiness : undefined,
      percent: true,
    },
  ].filter(Boolean)

  const attention = [
    can.appraisals && {
      key: 'appraisalsInApproval',
      area: 'appraisals',
      to: APPRAISAL_REPORT,
      count: appraisals.status === 'error' ? 0 : a.inApproval,
    },
    can.appraisals &&
      isCurrent && {
        key: 'overQuota',
        area: 'appraisals',
        to: APPRAISAL_FORM,
        count: team.status === 'error' ? 0 : overGrades?.length,
      },
    can.rewards && {
      key: 'nominationsInApproval',
      area: 'rewards',
      to: REWARD_REPORT,
      count: rewards.status === 'error' ? 0 : rs.INPROCESS,
    },
    can.rewards && {
      key: 'nominationsDraft',
      area: 'rewards',
      to: REWARD_REPORT,
      count: rewards.status === 'error' ? 0 : rs.DRAFT,
    },
    shows('matrix') && {
      key: 'profilesPending',
      area: 'matrix',
      href: hubHref.matrix,
      count: mx?.pending,
    },
    shows('matrix') && {
      key: 'profilesReturned',
      area: 'matrix',
      href: hubHref.matrix,
      count: mx?.returned,
    },
    shows('catalog') && {
      key: 'sessionsSoon',
      area: 'catalog',
      href: hubHref.catalog,
      count: ct?.soon,
    },
    shows('team') && { key: 'criticalGaps', area: 'team', href: hubHref.team, count: tm?.atRisk },
  ]
    .filter(Boolean)
    .map((item) => ({
      ...item,
      label: A[item.key],
      count: hubFailed && item.href ? 0 : item.count,
    }))

  const trendLabels =
    chart === 'appraisals' ? chartYears.map(String) : months.map((month) => month.label)
  const trendValues = (chart === 'appraisals' ? appraisalTrend.data : rewardTrend.data) ?? undefined
  const trendTitle = chart === 'appraisals' ? U.trend.appraisals : U.trend.rewards
  const canCreate = opens(APPRAISAL_FORM)
  const firstHubHref = hubHref.catalog ?? hubHref.matrix ?? hubHref.team
  const signedOut = hub.error?.code === 'SIGNED_OUT'
  const failed = [appraisals, rewards, appraisalTrend, rewardTrend].filter(
    (resource) => resource.status === 'error',
  )
  const skillsPerPosition =
    mx === undefined ? undefined : mx.profiled ? Math.round(mx.skills / mx.profiled) : null
  const seatFill = percentOf(ct?.taken, ct?.capacity)

  // Every KPI the user may see, the Talent Index over them, and card badges.
  const scorecard = buildScorecard(
    {
      appraisals: can.appraisals,
      rewards: can.rewards,
      matrix: shows('matrix'),
      catalog: shows('catalog'),
      team: shows('team'),
    },
    {
      appraisals: appraisals.data ?? undefined,
      teamStats: team.data ?? undefined,
      rewards: rewards.data ?? undefined,
      rewardMonths: rewardTrend.data ?? undefined,
      months,
      matrix: mx,
      catalog: ct,
      team: tm,
      isCurrent,
    },
  )
  const kpi = (key) => scorecard.find((item) => item.key === key)
  const index = talentIndex(scorecard)
  // The tracker's lanes: each area the user sees, with its name and icon.
  const AREA_ICONS = {
    appraisals: 'star',
    rewards: 'award',
    matrix: 'grid-3x3',
    catalog: 'book-open',
    team: 'users',
  }
  const AREA_NAMES = {
    appraisals: U.areas.performance,
    rewards: U.areas.recognition,
    matrix: U.areas.skills,
    catalog: U.areas.training,
    team: U.areas.team,
  }
  const lanes = AREAS.filter((area) => scorecard.some((item) => item.area === area)).map(
    (area) => ({ area, label: AREA_NAMES[area], icon: AREA_ICONS[area] }),
  )
  const calibrationValue = kpi('calibration')?.value
  const momentumValue = kpi('momentum')?.value

  return (
    <div className="td">
      <header className="td-masthead">
        <div className="td-masthead__glow" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div className="td-masthead__bar">
          <nav aria-label="Breadcrumb">
            <ol className="td-crumbs">
              {T.breadcrumb.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </nav>
          <div className="td-masthead__tools">
            <div className="td-years" role="radiogroup" aria-label={T.year}>
              {[...years].reverse().map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={value === year}
                  aria-label={T.yearName(value)}
                  onClick={() => chooseYear(value)}
                >
                  {value}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="td-iconbtn"
              onClick={refresh}
              disabled={busy}
              title={U.refresh}
              aria-label={U.refresh}
            >
              <OrvexaIcon name="refresh-cw" size={16} className={busy ? 'td-spin' : undefined} />
            </button>
            {canCreate && (
              <Link className="td-cta" to={APPRAISAL_FORM}>
                <OrvexaIcon name="plus" size={15} />
                {T.newAppraisal}
              </Link>
            )}
          </div>
        </div>
        <div className="td-masthead__hero">
          <div className="td-masthead__intro">
            <h1>
              {U.titleLead} <em>{U.titleAccent}</em>
            </h1>
            <p>{U.subtitle}</p>
            {anything && pulse.length > 0 && (
              <ul className="td-pulse" aria-label={U.pulse.label}>
                {pulse.map((item) => (
                  <li key={item.key}>
                    <span className="td-pulse__icon" aria-hidden="true">
                      <OrvexaIcon name={item.icon} size={16} />
                    </span>
                    <span className="td-pulse__label">{item.label}</span>
                    <span className="td-pulse__row">
                      <b className="td-pulse__value">
                        <Value value={item.value} percent={item.percent} />
                      </b>
                      {item.delta}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="td-masthead__stamp" role="status">
              <i aria-hidden="true" />
              {U.updated(clock(refreshed.at))}
            </p>
          </div>
          {anything && index.parts.length > 0 && (
            <IndexGauge value={index.value} parts={index.parts} labels={U.index} />
          )}
        </div>
      </header>
      {anything && <Ticker items={scorecard} label={U.ticker} />}

      {!anything ? (
        <p className="td-notice" role="status">
          {T.noAccess}
        </p>
      ) : (
        <>
          {failed.length > 0 && (
            <div className="td-notice td-notice--error" role="alert">
              <OrvexaIcon name="circle-alert" size={18} />
              <p>{U.someFailed}</p>
              <button type="button" onClick={() => failed.forEach((resource) => resource.reload())}>
                {T.hub.retry}
              </button>
            </div>
          )}
          {hubFailed && (
            <div className="td-notice" role="alert">
              <OrvexaIcon name="plug-zap" size={18} />
              <p>{signedOut ? T.hub.signedOut : T.hub.unavailable}</p>
              <button type="button" onClick={hub.reload}>
                {T.hub.retry}
              </button>
              {firstHubHref && (
                <a href={firstHubHref} target="_blank" rel="noopener noreferrer">
                  {T.hub.open}
                  <OrvexaIcon name="arrow-up-right" size={14} />
                  <span className="td-sr"> {U.opensNewTab}</span>
                </a>
              )}
            </div>
          )}

          <div className="td-bento">
            {can.appraisals && (
              <AreaCard
                area="appraisals"
                icon="star"
                title={U.areas.performance}
                hint={U.areas.performanceHint(year)}
                to={APPRAISAL_REPORT}
                className="td-span-7"
                badge={
                  typeof calibrationValue === 'number' &&
                  (calibrationValue >= TARGETS.calibration ? (
                    <Badge icon="sparkles">{U.badges.aligned}</Badge>
                  ) : (
                    <Badge tone="watch" icon="scale">
                      {U.badges.offPolicy}
                    </Badge>
                  ))
                }
              >
                <div className="td-performance">
                  <div className="td-performance__lead">
                    <Ring value={percentOf(a.approved, decided)} caption={U.approvalRing} />
                    <div className="td-headline td-headline--stacked">
                      <b>
                        <Value value={a.total} />
                      </b>
                      <span>{J.recorded}</span>
                      <Delta current={a.total} previous={a.before} />
                    </div>
                  </div>
                  <GradeMix
                    grades={GRADES}
                    counts={a.grades}
                    policy={GRADE_POLICY}
                    names={T.grades.names}
                    emptyText={T.grades.empty}
                  />
                </div>
                <div className="td-statrow">
                  <Stat label={J.inApproval} value={a.inApproval} note={J.inApprovalHint} />
                  <Stat
                    label={P.highPerformers}
                    value={percentOf(sumOf(a.grades?.A, a.grades?.B), graded)}
                    percent
                    note={P.highPerformersHint}
                  />
                  <Stat
                    label={P.lowPerformers}
                    value={percentOf(sumOf(a.grades?.D, a.grades?.E), graded)}
                    percent
                    note={P.lowPerformersHint}
                  />
                  {isCurrent && ts?.totalEmployees > 0 && (
                    <Stat
                      label={P.teamCoverage}
                      value={percentOf(appraised, ts.totalEmployees)}
                      percent
                      note={T.grades.of(appraised, ts.totalEmployees)}
                    />
                  )}
                </div>
              </AreaCard>
            )}

            {can.rewards && (
              <AreaCard
                area="rewards"
                icon="award"
                title={U.areas.recognition}
                hint={U.areas.recognitionHint(year)}
                to={REWARD_REPORT}
                className="td-span-5"
                badge={
                  typeof momentumValue === 'number' &&
                  momentumValue > 0 && (
                    <Badge icon="trending-up">
                      {U.badges.rising} +{momentumValue}%
                    </Badge>
                  )
                }
              >
                <div className="td-headline">
                  <b>
                    <Value value={r.total} />
                  </b>
                  <span>{J.nominations}</span>
                  <Delta current={r.total} previous={r.before} />
                </div>
                <Sparkline values={rewardTrend.data ?? undefined} label={U.trend.rewards} />
                <SegmentBar
                  parts={[
                    { key: 'APPROVED', tone: 'good', count: rs.APPROVED },
                    { key: 'INPROCESS', tone: 'wait', count: rs.INPROCESS },
                    { key: 'DRAFT', tone: 'idle', count: rs.DRAFT },
                    { key: 'REJECTED', tone: 'bad', count: rs.REJECTED },
                  ].map((part) => ({ ...part, label: T.mix.status[part.key] }))}
                />
                <div className="td-statrow td-statrow--2">
                  <Stat
                    label={P.rewardApproval}
                    value={percentOf(rs.APPROVED, rewardsDecided)}
                    percent
                  />
                  <Stat label={J.production} value={percentOf(r.production, r.total)} percent />
                </div>
              </AreaCard>
            )}

            {shows('matrix') && (
              <AreaCard
                area="matrix"
                icon="grid-3x3"
                title={U.areas.skills}
                hint={U.areas.skillsHint}
                href={hubHref.matrix}
                className="td-span-4"
              >
                <div className="td-headline">
                  <b>
                    <Value value={mx?.positions} />
                  </b>
                  <span>{J.positions}</span>
                </div>
                <SegmentBar
                  label={U.pipeline}
                  parts={[
                    { key: 'APPROVED', tone: 'good', count: mx?.approved },
                    { key: 'PENDING', tone: 'wait', count: mx?.pending },
                    { key: 'DRAFT', tone: 'idle', count: mx?.draft },
                    { key: 'RETURNED', tone: 'bad', count: mx?.returned },
                  ].map((part) => ({ ...part, label: U.status[part.key] }))}
                />
                <div className="td-statrow td-statrow--3">
                  <Stat label={J.profiled} value={percentOf(mx?.profiled, mx?.positions)} percent />
                  <Stat label={P.skillsPerPosition} value={skillsPerPosition} />
                  <Stat label={J.criticalSkills} value={mx?.critical} />
                </div>
              </AreaCard>
            )}

            {shows('catalog') && (
              <AreaCard
                area="catalog"
                icon="book-open"
                title={U.areas.training}
                hint={U.areas.trainingHint}
                href={hubHref.catalog}
                className="td-span-4"
                badge={
                  ct?.full > 0 && (
                    <Badge tone="watch" icon="ticket-check">
                      {U.badges.booked(ct.full)}
                    </Badge>
                  )
                }
              >
                <div className="td-headline">
                  <b>
                    <Value value={ct?.sessions} />
                  </b>
                  <span>{J.upcoming}</span>
                </div>
                <div className="td-capacity">
                  <div className="td-capacity__top">
                    <span className="td-eyebrow">{J.seatFill}</span>
                    <b>
                      <Value value={seatFill} percent />
                    </b>
                  </div>
                  <div className="td-capacity__bar" aria-hidden="true">
                    <i style={{ width: `${Math.min(100, seatFill ?? 0)}%` }} />
                  </div>
                  <ul className="td-legend td-legend--inline">
                    {[
                      ['taken', 'catalog', ct?.taken],
                      ['left', 'idle', ct?.left],
                      ['waitlist', 'wait', ct?.waitlist],
                    ].map(([name, tone, value]) => (
                      <li key={name} style={{ '--s': `var(--td-${tone})` }}>
                        <i aria-hidden="true" />
                        <span>{U.seats[name]}</span>
                        <b>
                          <Value value={value} />
                        </b>
                      </li>
                    ))}
                  </ul>
                </div>
                <ul className="td-chips" aria-label={T.mix.delivery}>
                  {['inPerson', 'online', 'blended'].map((mode) => (
                    <li key={mode}>
                      {T.mix.modes[mode]}
                      <b>
                        <Value value={ct?.[mode]} />
                      </b>
                    </li>
                  ))}
                </ul>
                <div className="td-statrow td-statrow--2">
                  <Stat label={J.eligible} value={ct?.eligible} />
                  <Stat
                    label={P.externalShare}
                    value={percentOf(ct?.external, ct?.sessions)}
                    percent
                  />
                </div>
              </AreaCard>
            )}

            {shows('team') && (
              <AreaCard
                area="team"
                icon="users"
                title={U.areas.team}
                hint={U.areas.teamHint}
                href={hubHref.team}
                className="td-span-4"
                badge={
                  typeof readiness === 'number' &&
                  (readiness >= TARGETS.readiness ? (
                    <Badge icon="rocket">{U.badges.ready}</Badge>
                  ) : (
                    <Badge tone="watch" icon="target">
                      {U.badges.gaps}
                    </Badge>
                  ))
                }
              >
                <div className="td-team">
                  <Ring
                    value={hubReady ? readiness : undefined}
                    caption={U.readinessRing}
                    size={120}
                  />
                  <div className="td-team__stats">
                    <Stat label={J.members} value={tm?.people} />
                    <Stat label={J.ready} value={percentOf(tm?.ready, tm?.people)} percent />
                  </div>
                </div>
                <div className="td-statrow td-statrow--2">
                  <Stat label={J.criticalPeople} value={tm?.atRisk} note={J.criticalPeopleHint} />
                  <Stat
                    label={P.neverAssessed}
                    value={percentOf(tm?.neverAssessed, tm?.people)}
                    percent
                    note={P.neverAssessedHint}
                  />
                </div>
              </AreaCard>
            )}

            {scorecard.length > 0 && (
              <section
                className="td-card td-span-12 td-card--tracker"
                aria-labelledby="td-scorecard-title"
              >
                <header className="td-section-head">
                  <span className="td-eyebrow">{U.tracker.eyebrow}</span>
                  <h2 id="td-scorecard-title">{U.tracker.title}</h2>
                  <p>{U.tracker.hint}</p>
                </header>
                <TargetTracker items={scorecard} lanes={lanes} labels={U.tracker} />
              </section>
            )}

            {chartModules.length > 0 && (
              <section
                className="td-card td-span-8 td-card--trend"
                style={{ '--a': `var(--td-${chart})` }}
                aria-label={U.trend.title}
              >
                <header className="td-trend__head">
                  <div>
                    <span className="td-eyebrow">{U.trend.title}</span>
                    <h2>{trendTitle}</h2>
                  </div>
                  {chartModules.length > 1 && (
                    <div className="td-switch" role="radiogroup" aria-label={U.trend.title}>
                      {chartModules.map((module) => (
                        <button
                          key={module}
                          type="button"
                          role="radio"
                          aria-checked={module === chart}
                          onClick={() => setChart(module)}
                        >
                          {module === 'appraisals' ? U.areas.performance : U.areas.recognition}
                        </button>
                      ))}
                    </div>
                  )}
                </header>
                <TrendChart
                  key={chart}
                  labels={trendLabels}
                  values={trendValues}
                  caption={trendTitle}
                />
              </section>
            )}

            {attention.length > 0 && (
              <section className="td-card td-span-4 td-card--actions" aria-label={U.actions.title}>
                <header className="td-actions__head">
                  <span className="td-eyebrow">{U.actions.hint}</span>
                  <h2>{U.actions.title}</h2>
                </header>
                <ActionList items={attention} />
              </section>
            )}
          </div>
        </>
      )}
    </div>
  )
}
