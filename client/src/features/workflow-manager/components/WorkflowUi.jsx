import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import {
  ActiveBadge,
  Badge,
  ConfirmDialog,
} from '@/features/security-administration/components/AdminUi.jsx'
import { formatInstant } from '@/features/security-administration/adminFeedback.js'
import { LIFECYCLE_LABELS } from '../sourceMappingModel.js'
import { formReadiness } from '../smartMappingModel.js'
import { LIFECYCLE_TONES } from '../workflowManagerModel.js'
import '@/styles/workflow-manager.css'

export { ActiveBadge }

export function ReadinessBadge({ readiness }) {
  return <Badge tone={readiness.tone}>{readiness.label}</Badge>
}

// Technical facts (codes, routes, Oracle names, fingerprints) stay available to administrators
// and for diagnostics, but out of the way of the business task.
export function TechnicalDetails({ summary = 'Technical details', children }) {
  return (
    <details className="zwf-technical">
      <summary>
        <OrvexaIcon name="code" className="size-4" /> {summary}
      </summary>
      <div className="zwf-technical__body">{children}</div>
    </details>
  )
}

// The three stages of making a form workflow-ready, with only states the system can prove.
// Workflow configuration (package M3) is listed as not yet available — never as an action.
export function FormJourney({ form }) {
  const readiness = formReadiness(form)
  const dataDone = readiness.state === 'READY'
  const steps = [
    { title: 'Registered', text: 'The form is known to the Workflow Manager.', state: 'done' },
    {
      title: 'Business data prepared',
      text: readiness.detail,
      state: dataDone ? 'done' : readiness.state === 'IN_SETUP' ? 'current' : 'todo',
    },
    {
      title: 'Workflow configured',
      text: 'Designing approval workflows arrives with the workflow designer in a later release.',
      state: 'later',
    },
  ]
  return (
    <ol className="zwf-journey" aria-label="Workflow readiness">
      {steps.map((step) => (
        <li key={step.title} className={`zwf-journey__step is-${step.state}`}>
          <span className="zwf-journey__mark" aria-hidden="true">
            <OrvexaIcon
              name={
                step.state === 'done'
                  ? 'circle-check'
                  : step.state === 'later'
                    ? 'clock'
                    : 'circle-dashed'
              }
            />
          </span>
          <span>
            <b>
              {step.title}
              <span className="sr-only">
                {' '}
                —{' '}
                {
                  {
                    done: 'done',
                    current: 'in progress',
                    todo: 'not started',
                    later: 'not available yet',
                  }[step.state]
                }
              </span>
            </b>
            <small>{step.text}</small>
          </span>
        </li>
      ))}
    </ol>
  )
}

// Guided setup steps. Every step can be reached directly (no forced order) and the current one
// is announced; each button names its state for screen readers.
export function SetupSteps({ steps, current, onSelect }) {
  return (
    <nav className="zwf-steps" aria-label="Setup steps">
      <ol>
        {steps.map((step, index) => (
          <li key={step.id}>
            <button
              type="button"
              className={`zwf-steps__item${step.id === current ? ' is-current' : ''}${step.problem ? ' has-problem' : ''}`}
              aria-current={step.id === current ? 'step' : undefined}
              onClick={() => onSelect(step.id)}
            >
              <span className="zwf-steps__number" aria-hidden="true">
                {step.problem ? '!' : index + 1}
              </span>
              <span>
                <b>{step.title}</b>
                <small>{step.hint}</small>
              </span>
              {step.problem && <span className="sr-only"> — needs attention</span>}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}

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
      description={
        activating
          ? `The ${entity} becomes available again for workflow configuration.`
          : `The ${entity} stays registered with its history, but cannot be chosen for new workflow configuration until it is activated again. Nothing is deleted.`
      }
    />
  )
}

// Read-only version history (versions are created by the mapping packages). Integrity
// fingerprints and pinned sources are technical details, shown only on request.
export function VersionTable({ versions, caption, sourceColumn = false, technical = false }) {
  if (!versions.length) {
    return (
      <p className="zrv-admin-state" role="status">
        No versions yet. A version is created when this data is prepared for workflows.
      </p>
    )
  }
  return (
    <div className="ux-table-wrap">
      <table className="ux-table zrv-admin-table zrv-admin-table--compact zwf-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Version</th>
            <th scope="col">Status</th>
            {sourceColumn && technical && <th scope="col">Main data source</th>}
            <th scope="col">Approved</th>
            <th scope="col">Last updated</th>
            {technical && <th scope="col">Fingerprint</th>}
          </tr>
        </thead>
        <tbody>
          {versions.map((version) => (
            <tr key={version.formVersionId ?? version.sourceVersionId}>
              <td>
                <b>Version {version.versionNo}</b>
                {version.isDefault && <Badge tone="good">In use</Badge>}
              </td>
              <td>
                <Badge tone={LIFECYCLE_TONES[version.lifecycleState]}>
                  {LIFECYCLE_LABELS[version.lifecycleState]}
                </Badge>
              </td>
              {sourceColumn && technical && (
                <td>
                  <span className="zwf-code">{version.headerSource.sourceCode}</span>
                  <small className="zrv-admin-sub">version {version.headerSource.versionNo}</small>
                </td>
              )}
              <td>{version.publishedAt ? formatInstant(version.publishedAt) : 'Not yet'}</td>
              <td>{formatInstant(version.updatedAt)}</td>
              {technical && (
                <td>
                  <span className="zwf-code" title={version.configSha256}>
                    {version.configSha256.slice(0, 12)}…
                  </span>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
