import { LetterReportActions, LetterWorkflowActions } from '../shared/LetterReportActions.jsx'
import { LetterReportPreview } from '../shared/LetterReportPreview.jsx'
import { BUSINESS_VISA_PATHS as PATHS } from '../employeeServicesPaths.js'
import { NATIONALITIES } from './nationalities.js'
import { RESOURCE, blankRequest, businessVisaService as service } from './businessVisaService.js'
import BusinessVisaRequestPreview from './BusinessVisaRequestPreview.jsx'
// The report is a lazily loaded route, so the request paper styles load here.
import '@/styles/hr-business-visa.css'

const EMPTY = blankRequest('')
const nationality = (value) => NATIONALITIES.find((item) => item.value === value)?.label ?? value

// The saved request is a flat record; the form is the same keys as a blank one.
const formOf = (record) => Object.fromEntries(
  Object.keys(EMPTY).map((key) => [key, record[key] ?? EMPTY[key]]),
)

function Paper({ record, language }) {
  return (
    <BusinessVisaRequestPreview
      form={formOf(record)}
      record={record}
      divisionName={record.divisionName}
      nationality={nationality(record.nationality)}
      attachments={record.documents}
      language={language}
    />
  )
}

// Only the Business Visa Request had an approval lifecycle in the legacy
// project (INPROCESS / APPROVED / REJECTED / ACCEPTED); the other letters do
// not get Approve or Reject.
export function BusinessVisaReportPreview({ row, onClose }) {
  return (
    <LetterReportPreview
      row={row}
      recordKey={row.requestId}
      onClose={onClose}
      label="Business visa request preview"
      loading="Loading the business visa request…"
      failed="The business visa request could not be loaded."
      moduleClass="zrv-hr--business-visa"
      load={(signal) => service.getById(row.requestId, { signal })}
      paper={(record, language) => <Paper record={record} language={language} />}
      actions={({ record, language }) => (
        <LetterReportActions
          row={row}
          reference={row.requestNo || row.requestId}
          editPath={`${PATHS.form}/${encodeURIComponent(row.requestId)}`}
          editPermission={`${RESOURCE}:UPDATE`}
          viewPermission={`${RESOURCE}:VIEW`}
          canEdit={(saved) => saved?.editable === true}
          loadRecord={() => service.getById(row.requestId)}
          paper={(saved, previewLanguage) => <Paper record={saved} language={previewLanguage} />}
          moduleClass="zrv-hr--business-visa"
          printNoun="business visa request"
          language={language}
          previewRecord={record}
        />
      )}
      workflow={({ record }) => (
        <LetterWorkflowActions
          reference={row.requestNo || row.requestId}
          status={row.status}
          resource={RESOURCE}
          noun="business visa request"
          previewRecord={record}
        />
      )}
    />
  )
}
