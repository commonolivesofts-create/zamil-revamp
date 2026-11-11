import { useTranslation } from 'react-i18next';

/** The shared Zamil Digitalization startup treatment used while the session loads. */
export function StartupLoading() {
  const { t } = useTranslation();

  return (
    <div className="eh-startup-loading" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{t('app.loading')}</span>
      <div className="eh-startup-loading__visual" aria-hidden="true">
        <span className="eh-startup-loading__brand">{t('app.loadingBrand')}</span>
        <span className="eh-startup-loading__track" />
      </div>
    </div>
  );
}
