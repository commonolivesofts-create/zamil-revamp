import { ResourceState } from '@/features/security-administration/components/AdminUi.jsx'
import { useResource } from '@/features/security-administration/useAdminData.js'
import { COMMON_TEXT, INTERVIEW_TEXT as T } from '../hrRecruitmentText.js'
import { enDate, formatAmount } from '../shared/hrFormat.js'
import { hrRecruitmentServices } from '../hrRecruitmentService.js'
import { DetailFacts, DetailSection, DetailSkeleton } from '../shared/components/ReportDrawer.jsx'
import { BandBar } from '../shared/components/InsightCards.jsx'
import {
  BANDS,
  COMP_KEYS,
  SCORE_MAX,
  SPEC_KEYS,
  bandLabel,
  bandOf,
  ratedCount,
  salaryDelta,
  sumRatings,
} from './interviewModel.js'

const service = hrRecruitmentServices.interviews
const BAND_TONE = Object.freeze({ POOR: 'bad', GOOD: 'mint', OUTSTANDING: 'primary' })
// Mirrors the sections rendered below so the loading state settles into the
// same layout instead of jumping from a generic block of bars.
const LOADING_SECTIONS = Object.freeze([
  {
    title: 'Score summary',
    icon: 'chart-no-axes-combined',
    description: 'Rating groups, bands and the interviewer’s notes',
    type: 'scores',
  },
  {
    title: 'Assessment details',
    icon: 'clipboard-check',
    description: 'Complete saved record and interview details',
    columns: 3,
    rows: 4,
  },
  {
    title: 'Candidate profile',
    icon: 'user-round',
    tone: 'mint',
    description: 'Personal and professional details',
    columns: 3,
    rows: 4,
  },
  {
    title: 'Compensation',
    icon: 'wallet',
    tone: 'amber',
    description: 'Expected against current package',
    columns: 4,
    rows: 2,
  },
  {
    title: 'Panel & evaluation',
    icon: 'users',
    description: 'Interviewers and the recorded decision',
    columns: 2,
    rows: 4,
  },
])
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
  const loading = <DetailSkeleton sections={LOADING_SECTIONS} />
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
        const specRated = ratedCount(detail.personalSpecification ?? {}, SPEC_KEYS) > 0
        const compRated = ratedCount(detail.competency ?? {}, COMP_KEYS) > 0
        const delta = salaryDelta(detail.expectedTotal, detail.currentTotal)
        return (
          <>
            <DetailSection
              label="Score summary"
              icon="chart-no-axes-combined"
              title="Score summary"
              description="Rating groups, bands and the interviewer's notes"
              bare
            >
              <div className="zrv-ir-detail-scores">
                <BandBar
                  value={specTotal}
                  max={SCORE_MAX.spec}
                  bands={BANDS.spec}
                  tone={BAND_TONE[bandOf(specTotal, BANDS.spec, specRated)[1]]}
                  name="Specification"
                  label={bandLabel(specTotal, BANDS.spec, specRated)}
                />
                <BandBar
                  value={compTotal}
                  max={SCORE_MAX.comp}
                  bands={BANDS.comp}
                  tone={BAND_TONE[bandOf(compTotal, BANDS.comp, compRated)[1]]}
                  name="Competency"
                  label={bandLabel(compTotal, BANDS.comp, compRated)}
                />
              </div>
              {(detail.strengths || detail.weakness) && (
                <DetailFacts
                  columns={2}
                  facts={[
                    [T.labels.strengths, detail.strengths],
                    [T.labels.weakness, detail.weakness],
                  ]}
                />
              )}
            </DetailSection>

            <DetailSection
              label="Assessment details"
              icon="clipboard-check"
              title="Assessment details"
              description={`Complete saved record for ${detail.assessmentNumber || detail.assessmentId}`}
            >
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
            </DetailSection>

            <DetailSection
              label="Candidate profile"
              icon="user-round"
              title="Candidate profile"
              description={text(detail.candidateName)}
              tone="mint"
            >
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
            </DetailSection>

            <DetailSection
              label="Compensation"
              icon="wallet"
              title="Compensation"
              description="Expected against current package"
              tone="amber"
            >
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
            </DetailSection>

            <DetailSection
              label="Interview panel and evaluation"
              icon="users"
              title="Panel & evaluation"
              description="Interviewers and the recorded decision"
            >
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
            </DetailSection>
          </>
        )
      }}
    </ResourceState>
  )
}
