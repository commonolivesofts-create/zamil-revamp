import './PageState.css'

export default function PageState({
  kind = 'empty',
  title,
  description,
  actionLabel,
  onAction,
  actionDisabled = false,
  actionLoading = false,
  children,
  className = '',
}) {
  const isLoading = kind === 'loading'
  const isError = kind === 'error'

  return (
    <div
      className={`zrv-page-state zrv-page-state--${kind} ${className}`.trim()}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      aria-busy={isLoading}
    >
      <div className="zrv-page-state__content">
        {isLoading && <span className="zrv-page-state__spinner" aria-hidden="true" />}
        <h1 className="zrv-page-state__title">{title}</h1>
        {description && <p className="zrv-page-state__description">{description}</p>}
        {actionLabel && onAction && (
          <button
            className="zrv-page-state__action"
            type="button"
            onClick={onAction}
            disabled={actionDisabled}
            aria-busy={actionLoading || undefined}
            aria-label={actionLoading ? `${actionLabel} in progress` : undefined}
          >
            <span className={actionLoading ? 'zrv-page-state__action-label--loading' : undefined}>
              {actionLabel}
            </span>
            {actionLoading && (
              <span
                className="zrv-page-state__spinner zrv-page-state__spinner--button"
                role="status"
                aria-label={`${actionLabel} in progress`}
              />
            )}
          </button>
        )}
        {children}
      </div>
    </div>
  )
}
