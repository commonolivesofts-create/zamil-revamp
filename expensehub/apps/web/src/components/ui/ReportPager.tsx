import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';

function pageItems(current: number, total: number): (number | string)[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const start = Math.max(2, Math.min(current - 1, total - 4));
  const end = Math.min(total - 1, Math.max(current + 1, 5));
  return [
    1,
    ...(start > 2 ? ['gap-start'] : []),
    ...Array.from({ length: end - start + 1 }, (_, index) => start + index),
    ...(end < total - 1 ? ['gap-end'] : []),
    total,
  ];
}

/** Shared report pager for setup listings; page numbers are 1-based. */
export function ReportPager({
  page,
  pages: pageCount,
  total,
  pageSize = 10,
  onPage,
  label,
}: {
  page: number;
  pages: number;
  total: number;
  pageSize?: number;
  onPage: (page: number) => void;
  label: string;
}) {
  const { t } = useTranslation();
  const pages = Math.max(pageCount, 1);
  const first = total ? (page - 1) * pageSize + 1 : 0;
  const last = Math.min(page * pageSize, total);
  return (
    <div className="eh-report-pager">
      <p className="eh-report-pager__info" role="status">
        {t('setup.listing.showing', { first, last, total })}
      </p>
      {(pages > 1 || page > 1) && (
        <nav className="eh-report-pager__nav" aria-label={label}>
          <Button
            variant="secondary"
            size="icon"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
            aria-label={t('setup.listing.previousPage')}
          >
            <ChevronLeft aria-hidden />
          </Button>
          {pageItems(Math.min(page, pages), pages).map((item) =>
            typeof item === 'number' ? (
              <Button
                key={item}
                variant={item === page ? 'primary' : 'secondary'}
                size="icon"
                aria-current={item === page ? 'page' : undefined}
                onClick={() => onPage(item)}
              >
                {item}
              </Button>
            ) : (
              <span key={item} className="eh-report-pager__gap" aria-hidden="true">
                …
              </span>
            ),
          )}
          <Button
            variant="secondary"
            size="icon"
            disabled={page >= pages}
            onClick={() => onPage(page + 1)}
            aria-label={t('setup.listing.nextPage')}
          >
            <ChevronRight aria-hidden />
          </Button>
        </nav>
      )}
    </div>
  );
}
