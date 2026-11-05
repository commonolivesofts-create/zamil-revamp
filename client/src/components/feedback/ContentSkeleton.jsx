import './ContentSkeleton.css'

// Decorative placeholders never act as inputs or enter the keyboard tab order.
// Keep the loading announcement available to assistive technology only.
export default function ContentSkeleton({ label = 'Loading content', variant = 'content' }) {
  return (
    <div className={`zrv-content-skeleton zrv-content-skeleton--${variant}`} role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="zrv-content-skeleton__visual" aria-hidden="true">
        {variant === 'form' ? (
          <>
            <div className="zrv-content-skeleton__steps">
              {Array.from({ length: 4 }, (_, index) => <span className="zrv-content-skeleton__block" key={index} />)}
            </div>
            <div className="zrv-content-skeleton__layout">
              <div className="zrv-content-skeleton__panel">
                <span className="zrv-content-skeleton__block zrv-content-skeleton__heading" />
                <div className="zrv-content-skeleton__fields">
                  {Array.from({ length: 6 }, (_, index) => (
                    <div className="zrv-content-skeleton__field" key={index}>
                      <span className="zrv-content-skeleton__block zrv-content-skeleton__label" />
                      <span className="zrv-content-skeleton__block zrv-content-skeleton__input" />
                    </div>
                  ))}
                </div>
                <div className="zrv-content-skeleton__actions">
                  <span className="zrv-content-skeleton__block" />
                  <span className="zrv-content-skeleton__block" />
                </div>
              </div>
              <div className="zrv-content-skeleton__panel zrv-content-skeleton__summary">
                <span className="zrv-content-skeleton__block zrv-content-skeleton__heading" />
                <span className="zrv-content-skeleton__block" />
                <span className="zrv-content-skeleton__block" />
                <span className="zrv-content-skeleton__block" />
              </div>
            </div>
          </>
        ) : (
          <>
            <span className="zrv-content-skeleton__block zrv-content-skeleton__heading" />
            <span className="zrv-content-skeleton__block" />
            <span className="zrv-content-skeleton__block" />
            {variant !== 'inline' && <span className="zrv-content-skeleton__block" />}
          </>
        )}
      </div>
    </div>
  )
}
