import { useState } from 'react'
import { createPortal } from 'react-dom'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import usePermissions from '@/features/access/usePermissions.js'
import { ConfirmDialog } from '@/features/security-administration/components/AdminUi.jsx'
import { useAdminAction } from '@/features/security-administration/useAdminData.js'
import { INSIGHT_TEXT as T } from '../hrRecruitmentText.js'

// One bulk-delete implementation for every recruitment report listing. It
// returns the three props InsightReport needs (rowSelection, tableTools,
// reloadToken) plus the confirmation portal the page renders beside it.
//
//   remove(row)            → calls the service for one selected row
//   permission             → action required to see the delete controls
//   idOf(row), labelOf(row)→ identity and accessible label
//   singular, plural       → nouns used in the confirmation messages
//   canDelete(row)         → optional reason string when a row is not deletable
export function useReportBulkDelete({
  remove,
  permission,
  idOf,
  labelOf,
  singular,
  plural,
  canDelete,
}) {
  const permissions = usePermissions()
  const action = useAdminAction()
  const [selected, setSelected] = useState([])
  const [confirming, setConfirming] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const allowed = !permission || Boolean(permissions.can(permission))

  const toggle = (row) =>
    setSelected((rows) => {
      const id = idOf(row)
      return rows.some((item) => idOf(item) === id)
        ? rows.filter((item) => idOf(item) !== id)
        : [...rows, row]
    })

  const isBlocked = (row) => (!allowed ? T.bulk.noPermission : canDelete?.(row))

  const toggleAll = (rows, checked) => {
    const ids = rows.map(idOf)
    setSelected((current) =>
      checked
        ? [
            ...current,
            ...rows.filter(
              (row) => !current.some((item) => idOf(item) === idOf(row)) && !isBlocked(row),
            ),
          ]
        : current.filter((row) => !ids.includes(idOf(row))),
    )
  }

  const close = () => {
    if (action.pending) return
    setConfirming(false)
    action.setFeedback(null)
  }

  const count = selected.length
  const noun = count === 1 ? singular : plural

  const confirm = async () => {
    const rows = [...selected]
    const outcome = await action.run(async () => {
      const results = await Promise.allSettled(rows.map(remove))
      const failed = results.find((result) => result.status === 'rejected')
      if (failed) throw failed.reason
      return rows.length
    })
    // The outcome of a delete is never certain enough to keep a stale selection:
    // refresh the listing and clear the ticks, showing the failure feedback if
    // the backend refused one of the rows.
    if (outcome.status === 'ignored') return
    setConfirming(false)
    action.setFeedback(null)
    setSelected([])
    setReloadToken((value) => value + 1)
  }

  return {
    reloadToken,
    rowSelection: {
      selectedKeys: selected.map(idOf),
      onToggle: toggle,
      onToggleAll: toggleAll,
      label: labelOf,
      disabled: isBlocked,
    },
    tableTools: (
      <>
        <span className="zrv-ir-tabletools__count">
          {count ? T.bulk.selected(count) : T.bulk.hint(plural)}
        </span>
        {count > 0 && (
          <button
            type="button"
            className="zrv-ir-btn zrv-ir-btn--danger"
            onClick={() => setConfirming(true)}
            disabled={!allowed || action.pending}
          >
            <OrvexaIcon name="trash-2" size={13} />
            {T.bulk.action(count)}
          </button>
        )}
        {count > 0 && (
          <button type="button" className="zrv-ir-btn" onClick={() => setSelected([])}>
            {T.bulk.clear}
          </button>
        )}
      </>
    ),
    confirmation: confirming
      ? createPortal(
          <ConfirmDialog
            title={T.bulk.title(noun)}
            description={T.bulk.body(count, noun)}
            confirmLabel={T.bulk.action(count)}
            danger
            pending={action.pending}
            feedback={action.feedback}
            onConfirm={confirm}
            onClose={close}
          />,
          document.body,
        )
      : null,
  }
}
