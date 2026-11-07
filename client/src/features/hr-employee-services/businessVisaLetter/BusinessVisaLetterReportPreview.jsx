import { LetterReportActions } from '../shared/LetterReportActions.jsx'
import { LetterReportPreview } from '../shared/LetterReportPreview.jsx'
import { BUSINESS_VISA_LETTER_PATHS as PATHS } from '../employeeServicesPaths.js'
import { RESOURCE, businessVisaLetterService as service } from './businessVisaLetterService.js'
import BusinessVisaLetterPreview from './BusinessVisaLetterPreview.jsx'
// The report is a lazily loaded route, so the letter paper styles load here.
import '@/styles/hr-business-visa-letter.css'

function Paper({ record, language, lookups }) {
  return <BusinessVisaLetterPreview form={record.form} language={language} lookups={lookups} />
}

// The legacy business visa letter list had only Draft and Final, with no
// approval decision, so this drawer has Edit and Print only.
export function BusinessVisaLetterReportPreview({ row, onClose, lookups = null }) {
  return (
    <LetterReportPreview
      row={row}
      recordKey={row.letterId}
      onClose={onClose}
      label="Business visa letter preview"
      loading="Loading the business visa letter…"
      failed="The business visa letter could not be loaded."
      moduleClass="zrv-hr--business-visa-letter"
      load={(signal) => service.getById(row.letterId, { signal })}
      paper={(record, language) => <Paper record={record} language={language} lookups={lookups} />}
      actions={({ record, language }) => (
        <LetterReportActions
          row={row}
          reference={row.form.ref_no || row.letterId}
          editPath={`${PATHS.form}/${encodeURIComponent(row.letterId)}`}
          editPermission={`${RESOURCE}:UPDATE`}
          viewPermission={`${RESOURCE}:VIEW`}
          loadRecord={() => service.getById(row.letterId)}
          paper={(saved, previewLanguage) => <Paper record={saved} language={previewLanguage} lookups={lookups} />}
          moduleClass="zrv-hr--business-visa-letter"
          printNoun="business visa letter"
          language={language}
          previewRecord={record}
        />
      )}
    />
  )
}
