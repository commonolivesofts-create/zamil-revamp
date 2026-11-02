import { useNavigate } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import usePermissions from '@/features/access/usePermissions.js'
import { RecruitmentHeader } from '@/features/hr-recruitment/shared/components/RecruitmentShell.jsx'
import { ES_COMMON_TEXT as C } from '../hrEmployeeServicesText.js'
import '@/styles/hr-employee-services.css'

// The layout every HR form report shares (employee services and recruitment):
// header, a toolbar with the form (only for users who may create), Print and
// Home, the primary "new" button, then the report list.
// `create`: { permission, path, tool, label } (no permission: a session-only form).
export function ReportPage({ variant, title, subtitle, breadcrumb = C.breadcrumb, demo, create, children }) {
  const navigate = useNavigate()
  const permissions = usePermissions()
  const canCreate = !create.permission || permissions.can(create.permission)
  const openForm = () => navigate(create.path)
  return (
    <div className={`zrv-hr zrv-hr--${variant} zrv-hr--compact`}>
      <RecruitmentHeader title={title} subtitle={subtitle} breadcrumb={breadcrumb} demo={demo} />
      <div className="zrv-hr-toolbar" role="toolbar" aria-label={title}>
        <div className="zrv-hr-tools">
          {canCreate && <button type="button" onClick={openForm}><OrvexaIcon name="file-plus" size={17} /><span>{create.tool}</span></button>}
          <button type="button" onClick={() => window.print()}><OrvexaIcon name="printer" size={17} /><span>{C.print}</span></button>
          <button type="button" onClick={() => navigate('/dashboard')}><OrvexaIcon name="house" size={17} /><span>{C.home}</span></button>
        </div>
        {canCreate && <button type="button" className="btn-primary zrv-hr-btn" onClick={openForm}><OrvexaIcon name="plus" size={16} /> {create.label}</button>}
      </div>
      {children}
    </div>
  )
}
