// Loading, empty and error states (markup of client components/feedback/{PageState,ContentSkeleton}).
import type { ReactNode } from 'react';

export function PageState({
  kind,
  title,
  description,
  actionLabel,
  onAction,
  children,
}: {
  kind: 'loading' | 'error' | 'empty';
  title: string;
  description?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  children?: ReactNode;
}) {
  const isError = kind === 'error';
  return (
    <div
      className={`zrv-page-state zrv-page-state--${kind}`}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      aria-busy={kind === 'loading'}
    >
      <div className="zrv-page-state__content">
        {kind === 'loading' && <span className="zrv-page-state__spinner" aria-hidden="true" />}
        <h1 className="zrv-page-state__title">{title}</h1>
        {description && <p className="zrv-page-state__description">{description}</p>}
        {actionLabel && onAction && (
          <button className="zrv-page-state__action" type="button" onClick={onAction}>
            {actionLabel}
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

export function ContentSkeleton({
  label = 'Loading content',
  rows = 6,
}: {
  label?: string;
  rows?: number;
}) {
  return (
    <div
      className="zrv-content-skeleton zrv-content-skeleton--table"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">{label}</span>
      <div className="zrv-content-skeleton__visual" aria-hidden="true">
        <div className="zrv-content-skeleton__table">
          {Array.from({ length: rows }, (_, row) => (
            <div className="zrv-content-skeleton__row" key={row}>
              {Array.from({ length: 4 }, (_, column) => (
                <span className="zrv-content-skeleton__block" key={column} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** In-page notice (markup of client pages/RouteNotice.jsx). */
export function RouteNotice({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="zrv-route-notice" aria-labelledby="zrv-route-title">
      {eyebrow && <p className="zrv-route-notice__eyebrow">{eyebrow}</p>}
      <h1 className="zrv-route-notice__title" id="zrv-route-title">
        {title}
      </h1>
      {description && <p className="zrv-route-notice__description">{description}</p>}
      {action}
    </section>
  );
}
