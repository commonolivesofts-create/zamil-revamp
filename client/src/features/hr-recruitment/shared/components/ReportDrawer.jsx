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

// A titled block of drawer content. `bare` drops the divider above the section
// (used where the section is the first thing in the drawer, e.g. score summary).
export function DetailSection({ label, icon, title, description, tone, bare = false, children }) {
  return (
    <section className={`zrv-ir-detail${bare ? ' zrv-ir-detail--bare' : ''}`} aria-label={label}>
      <SectionHeading icon={icon} title={title} description={description} tone={tone} />
      {children}
    </section>
  )
}

// A loading preview that mirrors the drawer's real sections: each entry
// describes one section's heading and the shape of its content, so the skeleton
// settles into the same layout as the saved record. The first section is bare
// so no top divider appears above it.
export function DetailSkeleton({ sections = [] }) {
  return (
    <div className="zrv-ir-detail-loading" aria-busy="true" aria-label="Loading details">
      {sections.map((section, index) => (
        <DetailSection
          key={section.title}
          label={section.title}
          icon={section.icon}
          title={section.title}
          description={section.description}
          tone={section.tone}
          bare={index === 0}
        >
          {section.type === 'scores' ? (
            <div className="zrv-ir-detail-skeleton-bars" aria-hidden="true">
              <i />
              <i />
            </div>
          ) : (
            <div
              className="zrv-ir-detail-skeleton-grid"
              style={{ '--detail-fact-columns': section.columns ?? 2 }}
              aria-hidden="true"
            >
              {Array.from({ length: (section.columns ?? 2) * (section.rows ?? 2) }, (_, cell) => (
                <i key={cell} />
              ))}
            </div>
          )}
        </DetailSection>
      ))}
    </div>
  )
}
