import { ResourceState } from '@/features/security-administration/components/AdminUi.jsx'
import { useResource } from '@/features/security-administration/useAdminData.js'
import { COMMON_TEXT, INTERVIEW_TEXT as T } from '../hrRecruitmentText.js'
import { enDate, formatAmount } from '../shared/hrFormat.js'
import { hrRecruitmentServices } from '../hrRecruitmentService.js'
import { DetailFacts, DetailSkeleton, SectionHeading } from '../shared/components/ReportDrawer.jsx'
import {
  BANDS,
  COMP_KEYS,
  SCORE_MAX,
  SPEC_KEYS,
  bandLabel,
  ratedCount,
  salaryDelta,
  sumRatings,
} from './interviewModel.js'

const service = hrRecruitmentServices.interviews
const date = (value) => (value ? enDate(value) : COMMON_TEXT.dash)
const text = (value) => value || COMMON_TEXT.dash
const amount = (value) => (value == null || value === '' ? COMMON_TEXT.dash : formatAmount(value))
const yesNo = (value) => (value ? 'Yes' : COMMON_TEXT.dash)

// Rich, consistent drawer content for one interview assessment: the saved
// record, candidate profile, compensation, panel and score summary. The report
// row already carries the headline; this loads the full assessment.
export function InterviewDetails({ row }) {
  const record = useResource(`hr-interview-report-detail:${row.assessmentId}`, (signal) =>
    service.getById(row.assessmentId, { signal }),
  )
  const loading = (
    <DetailSkeleton
      title="Assessment details"
      description={`Loading saved assessment ${row.assessmentNumber || row.assessmentId}…`}
    />
  )
  if (record.status === 'loading') return loading
  return (
    <ResourceState
      resource={record}
      label="assessment details"
      empty="No saved assessment details are available."
      isEmpty={() => false}
    >
      {(detail) => {
        const specTotal = sumRatings(detail.personalSpecification ?? {})
        const compTotal = sumRatings(detail.competency ?? {})
        const delta = salaryDelta(detail.expectedTotal, detail.currentTotal)
        return (
          <>
            <section className="zrv-ir-detail" aria-label="Assessment details">
              <SectionHeading
                icon="clipboard-check"
                title="Assessment details"
                description={`Complete saved record for ${detail.assessmentNumber || detail.assessmentId}`}
              />
              <DetailFacts
                columns={3}
                facts={[
                  ['Assessment no.', detail.assessmentNumber],
                  ['Approval status', T.status[detail.status] ?? detail.status],
                  [
                    T.report.columns.outcome,
                    detail.outcome ? T.outcomes[detail.outcome] : COMMON_TEXT.dash,
                  ],
                  [T.labels.position, detail.positionTitle],
                  [T.labels.requisitionNumber, detail.requisitionNumber],
                  [T.labels.divisionCode, detail.divisionCode],
                  [T.labels.preScreeningDate, date(detail.preScreeningDate)],
                  [T.labels.interviewTime, detail.interviewTime],
                  [T.labels.interviewTypeCode, detail.interviewTypeCode],
                  [T.labels.expectedJoiningDate, date(detail.expectedJoiningDate)],
                ]}
              />
            </section>

            <section className="zrv-ir-detail" aria-label="Candidate profile">
              <SectionHeading
                icon="user-round"
                title="Candidate profile"
                description={text(detail.candidateName)}
                tone="mint"
              />
              <DetailFacts
                columns={3}
                facts={[
                  [T.labels.candidateName, detail.candidateName],
                  [T.labels.candidateAge, detail.candidateAge ?? COMMON_TEXT.dash],
                  [T.labels.nationality, detail.nationality],
                  [T.labels.maritalStatusCode, detail.maritalStatusCode],
                  [T.labels.location, detail.location],
                  [T.labels.certificateCode, detail.certificateCode],
                  [T.labels.certificateCheckedCode, detail.certificateCheckedCode],
                  [T.labels.major, detail.major],
                  [T.labels.currentEmployer, detail.currentEmployer],
                  [T.labels.lastPosition, detail.lastPosition],
                  [
                    T.labels.relevantExperienceYears,
                    detail.relevantExperienceYears ?? COMMON_TEXT.dash,
                  ],
                ]}
              />
            </section>

            <section className="zrv-ir-detail" aria-label="Compensation">
              <SectionHeading
                icon="wallet"
                title="Compensation"
                description="Expected against current package"
                tone="amber"
              />
              <DetailFacts
                columns={4}
                facts={[
                  ['Expected basic', amount(detail.expectedBasic)],
                  ['Expected total', amount(detail.expectedTotal)],
                  ['Current basic', amount(detail.currentBasic)],
                  ['Current total', amount(detail.currentTotal)],
                  ...(delta !== null
                    ? [['Expected vs current', `${delta > 0 ? '+' : ''}${delta}%`]]
                    : []),
                ]}
              />
            </section>

            <section className="zrv-ir-detail" aria-label="Score summary">
              <SectionHeading
                icon="chart-no-axes-combined"
                title="Score summary"
                description="Rating groups and the result band"
              />
              <DetailFacts
                columns={2}
                facts={[
                  ['Personal specification', `${specTotal}/${SCORE_MAX.spec}`],
                  [
                    'Personal spec. band',
                    bandLabel(
                      specTotal,
                      BANDS.spec,
                      ratedCount(detail.personalSpecification ?? {}, SPEC_KEYS) > 0,
                    ),
                  ],
                  ['Competency', `${compTotal}/${SCORE_MAX.comp}`],
                  [
                    'Competency band',
                    bandLabel(
                      compTotal,
                      BANDS.comp,
                      ratedCount(detail.competency ?? {}, COMP_KEYS) > 0,
                    ),
                  ],
                  [T.labels.strengths, detail.strengths],
                  [T.labels.weakness, detail.weakness],
                ]}
              />
            </section>

            <section className="zrv-ir-detail" aria-label="Interview panel and evaluation">
              <SectionHeading
                icon="users"
                title="Panel & evaluation"
                description="Interviewers and the recorded decision"
              />
              <DetailFacts
                columns={2}
                facts={[
                  ...(detail.interviewers ?? [])
                    .map((name, index) => [`Interviewer ${index + 1}`, name])
                    .filter(([, value]) => value),
                  [T.labels.adminManager, detail.adminManagerName],
                  [T.labels.deptRep, detail.departmentRepresentative],
                  [T.labels.hrRep, detail.hrRepresentative],
                  [T.labels.payroll, detail.payroll],
                  [T.labels.hrComment, detail.hrComment],
                  ['Appraised by MD', yesNo(detail.managingDirector)],
                ]}
              />
            </section>
          </>
        )
      }}
    </ResourceState>
  )
}
