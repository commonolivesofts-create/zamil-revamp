import { ActiveBadge, Badge, ConfirmDialog } from '@/features/security-administration/components/AdminUi.jsx'
import { formatInstant } from '@/features/security-administration/adminFeedback.js'
import { LIFECYCLE_TONES } from '../workflowManagerModel.js'
import '@/styles/workflow-manager.css'

export { ActiveBadge }

// Confirmation for activating or deactivating a registered form or data
// source. The record's ROW_VERSION travels with the request; a concurrent
// change is reported (409) instead of being overwritten.
export function ActivationDialog({ item, entity, label, pending, feedback, onConfirm, onClose }) {
  const activating = !item.isActive
  return (
    <ConfirmDialog
      danger={!activating}
      title={`${activating ? 'Activate' : 'Deactivate'} ${entity} ${label}?`}
      confirmLabel={activating ? 'Activate' : 'Deactivate'}
      pending={pending}
      feedback={feedback}
      onClose={onClose}
      onConfirm={onConfirm}
      description={activating
        ? `The ${entity} becomes available again for workflow configuration.`
        : `The ${entity} stays registered with its history, but cannot be chosen for new workflow configuration until it is activated again. Nothing is deleted.`}
    />
  )
}

// Read-only version metadata (versions are created by the mapping package, M2).
export function VersionTable({ versions, caption, sourceColumn = false }) {
  if (!versions.length) {
    return <p className="zrv-admin-state" role="status">No versions yet. Versions are created when the mapping for this record is configured.</p>
  }
  return (
    <div className="ux-table-wrap">
      <table className="ux-table zrv-admin-table zrv-admin-table--compact zwf-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Version</th>
            <th scope="col">State</th>
            {sourceColumn && <th scope="col">Header source</th>}
            <th scope="col">Published</th>
            <th scope="col">Last updated</th>
            <th scope="col">Fingerprint</th>
          </tr>
        </thead>
        <tbody>
          {versions.map((version) => (
            <tr key={version.formVersionId ?? version.sourceVersionId}>
              <td><b>v{version.versionNo}</b>{version.isDefault && <Badge tone="good">DEFAULT</Badge>}</td>
              <td><Badge tone={LIFECYCLE_TONES[version.lifecycleState]}>{version.lifecycleState}</Badge></td>
              {sourceColumn && <td><span className="zwf-code">{version.headerSource.sourceCode}</span><small className="zrv-admin-sub">version {version.headerSource.versionNo}</small></td>}
              <td>{formatInstant(version.publishedAt)}</td>
              <td>{formatInstant(version.updatedAt)}</td>
              <td><span className="zwf-code" title={version.configSha256}>{version.configSha256.slice(0, 12)}…</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
