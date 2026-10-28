import { useState } from 'react'
import { Link } from 'react-router'
import { ConfirmDialog, Dialog, Pagination, ResourceState } from '@/features/security-administration/components/AdminUi.jsx'
import { formatInstant } from '@/features/security-administration/adminFeedback.js'
import { useResource } from '@/features/security-administration/useAdminData.js'
import { COMMON_TEXT } from '../../hrRecruitmentText.js'
import { REPORT_PAGE_SIZE } from '../../hrRecruitmentService.js'

// Report: the recent records of one form, a page at a time, each linking to
// its form. `columns`: [[header, (item) => value]].
export function ReportDialog({ title, resourceKey, load, columns, numberOf, statusOf, pathOf, onClose }) {
  const [page, setPage] = useState(1)
  const records = useResource(`${resourceKey}:${page}`, (signal) => load({ page, limit: REPORT_PAGE_SIZE }, { signal }))
  return (
    <Dialog title={title} onClose={onClose} wide>
      <ResourceState resource={records} label="records" empty={COMMON_TEXT.reportEmpty}>
        {({ items, pagination }) => (
          <>
            <div className="ux-table-wrap">
              <table className="ux-table zrv-admin-table zrv-admin-table--compact">
                <caption className="zrv-hr-sr">{COMMON_TEXT.reportCaption}</caption>
                <thead>
                  <tr>
                    <th scope="col">{COMMON_TEXT.reportNumber}</th>
                    {columns.map(([header]) => <th key={header} scope="col">{header}</th>)}
                    <th scope="col">{COMMON_TEXT.reportStatus}</th>
                    <th scope="col">{COMMON_TEXT.reportUpdated}</th>
                    <th scope="col"><span className="zrv-hr-sr">{COMMON_TEXT.open}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={pathOf(item)}>
                      <td>{numberOf(item) || COMMON_TEXT.dash}</td>
                      {columns.map(([header, value]) => <td key={header}>{value(item) || COMMON_TEXT.dash}</td>)}
                      <td>{statusOf(item)}</td>
                      <td>{formatInstant(item.updatedAt)}</td>
                      <td><Link className="zrv-admin-link" to={pathOf(item)} onClick={onClose}>{COMMON_TEXT.open}</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination pagination={pagination} onPage={setPage} disabled={records.refreshing} />
          </>
        )}
      </ResourceState>
      <div className="zrv-dialog__actions">
        <button type="button" className="btn-secondary" onClick={onClose}>{COMMON_TEXT.close}</button>
      </div>
    </Dialog>
  )
}

// Confirmation before a new blank form replaces unsaved answers.
export function NewFormDialog({ onConfirm, onClose }) {
  return (
    <ConfirmDialog title={COMMON_TEXT.newFormTitle} description={COMMON_TEXT.newFormBody} confirmLabel={COMMON_TEXT.newFormConfirm}
      pending={false} onConfirm={onConfirm} onClose={onClose} />
  )
}
