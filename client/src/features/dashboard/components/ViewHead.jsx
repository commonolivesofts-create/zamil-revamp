import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'

// Shared heading for every secondary workspace view. The title is the focus
// target after a client-side view change, so keyboard users are not dropped
// back to the top of the document without context.
export default function ViewHead({
  eyebrow,
  title,
  description,
  actions,
  onBack,
  backLabel = 'Back to workspace',
}) {
  return (
    <>
      <button className="backlink" type="button" onClick={onBack}>
        <OrvexaIcon name="arrow-left" />
        {backLabel}
      </button>
      <header className="view-head">
        <div>
          <span className="eyebrow" style={{ display: 'block' }}>{eyebrow}</span>
          <h1 data-zrv-view-title tabIndex={-1}>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {actions && <div className="head-buttons">{actions}</div>}
      </header>
    </>
  )
}
