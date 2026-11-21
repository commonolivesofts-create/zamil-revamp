import { ResourceState } from '@/features/security-administration/components/AdminUi.jsx'
import { useResource } from '@/features/security-administration/useAdminData.js'
import { COMMON_TEXT, REQUISITION_TEXT as T } from '../hrRecruitmentText.js'
import { enDate } from '../shared/hrFormat.js'
import { hrRecruitmentServices } from '../hrRecruitmentService.js'
import { DetailFacts, DetailSkeleton, SectionHeading } from '../shared/components/ReportDrawer.jsx'
import { RecruitmentActions } from './RecruitmentActions.jsx'

const R = T.report
const service = hrRecruitmentServices.requisitions
const date = (value) => (value ? enDate(value) : COMMON_TEXT.dash)
const yesNo = (value) => (value === true ? 'Yes' : value === false ? 'No' : COMMON_TEXT.dash)
const text = (value) => value || COMMON_TEXT.dash

// Rich, consistent drawer content for one requisition: the saved record, the
// position and its requirements, the recruitment progress and the available
// actions. The report row already has the headline; this loads the full record.
export function RequisitionDetails({ row, onChanged }) {
  const record = useResource(`hr-requisition-report-detail:${row.requisitionId}`, (signal) =>
    service.getById(row.requisitionId, { signal }),
  )
  const loading = (
    <DetailSkeleton
      title="Requisition details"
      description={`Loading saved requisition ${row.requisitionNumber || row.requisitionId}…`}
    />
  )
  if (record.status === 'loading') return loading
  return (
    <ResourceState
      resource={record}
      label="requisition details"
      empty="No saved requisition details are available."
      isEmpty={() => false}
    >
      {(detail) => {
        const reason =
          detail.reason === 'REPLACEMENT'
            ? R.reasons.Replacement
            : detail.reason === 'ADDITION'
              ? R.reasons.Addition
              : COMMON_TEXT.dash
        return (
          <>
            <section className="zrv-ir-detail" aria-label="Requisition details">
              <SectionHeading
                icon="clipboard-list"
                title="Requisition details"
                description={`Complete saved record for ${detail.requisitionNumber || detail.requisitionId}`}
              />
              <DetailFacts
                columns={3}
                facts={[
                  ['Requisition no.', detail.requisitionNumber],
                  ['Status', T.status[detail.status] ?? detail.status],
                  [R.detail.requester, detail.requesterName],
                  [R.detail.department, detail.departmentName],
                  [R.detail.requestDate, date(detail.requestDate)],
                  [R.detail.neededDate, date(detail.neededDate)],
                  [R.detail.reason, reason],
                  ['Budgeted', yesNo(detail.budgeted)],
                  ['Budgeted salary', detail.budgetedSalary],
                ]}
              />
              {detail.remark && (
                <p className="zrv-ir-detail-note">
                  <b>Request remark: </b>
                  {detail.remark}
                </p>
              )}
            </section>

            <section className="zrv-ir-detail" aria-label="Position and requirements">
              <SectionHeading
                icon="briefcase-business"
                title="Position & requirements"
                description={text(detail.jobTitle)}
                tone="mint"
              />
              <DetailFacts
                columns={2}
                facts={[
                  ['Position', detail.jobTitle],
                  [
                    'Total package',
                    detail.totalPackage == null ? COMMON_TEXT.dash : String(detail.totalPackage),
                  ],
                  ['GCC experience', text(detail.gccExp)],
                  ['Relevant experience', text(detail.workExp)],
                  [
                    'Qualification',
                    detail.degree
                      ? 'Degree'
                      : detail.masterDegree
                        ? 'Master'
                        : detail.highSchool
                          ? 'High school'
                          : detail.diploma || detail.higherDiploma
                            ? 'Diploma'
                            : COMMON_TEXT.dash,
                  ],
                  ['Skills', text(detail.skills)],
                  ['Other requirements', text(detail.otherRequirements)],
                ]}
              />
            </section>

            {(detail.replacementFor || detail.additionReason) && (
              <section className="zrv-ir-detail" aria-label="Request justification">
                <SectionHeading
                  icon="info"
                  title="Request justification"
                  description="Why this position was requested"
                />
                <DetailFacts
                  columns={1}
                  facts={[
                    ...(detail.replacementFor ? [['Replacement for', detail.replacementFor]] : []),
                    ...(detail.additionReason
                      ? [['Reason for addition', detail.additionReason]]
                      : []),
                  ]}
                />
              </section>
            )}

            <section className="zrv-ir-detail" aria-label="Recruitment progress">
              <SectionHeading
                icon="workflow"
                title="Recruitment progress"
                description="Current ticket status and decision dates"
                tone="amber"
              />
              <DetailFacts
                columns={3}
                facts={[
                  [R.detail.ticket, detail.ticketStatus || 'Open'],
                  ['Offer accepted', date(detail.acceptedDate)],
                  ['Closed', date(detail.closedDate)],
                ]}
              />
            </section>

            {detail.attachments?.length > 0 && (
              <section className="zrv-ir-detail" aria-label="Attachments">
                <SectionHeading
                  icon="paperclip"
                  title="Attachments"
                  description={`${detail.attachments.length} file${detail.attachments.length === 1 ? '' : 's'} attached`}
                />
                <DetailFacts
                  columns={1}
                  facts={detail.attachments.map((file) => [file.fileName, file.fileName])}
                />
              </section>
            )}

            <section className="zrv-ir-detail" aria-label="Requisition actions">
              <SectionHeading
                icon="bolt"
                title="Actions"
                description="Continue this requisition from here"
              />
              <div className="zrv-ir-detail-actions">
                <RecruitmentActions
                  key={detail.requisitionId}
                  requisitionId={detail.requisitionId}
                  onChanged={(changes) => {
                    record.reload()
                    onChanged?.(changes)
                  }}
                />
              </div>
            </section>
          </>
        )
      }}
    </ResourceState>
  )
}
