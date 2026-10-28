import { useEffect } from 'react'
import { useLocation, useParams } from 'react-router'
import useAuth from '@/features/auth/useAuth.js'
import { ResourceState } from '@/features/security-administration/components/AdminUi.jsx'
import { useResource } from '@/features/security-administration/useAdminData.js'
import { COMMON_TEXT } from '../../hrRecruitmentText.js'
import { hrRecruitmentServices, identifyDemoUser } from '../../hrRecruitmentService.js'
import { FlowNav, RecruitmentHeader } from './RecruitmentShell.jsx'
import '@/styles/hr-recruitment.css'

// Loads the form options and, on a record URL, the record; renders the editor
// once both are ready. A new form (no id) gets a fresh editor per visit, so
// "Request form" always opens a blank form.
export function RecruitmentLoader({ current, title, subtitle, param, load, children }) {
  const params = useParams()
  const location = useLocation()
  const id = params[param] ?? null
  const { user } = useAuth()
  // Demo only: the adapter records the signed-in name as requester, scheduler or evaluator.
  useEffect(() => identifyDemoUser(user?.fullName), [user?.fullName])
  const lookups = useResource('hr-recruitment-lookups', (signal) => hrRecruitmentServices.lookups.get({ signal }))
  const record = useResource(id ? `hr-recruitment-${current}:${id}` : null, (signal) => load(id, { signal }))
  const frame = (content) => (
    <div className={`zrv-hr zrv-hr--${current}`}>
      <RecruitmentHeader title={title} subtitle={subtitle} />
      <FlowNav current={current} />
      <div className="zrv-admin-panel">{content}</div>
    </div>
  )

  if (lookups.status !== 'ready') {
    return frame(<ResourceState resource={lookups} label={COMMON_TEXT.loadingLookups} empty={COMMON_TEXT.loadingLookups}>{() => null}</ResourceState>)
  }
  if (id && record.status !== 'ready') {
    return frame(<ResourceState resource={record} label={COMMON_TEXT.loadingRecord} empty={COMMON_TEXT.notFound} notFound={COMMON_TEXT.notFound}>{() => null}</ResourceState>)
  }
  return children({ lookups: lookups.data, record: id ? record.data : null, editorKey: id ?? `new:${location.key}` })
}
