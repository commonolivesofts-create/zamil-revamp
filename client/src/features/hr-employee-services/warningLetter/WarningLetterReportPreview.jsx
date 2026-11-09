import { LetterReportActions } from '../shared/LetterReportActions.jsx'
import { LetterReportPreview } from '../shared/LetterReportPreview.jsx'
import { WARNING_LETTER_PATHS as PATHS } from '../employeeServicesPaths.js'
import { RESOURCE, letterFormOf, warningLetterService as service } from './warningLetterService.js'
import WarningLetterPreview from './WarningLetterPreview.jsx'
// The report is a lazily loaded route, so the letter paper styles load here.
import '@/styles/hr-warning-letter.css'

function Paper({ record, language }) {
  return (
    <WarningLetterPreview
      form={letterFormOf(record)}
      record={record}
      employee={record.employee}
      warningNo={record.warningNo}
      language={language}
    />
  )
}

// The legacy warning report had Edit and Print only, with no approval
// decision, so this drawer has Edit and Print only.
export function WarningLetterReportPreview({ row, onClose }) {
  return (
    <LetterReportPreview
      row={row}
      recordKey={row.letterId}
      onClose={onClose}
      label="Warning letter preview"
      loading="Loading the warning letter…"
      failed="The warning letter could not be loaded."
      moduleClass="zrv-hr--warning-letter"
      load={(signal) => service.getById(row.letterId, { signal })}
      paper={(record, language) => <Paper record={record} language={language} />}
      actions={({ record, language }) => (
        <LetterReportActions
          row={row}
          reference={row.referenceNo || row.letterId}
          editPath={`${PATHS.form}/${encodeURIComponent(row.letterId)}`}
          editPermission={`${RESOURCE}:UPDATE`}
          viewPermission={`${RESOURCE}:VIEW`}
          loadRecord={() => service.getById(row.letterId)}
          paper={(saved, previewLanguage) => <Paper record={saved} language={previewLanguage} />}
          moduleClass="zrv-hr--warning-letter"
          printNoun="warning letter"
          language={language}
          previewRecord={record}
        />
      )}
    />
  )
}
