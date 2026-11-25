import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import useAuth from '@/features/auth/useAuth.js'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import {
  emitApiUnavailable,
  getApiUnavailableError,
  subscribeApiUnavailable,
} from '@/services/api/apiEvents.js'
import { isGlobalDataLoadFailure } from '@/services/api/apiClient.js'
import ContentSkeleton from '@/components/feedback/ContentSkeleton.jsx'
import GlobalErrorScreen from '@/components/feedback/GlobalErrorScreen.jsx'
import { ResourceState } from '@/features/security-administration/components/AdminUi.jsx'
import { useResource } from '@/features/security-administration/useAdminData.js'
import { COMMON_TEXT } from '../../hrRecruitmentText.js'
import { identifyDemoUser } from '../../hrRecruitmentService.js'
import { FlowNav, RecruitmentHeader } from './RecruitmentShell.jsx'
import '@/styles/hr-recruitment.css'

// Loads the form options and, on a record URL, the record. Requisition options
// are helpful suggestions, so an unavailable lookup must not hide its form.
// A new form (no id) gets a fresh editor per visit, so "Request form" always
// opens a blank form. `flow={false}` leaves out the recruitment flow (screens
// outside it); `identify` tells a demo adapter the signed-in name, and
// `breadcrumb` replaces the recruitment breadcrumb.
export function RecruitmentLoader({
  current,
  title,
  subtitle,
  param,
  load,
  loadLookups,
  demo = false,
  flow = true,
  identify = identifyDemoUser,
  breadcrumb,
  children,
}) {
  const params = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const id = params[param] ?? null
  const { user } = useAuth()
  const loadLookupsRef = useRef(loadLookups)
  // Demo only: the adapter records the signed-in name as requester, scheduler or evaluator.
  useEffect(() => identify(user?.fullName), [identify, user?.fullName])
  useEffect(() => {
    loadLookupsRef.current = loadLookups
  }, [loadLookups])
  const lookups = useResource(`hr-recruitment-lookups:${current}`, loadLookups)
  const record = useResource(id ? `hr-recruitment-${current}:${id}` : null, (signal) =>
    load(id, { signal }),
  )
  const newLabel = `New ${title}`
  const lookupFailureKey = (lookups.data?.lookupErrors ?? []).join(',')
  // Some form services return partial lookup results via Promise.allSettled.
  // Subscribe so a transport failure emitted during that load can still block
  // the form and replace its dependent content with the shared error state.
  const apiUnavailable = useSyncExternalStore(
    subscribeApiUnavailable,
    getApiUnavailableError,
    () => null,
  )
  const lookupGlobalError =
    lookups.status === 'error'
      ? isGlobalDataLoadFailure(lookups.error) || lookups.error?.code === 'ABORTED'
      : Boolean(
          lookupFailureKey &&
            (!apiUnavailable?.resourceKey || apiUnavailable.resourceKey === lookups.resourceKey) &&
            isGlobalDataLoadFailure(apiUnavailable?.error),
        )
  useEffect(() => {
    if (lookups.status !== 'ready' || !lookupGlobalError || !lookupFailureKey) return
    if (
      apiUnavailable?.placement === 'resource' &&
      apiUnavailable.resourceKey === `hr-recruitment-lookups:${current}`
    )
      return
    const error = new Error('Required form options could not be loaded.')
    emitApiUnavailable(error, () => loadLookupsRef.current(new AbortController().signal), {
      placement: 'resource',
      resourceKey: `hr-recruitment-lookups:${current}`,
    })
  }, [apiUnavailable, current, lookupFailureKey, lookupGlobalError, lookups.status])
  const basePath = id ? location.pathname.slice(0, location.pathname.lastIndexOf('/')) : location.pathname
  const frame = (content, loading = false) => (
    <div className={`zrv-hr zrv-hr--${current}`}>
      <RecruitmentHeader title={title} subtitle={subtitle} demo={demo} breadcrumb={breadcrumb} />
      {flow && <FlowNav current={current} />}
      <div className="zrv-hr-toolbar" role="toolbar" aria-label={COMMON_TEXT.toolbarLabel}>
        <div className="zrv-hr-tools">
          {[
            { icon: 'printer', label: COMMON_TEXT.print, onClick: () => window.print() },
            { icon: 'chart-column', label: COMMON_TEXT.report, onClick: () => navigate(`${basePath}/report`) },
            { icon: 'file-plus', label: newLabel, onClick: () => navigate(basePath) },
            { icon: 'house', label: COMMON_TEXT.home, onClick: () => navigate('/dashboard') },
          ].map((tool) => (
            <button
              key={tool.label}
              type="button"
              onClick={tool.onClick}
              disabled={loading}
              title={tool.label}
            >
              <OrvexaIcon name={tool.icon} size={17} />
              <span>{tool.label}</span>
            </button>
          ))}
        </div>
        <div className="zrv-hr-toolbar__actions">
          <button type="button" className="btn-primary zrv-hr-btn" disabled>
            <OrvexaIcon name="save" size={16} />
            <span className="zrv-hr-btn__label">{COMMON_TEXT.save}</span>
          </button>
        </div>
      </div>
      {loading ? (
        <ContentSkeleton variant="form" label={`Loading ${title}`} />
      ) : (
        <div className="zrv-admin-panel">{content}</div>
      )}
    </div>
  )

  if (current !== 'requisition' && lookups.status !== 'ready') {
    return frame(
      <ResourceState
        resource={lookups}
        label={COMMON_TEXT.loadingLookups}
        empty={COMMON_TEXT.loadingLookups}
      >
        {() => null}
      </ResourceState>,
      lookups.status === 'loading',
    )
  }
  // Partial lookup failures are represented as ready data plus lookupErrors.
  // Once the shared API event identifies a connectivity failure, keep only the
  // page frame and error state mounted; the editor's wizard steps and cards are
  // data-dependent and should disappear with the failed content.
  if (lookupGlobalError && lookups.status === 'ready') {
    return frame(
      <div className="zrv-global-error-slot">
        <GlobalErrorScreen inline onRetry={lookups.reload} retryAll={false} />
      </div>,
    )
  }
  if (id && record.status !== 'ready') {
    return frame(
      <ResourceState
        resource={record}
        label={COMMON_TEXT.loadingRecord}
        empty={COMMON_TEXT.notFound}
        notFound={COMMON_TEXT.notFound}
      >
        {() => null}
      </ResourceState>,
      record.status === 'loading',
    )
  }
  return children({
    lookups: lookups.data ?? { jobs: [], departments: [], requester: '', replacements: [] },
    lookupStatus: lookups.status,
    lookupGlobalError,
    reloadLookups: lookups.reload,
    record: id ? record.data : null,
    editorKey: id ?? `new:${location.key}`,
  })
}
