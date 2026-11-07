import { LetterReportActions } from '../shared/LetterReportActions.jsx'
import { LetterReportPreview } from '../shared/LetterReportPreview.jsx'
import { TOURIST_VISA_PATHS as PATHS } from '../employeeServicesPaths.js'
import { RESOURCE, letterFormOf, touristVisaService as service } from './touristVisaService.js'
import TouristVisaPreview from './TouristVisaPreview.jsx'
// The report is a lazily loaded route, so the letter paper styles load here.
import '@/styles/hr-tourist-visa.css'

function Paper({ record, language }) {
  return (
    <TouristVisaPreview
      form={letterFormOf(record)}
      record={record}
      employee={record.employee}
      approver={{ position: record.positionName }}
      language={language}
    />
  )
}

// The legacy tourist visa report had Edit and PDF only, with no approval
// decision, so this drawer has Edit and Print only.
export function TouristVisaReportPreview({ row, onClose }) {
  return (
    <LetterReportPreview
      row={row}
      recordKey={row.letterId}
      onClose={onClose}
      label="Tourist visa letter preview"
      loading="Loading the tourist visa letter…"
      failed="The tourist visa letter could not be loaded."
      moduleClass="zrv-hr--tourist-visa"
      load={(signal) => service.getById(row.letterId, { signal })}
      paper={(record, language) => <Paper record={record} language={language} />}
      actions={({ record, language }) => (
        <LetterReportActions
          row={row}
          reference={row.refNo || row.letterId}
          editPath={`${PATHS.form}/${encodeURIComponent(row.letterId)}`}
          editPermission={`${RESOURCE}:UPDATE`}
          viewPermission={`${RESOURCE}:VIEW`}
          loadRecord={() => service.getById(row.letterId)}
          paper={(saved, previewLanguage) => <Paper record={saved} language={previewLanguage} />}
          moduleClass="zrv-hr--tourist-visa"
          printNoun="tourist visa letter"
          language={language}
          previewRecord={record}
        />
      )}
    />
  )
}
