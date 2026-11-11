import type { CSSProperties, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export function PageHeader({
  eyebrow,
  title,
  actions,
}: {
  eyebrow?: ReactNode;
  title: string;
  /** Retained for existing callers; shared headers follow Zamil's title-only pattern. */
  description?: ReactNode;
  actions?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <header className="eh-page-header mb-5">
      <div className="eh-page-header__copy">
        <nav className="eh-page-header__breadcrumb" aria-label={t('app.breadcrumb')}>
          {eyebrow ?? t('nav.home')}
          <span aria-hidden="true"> / </span>
          <span aria-current="page">{title}</span>
        </nav>
        <h1 className="eh-page-header__title" aria-label={title}>
          {[...title].map((character, index) => (
            <span
              key={`${character}-${index}`}
              aria-hidden="true"
              style={{ '--eh-title-index': index } as CSSProperties}
            >
              {character === ' ' ? '\u00a0' : character}
            </span>
          ))}
        </h1>
      </div>
      {actions && <div className="eh-page-header__actions">{actions}</div>}
    </header>
  );
}
