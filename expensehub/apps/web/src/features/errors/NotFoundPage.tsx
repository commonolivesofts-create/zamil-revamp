import { ArrowLeft, MapPinOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <EmptyState
      className="py-20"
      icon={MapPinOff}
      title={t('notFound.title')}
      body={t('notFound.body')}
      action={
        <Button asChild variant="secondary">
          <Link to="/">
            <ArrowLeft aria-hidden className="rtl:rotate-180" />
            {t('notFound.home')}
          </Link>
        </Button>
      }
    />
  );
}
