import { ReportPage } from '@/features/hr-employee-services/shared/ReportPage.jsx'
import { ServerRecordList } from '@/features/hr-employee-services/shared/ServerRecordList.jsx'
import { COMMON_TEXT } from '../../hrRecruitmentText.js'

// A recruitment form's report: the shared report layout over a server-filtered
// list. `list(query, { signal })` is the form service's list, which takes the
// backend's list query (limit, sortBy, sortDir and the filters).
export function RecruitmentReport({ variant, title, subtitle, demo, create, list, heading, resourceKey, filters, columns, defaultSort, numberOf, pathOf }) {
  const load = ({ pageSize, sort, order, ...query }, options) => list({ ...query, limit: pageSize, sortBy: sort, sortDir: order }, options)
  return (
    <ReportPage variant={variant} title={title} subtitle={subtitle} breadcrumb={COMMON_TEXT.breadcrumb} demo={demo} create={create}>
      <ServerRecordList heading={heading} resourceKey={resourceKey} load={load} filters={filters} columns={columns}
        defaultSort={defaultSort} numberOf={numberOf} pathOf={pathOf} />
    </ReportPage>
  )
}
