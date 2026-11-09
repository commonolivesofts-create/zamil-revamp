import { ArrowLeft, ShieldOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';

export function ForbiddenPage() {
  const { t } = useTranslation();
  return (
    <EmptyState
      className="py-20"
      icon={ShieldOff}
      title={t('errors.forbiddenTitle')}
      body={t('errors.forbiddenBody')}
      action={
        <Button asChild variant="secondary">
          <Link to="/">
            <ArrowLeft aria-hidden className="rtl:rotate-180" />
            {t('errors.backHome')}
          </Link>
        </Button>
      }
    />
  );
}
