import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { Badge } from '@/features/security-administration/components/AdminUi.jsx'
import { emptyKey, previewEnforcement } from '../sourceMappingModel.js'
import {
  identifierCode,
  readableName,
  recommendIdentifier,
  sameColumns,
} from '../smartMappingModel.js'
import SourceKeyCandidateEditor from './SourceKeyCandidateEditor.jsx'

const names = (columns) => columns.map(readableName).join(' + ')

// Step 2 of the guided setup — "Verify record identification". The system recommends only an
// identifier the database verifiably enforces (primary key, else the narrowest enforced unique
// constraint/index over never-empty columns) — never one guessed from a column name. Using it is
// one click. Without one, the identifier is a decision for technical onboarding: a data
// specialist declares it there with documented basis, evidence and rationale, and it stays
// provisional (an approval blocker) until it is approved.
export default function SourceIdentifierStep({
  keys,
  columns,
  snapshot,
  readOnly,
  errors = {},
  onChange,
  onUseColumns,
}) {
  const recommended = recommendIdentifier(snapshot, columns)
  const recommendedInUse = recommended
    ? keys.some((key) => sameColumns(key.columns, recommended.columns))
    : false
  const assessed = keys.map((key) => ({
    key,
    enforcement: previewEnforcement(key.columns, snapshot).enforcement,
  }))
  const primary = assessed.find((item) => item.key.columns.length > 0) ?? null
  const hasKeyErrors = Object.keys(errors).length > 0
  const declared = assessed.some((item) => item.enforcement === 'DECLARED')

  const useRecommended = () => {
    onUseColumns(recommended.columns)
    onChange([
      ...keys,
      { ...emptyKey(), code: identifierCode(keys), columns: [...recommended.columns] },
    ])
  }

  return (
    <div className="zwf-identify">
      {primary ? (
        <div
          className={`zwf-callout ${primary.enforcement === 'DATABASE_ENFORCED' ? 'is-good' : 'is-warn'}`}
          role="status"
        >
          <OrvexaIcon
            name={primary.enforcement === 'DATABASE_ENFORCED' ? 'shield-check' : 'shield-alert'}
            className="size-5"
          />
          <div>
            <b>
              Record identifier: {names(primary.key.columns)}{' '}
              {primary.enforcement === 'DATABASE_ENFORCED' ? (
                <Badge tone="good">Verified by the database</Badge>
              ) : (
                <Badge tone="warn">Provisional</Badge>
              )}
            </b>
            <p>
              {primary.enforcement === 'DATABASE_ENFORCED'
                ? 'The database guarantees that no two records share this identifier, so each request can be found exactly.'
                : 'The database does not guarantee that this identifier is unique. It was declared by a data specialist and must be approved before forms can rely on it.'}
            </p>
          </div>
        </div>
      ) : recommended ? (
        <div className="zwf-callout is-good">
          <OrvexaIcon name="sparkles" className="size-5" />
          <div>
            <b>Record identifier found: {names(recommended.columns)}</b>
            <p>
              The database guarantees that no two records share{' '}
              {recommended.columns.length > 1 ? 'this combination' : 'this value'} (
              {recommended.kind === 'PRIMARY_KEY' ? 'primary key' : 'unique rule'}). Using it adds
              this information to your selection; choose its privacy in step 1.
            </p>
            {!readOnly && (
              <button type="button" className="btn-primary" onClick={useRecommended}>
                <OrvexaIcon name="check" className="size-4" /> Use this identifier
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="zwf-callout is-warn" role="status">
          <OrvexaIcon name="shield-alert" className="size-5" />
          <div>
            <b>No verified record identifier found</b>
            <p>
              The database does not guarantee that any information of this source is unique. Forms
              can still display its data, but records cannot be identified reliably until a data
              specialist declares an identifier in technical onboarding below. A declared identifier
              stays provisional until it is approved.
            </p>
          </div>
        </div>
      )}
      {recommended && primary && !recommendedInUse && !readOnly && (
        <p className="zrv-admin-hint">
          The database also guarantees {names(recommended.columns)}.{' '}
          <button type="button" className="zrv-admin-link" onClick={useRecommended}>
            Add it as an identifier
          </button>
        </p>
      )}

      <details className="zwf-technical" open={hasKeyErrors || declared || undefined}>
        <summary>
          <OrvexaIcon name="key-round" className="size-4" /> Technical onboarding (data
          specialists): identifiers and evidence
        </summary>
        <div className="zwf-technical__body">
          <p className="zrv-admin-hint">
            Identifiers the database does not enforce need a documented basis, evidence and
            rationale; on save the server also counts empty and duplicated values (counts only — no
            records are shown). Such identifiers are provisional and are approved in a later
            governance step.
          </p>
          <SourceKeyCandidateEditor
            keys={keys}
            columns={columns}
            snapshot={snapshot}
            readOnly={readOnly}
            errors={errors}
            onChange={onChange}
          />
        </div>
      </details>
    </div>
  )
}
