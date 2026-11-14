import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { formatInstant } from '@/features/security-administration/adminFeedback.js'
import { Badge } from '@/features/security-administration/components/AdminUi.jsx'
import { describeBlocker, describePath, groupFindings } from '../sourceMappingModel.js'

function FindingList({ items, order, tone }) {
  return (
    <ul className={`zwf-findings zwf-findings--${tone}`}>
      {items.map((finding, index) => (
        <li key={`${finding.code}:${finding.path}:${index}`}>
          <span className="zwf-findings__where">{describePath(finding.path, order)}</span>
          <span>{finding.message}</span>
          <code className="zwf-code">{finding.code}</code>
        </li>
      ))}
    </ul>
  )
}

// Validation result of the last check: errors (block saving), warnings (saved, but worth
// reading), publication blockers (reported for the later approval package; nothing here
// publishes) and the read-only drift check — each in its own section.
export default function SourceValidationPanel({ validation, blockers = [], drift, order, blockerOrder = order, driftOrder = order, pending }) {
  const { errors, warnings } = groupFindings(validation?.findings ?? [])
  const driftGroups = groupFindings(drift?.findings ?? [])
  const nothing = !validation && !drift && blockers.length === 0
  return (
    <div className="zwf-validation" aria-live="polite" aria-busy={pending || undefined}>
      {nothing && (
        <p className="zrv-admin-state" role="status">
          No validation result yet. Saving validates the mapping against the live source; you can also re-validate a saved draft or check it for drift.
        </p>
      )}
      {validation && (
        <section className="zwf-validation__section" aria-labelledby="zwf-validation-result">
          <h3 id="zwf-validation-result">
            {validation.source === 'refused'
              ? <><OrvexaIcon name="circle-alert" className="size-4" /> Not saved — {errors.length} error{errors.length === 1 ? '' : 's'} to correct</>
              : <><OrvexaIcon name="circle-check" className="size-4" /> Valid{warnings.length ? ` with ${warnings.length} warning${warnings.length === 1 ? '' : 's'}` : ''}</>}
          </h3>
          {errors.length > 0 && (
            <>
              <h4 className="zwf-validation__label">Errors</h4>
              <FindingList items={errors} order={order} tone="error" />
            </>
          )}
          {warnings.length > 0 && (
            <>
              <h4 className="zwf-validation__label">Warnings</h4>
              <FindingList items={warnings} order={order} tone="warning" />
            </>
          )}
        </section>
      )}
      {blockers.length > 0 && (
        <section className="zwf-validation__section" aria-labelledby="zwf-validation-blockers">
          <h3 id="zwf-validation-blockers"><OrvexaIcon name="shield-alert" className="size-4" /> Publication blockers</h3>
          <p className="zrv-admin-hint">Recorded for the later approval and publication step. They do not stop you saving a draft.</p>
          <ul className="zwf-findings zwf-findings--blocker">
            {blockers.map((blocker) => (
              <li key={`${blocker.code}:${blocker.path}`}>
                <span className="zwf-findings__where">{describePath(blocker.path, blockerOrder)}</span>
                <span>{describeBlocker(blocker)}</span>
                <code className="zwf-code">{blocker.code}</code>
              </li>
            ))}
          </ul>
        </section>
      )}
      {drift && (
        <section className="zwf-validation__section" aria-labelledby="zwf-validation-drift">
          <h3 id="zwf-validation-drift">
            <OrvexaIcon name={drift.drifted ? 'triangle-alert' : 'circle-check'} className="size-4" /> Drift check
            {' '}<Badge tone={drift.drifted ? 'bad' : 'good'}>{drift.drifted ? 'Drift found' : 'No drift'}</Badge>
          </h3>
          <p className="zrv-admin-hint">
            Checked {formatInstant(drift.checkedAt)}
            {drift.current ? ` · live ${drift.current.objectType} is ${drift.current.status}` : ' · the live object could not be read'}
            {drift.configIntegrity !== 'VERIFIED' ? ` · stored configuration ${drift.configIntegrity.toLowerCase()}` : ''}
          </p>
          {driftGroups.errors.length > 0 && <FindingList items={driftGroups.errors} order={driftOrder} tone="error" />}
          {driftGroups.warnings.length > 0 && <FindingList items={driftGroups.warnings} order={driftOrder} tone="warning" />}
        </section>
      )}
    </div>
  )
}
