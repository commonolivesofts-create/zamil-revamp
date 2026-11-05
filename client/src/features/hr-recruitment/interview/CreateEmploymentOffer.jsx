import { Link } from 'react-router'
import usePermissions from '@/features/access/usePermissions.js'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { HR_RECRUITMENT_ACTIONS as ACTIONS } from '../hrRecruitmentActions.js'
import { canCreateEmploymentOffer } from './interviewModel.js'

export function CreateEmploymentOffer({ row, compact = false }) {
  const permissions = usePermissions()
  if (!canCreateEmploymentOffer(row) || !permissions.can(ACTIONS.OFFER_CREATE) || !permissions.can(ACTIONS.OFFER_VIEW)) return null
  return (
    <Link className={`zrv-ir-btn${compact ? ' zrv-ir-btn--assessment-compact' : ''}`}
      to={`/hr/recruitment/offer?assessmentNumber=${encodeURIComponent(row.assessmentNumber)}`}
      onClick={(event) => event.stopPropagation()}
      aria-label={`Create employment offer for ${row.candidateName}, assessment ${row.assessmentNumber}`}
      title={`Create an employment offer from assessment ${row.assessmentNumber}`}>
      <OrvexaIcon name="file-signature" size={16} />
      {compact ? <span>Create employment<small>offer</small></span> : 'Create employment offer'}
    </Link>
  )
}
