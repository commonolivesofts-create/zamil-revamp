import { LetterReportActions } from '../shared/LetterReportActions.jsx'
import { LetterReportPreview } from '../shared/LetterReportPreview.jsx'
import { SALARY_CERTIFICATE_PATHS as PATHS } from '../employeeServicesPaths.js'
import { LANGUAGES, salaryCertificateService as service } from './salaryCertificateService.js'
import SalaryCertificatePreview from './SalaryCertificatePreview.jsx'
// The report is a lazily loaded route, so the certificate paper styles load here.
import '@/styles/hr-salary-certificate.css'

// A saved certificate reads in its own language (the Arabic API stores Arabic
// names and titles), so this drawer has no language switch: it prints exactly
// as it was stored.
const formOf = (record) => ({
  language: record.language,
  employee: record.employee,
  certDate: record.certDate,
  toEmpName: record.toEmpName,
  approvalName: record.approvalName,
})

function Paper({ record }) {
  const form = formOf(record)
  return (
    <SalaryCertificatePreview
      form={form}
      record={record}
      lang={LANGUAGES[record.language]}
      employee={record.employee}
      approver={{ position: record.approvalPosition }}
    />
  )
}

export function SalaryCertificateReportPreview({ row, onClose }) {
  const language = LANGUAGES[row.language]
  return (
    <LetterReportPreview
      row={row}
      recordKey={row.certificateId}
      onClose={onClose}
      label="Salary certificate preview"
      loading="Loading the salary certificate…"
      failed="The salary certificate could not be loaded."
      languageSwitch={false}
      moduleClass="zrv-hr--salary-certificate"
      load={(signal) => service.getById(row.certificateId, { signal })}
      paper={(record) => <Paper record={record} />}
      actions={({ record, language: previewLanguage }) => (
        <LetterReportActions
          row={row}
          reference={row.refNo || row.certificateId}
          editPath={`${PATHS.form}/${encodeURIComponent(row.certificateId)}`}
          editPermission={`${language.permission}:UPDATE`}
          viewPermission={`${language.permission}:VIEW`}
          canEdit={(saved) => saved?.status === 'DRAFT'}
          loadRecord={() => service.getById(row.certificateId)}
          paper={(saved) => <Paper record={saved} />}
          moduleClass="zrv-hr--salary-certificate"
          printNoun="salary certificate"
          language={previewLanguage}
          previewRecord={record}
        />
      )}
    />
  )
}
