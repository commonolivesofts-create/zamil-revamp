import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { formatInstant } from '@/features/security-administration/adminFeedback.js'
import { Badge } from '@/features/security-administration/components/AdminUi.jsx'
import { describeBlocker, describePath, groupFindings } from '../sourceMappingModel.js'
import { explainFinding } from '../smartMappingModel.js'

// One finding in plain language: what failed and how to fix it. Where it happened and the
// server's own code stay available for technical administration.
function FindingList({ items, order, tone }) {
  return (
    <ul className={`zwf-findings zwf-findings--${tone}`}>
      {items.map((finding, index) => {
        const { what, fix } = explainFinding(finding)
        return (
          <li key={`${finding.code}:${finding.path}:${index}`}>
            <span className="zwf-findings__what">{what}</span>
            {fix && <span className="zwf-findings__fix">How to fix: {fix}</span>}
            <span className="zwf-findings__where">
              {describePath(finding.path, order)} · <code className="zwf-code">{finding.code}</code>
              {what !== finding.message && finding.message ? ` · ${finding.message}` : ''}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

// Result of the last check, in plain language: whether it was saved, what failed and how to fix
// it (errors stop a save), what is worth reading (warnings), what must be approved later
// (approval blockers — nothing here approves anything) and the read-only check for source changes.
export default function SourceValidationPanel({
  validation,
  blockers = [],
  drift,
  order,
  blockerOrder = order,
  driftOrder = order,
  pending,
}) {
  const { errors, warnings } = groupFindings(validation?.findings ?? [])
  const driftGroups = groupFindings(drift?.findings ?? [])
  const nothing = !validation && !drift && blockers.length === 0
  return (
    <div className="zwf-validation" aria-live="polite" aria-busy={pending || undefined}>
      {nothing && (
        <p className="zrv-admin-state" role="status">
          Not checked yet. Saving checks your choices against the live data source; nothing is saved
          if a problem is found.
        </p>
      )}
      {validation && (
        <section className="zwf-validation__section" aria-labelledby="zwf-validation-result">
          <h3 id="zwf-validation-result">
            {validation.source === 'refused' ? (
              <>
                <OrvexaIcon name="circle-alert" className="size-4" /> Not saved — {errors.length}{' '}
                problem{errors.length === 1 ? '' : 's'} to fix
              </>
            ) : (
              <>
                <OrvexaIcon name="circle-check" className="size-4" /> Saved and checked
                {warnings.length
                  ? ` — ${warnings.length} note${warnings.length === 1 ? '' : 's'} to read`
                  : ''}
              </>
            )}
          </h3>
          {validation.source === 'refused' && (
            <p className="zrv-admin-hint">
              Nothing was changed. Fix the problems below and save again.
              {validation.requestId ? ` Reference for support: ${validation.requestId}.` : ''}
            </p>
          )}
          {errors.length > 0 && (
            <>
              <h4 className="zwf-validation__label">Problems</h4>
              <FindingList items={errors} order={order} tone="error" />
            </>
          )}
          {warnings.length > 0 && (
            <>
              <h4 className="zwf-validation__label">Notes</h4>
              <FindingList items={warnings} order={order} tone="warning" />
            </>
          )}
        </section>
      )}
      {blockers.length > 0 && (
        <section className="zwf-validation__section" aria-labelledby="zwf-validation-blockers">
          <h3 id="zwf-validation-blockers">
            <OrvexaIcon name="shield-alert" className="size-4" /> Must be approved later
          </h3>
          <p className="zrv-admin-hint">
            These points do not stop you saving a draft. They are reviewed in the later approval
            step before forms can use this data.
          </p>
          <ul className="zwf-findings zwf-findings--blocker">
            {blockers.map((blocker) => (
              <li key={`${blocker.code}:${blocker.path}`}>
                <span className="zwf-findings__what">{describeBlocker(blocker)}</span>
                <span className="zwf-findings__where">
                  {describePath(blocker.path, blockerOrder)} ·{' '}
                  <code className="zwf-code">{blocker.code}</code>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {drift && (
        <section className="zwf-validation__section" aria-labelledby="zwf-validation-drift">
          <h3 id="zwf-validation-drift">
            <OrvexaIcon
              name={drift.drifted ? 'triangle-alert' : 'circle-check'}
              className="size-4"
            />{' '}
            Source changes{' '}
            <Badge tone={drift.drifted ? 'bad' : 'good'}>
              {drift.drifted ? 'Changes found' : 'No changes'}
            </Badge>
          </h3>
          <p className="zrv-admin-hint">
            Checked {formatInstant(drift.checkedAt)}
            {drift.current ? '' : ' · the data source could not be read'}
            {drift.configIntegrity !== 'VERIFIED'
              ? ` · the saved version is ${drift.configIntegrity.toLowerCase()}`
              : ''}
          </p>
          {driftGroups.errors.length > 0 && (
            <FindingList items={driftGroups.errors} order={driftOrder} tone="error" />
          )}
          {driftGroups.warnings.length > 0 && (
            <FindingList items={driftGroups.warnings} order={driftOrder} tone="warning" />
          )}
        </section>
      )}
    </div>
  )
}
