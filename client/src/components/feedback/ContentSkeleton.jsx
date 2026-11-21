import './ContentSkeleton.css'

// Decorative placeholders never act as inputs or enter the keyboard tab order.
// Keep the loading announcement available to assistive technology only.
export default function ContentSkeleton({
  label = 'Loading content',
  variant = 'content',
  columns = 6,
  rows = 8,
  // Route loading replaces the whole page and needs its header/stats; a table
  // loading inside an already-rendered report only needs the table panel.
  pageChrome = true,
}) {
  return (
    <div
      className={`zrv-content-skeleton zrv-content-skeleton--${variant}`}
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">{label}</span>
      <div className="zrv-content-skeleton__visual" aria-hidden="true">
        {variant === 'form' ? (
          <>
            <div className="zrv-content-skeleton__steps">
              {Array.from({ length: 4 }, (_, index) => (
                <span className="zrv-content-skeleton__block" key={index} />
              ))}
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
        ) : variant === 'table' ? (
          <>
            {pageChrome && (
              <>
                <div className="zrv-content-skeleton__page-head">
                  <span className="zrv-content-skeleton__crumb" />
                  <span className="zrv-content-skeleton__block zrv-content-skeleton__title" />
                  <span className="zrv-content-skeleton__block zrv-content-skeleton__subtitle" />
                  <div className="zrv-content-skeleton__page-actions">
                    {Array.from({ length: 5 }, (_, action) => (
                      <span
                        className="zrv-content-skeleton__block zrv-content-skeleton__action"
                        key={action}
                      />
                    ))}
                  </div>
                </div>
                <div className="zrv-content-skeleton__stats">
                  {Array.from({ length: 4 }, (_, stat) => (
                    <div className="zrv-content-skeleton__stat" key={stat}>
                      <span className="zrv-content-skeleton__block zrv-content-skeleton__stat-label" />
                      <span className="zrv-content-skeleton__block zrv-content-skeleton__stat-value" />
                      <span className="zrv-content-skeleton__block zrv-content-skeleton__stat-sub" />
                    </div>
                  ))}
                </div>
              </>
            )}
            <div className="zrv-content-skeleton__panel zrv-content-skeleton__table-panel">
              <div className="zrv-content-skeleton__report-head">
                <span className="zrv-content-skeleton__block zrv-content-skeleton__heading" />
                <span className="zrv-content-skeleton__block zrv-content-skeleton__head-tools" />
              </div>
              <div className="zrv-content-skeleton__table-head" style={{ '--cols': columns }}>
                {Array.from({ length: columns }, (_, column) => (
                  <span className="zrv-content-skeleton__th" key={column} />
                ))}
              </div>
              <div className="zrv-content-skeleton__table" style={{ '--cols': columns }}>
                {Array.from({ length: rows }, (_, row) => (
                  <div
                    className={`zrv-content-skeleton__row zrv-content-skeleton__row--tone${row % 3}`}
                    key={row}
                  >
                    {Array.from({ length: columns }, (_, column) => (
                      <span
                        className={`zrv-content-skeleton__block zrv-content-skeleton__td zrv-content-skeleton__td--w${
                          (row * columns + column) % 5
                        }${column === 0 ? ' zrv-content-skeleton__td--first' : ''}`}
                        key={column}
                      />
                    ))}
                  </div>
                ))}
              </div>
              <div className="zrv-content-skeleton__pager">
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
