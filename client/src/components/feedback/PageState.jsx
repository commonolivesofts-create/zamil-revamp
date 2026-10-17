import './PageState.css'

export default function PageState({
  kind = 'empty',
  title,
  description,
  actionLabel,
  onAction,
}) {
  const isLoading = kind === 'loading'
  const isError = kind === 'error'

  return (
    <div
      className={`zrv-page-state zrv-page-state--${kind}`}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      aria-busy={isLoading}
    >
      <div className="zrv-page-state__content">
        {isLoading && <span className="zrv-page-state__spinner" aria-hidden="true" />}
        <h1 className="zrv-page-state__title">{title}</h1>
        {description && <p className="zrv-page-state__description">{description}</p>}
        {actionLabel && onAction && (
          <button className="zrv-page-state__action" type="button" onClick={onAction}>
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  )
}
