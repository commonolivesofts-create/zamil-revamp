import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { COMMON_TEXT } from '../../hrRecruitmentText.js'
import '@/styles/report-drawer.css'

// Shared building blocks for report drawers. Every report uses the same fact grid,
// section heading and loading state, so the drawers read as one consistent UI
// instead of a different design per report. The CSS lives with the report styles
// (hr-insight-report.css) under the shared zrv-ir-detail-* names.

const drawerText = (value) => value || COMMON_TEXT.dash

export function DetailFacts({ facts, columns = 2, className = '' }) {
  return (
    <dl
      className={`zrv-ir-detail-facts ${className}`.trim()}
      style={{ '--detail-fact-columns': columns, '--orientation-fact-columns': columns }}
    >
      {facts.map(([label, entry]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{drawerText(entry)}</dd>
        </div>
      ))}
    </dl>
  )
}

export function SectionHeading({ icon, title, description, tone, className = '' }) {
  return (
    <div
      className={`zrv-ir-detail-heading${tone ? ` zrv-ir-detail-heading--${tone}` : ''} ${className}`.trim()}
    >
      <span
        className="zrv-ir-detail-heading__icon zrv-ir-orientation-heading__icon"
        aria-hidden="true"
      >
        <OrvexaIcon name={icon} size={18} />
      </span>
      <div>
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>
    </div>
  )
}

export function DetailSkeleton({ title, description, rows = 3 }) {
  return (
    <section className="zrv-ir-detail" aria-busy="true" aria-label={`Loading ${title}`}>
      <SectionHeading icon="file-search" title={title} description={description} />
      <div className="zrv-ir-detail-skeleton" aria-hidden="true">
        {Array.from({ length: rows }, (_, index) => (
          <i key={index} />
        ))}
      </div>
    </section>
  )
}
