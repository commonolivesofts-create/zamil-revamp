import { ChevronLeft, ChevronRight } from 'lucide-react';

function pageItems(current: number, total: number): (number | string)[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const start = Math.max(2, Math.min(current - 1, total - 4));
  const end = Math.min(total - 1, Math.max(current + 1, 5));
  return [
    1,
    ...(start > 2 ? ['gap-start'] : []),
    ...Array.from({ length: end - start + 1 }, (_, i) => start + i),
    ...(end < total - 1 ? ['gap-end'] : []),
    total,
  ];
}

/** Training Hub companion to Zamil's shared report pager; page numbers are 1-based. */
export function ReportPager({
  page,
  pages: pageCount,
  total,
  pageSize = 10,
  onPage,
  disabled = false,
  label = 'Report pages',
}: {
  page: number;
  pages: number;
  total: number;
  pageSize?: number;
  onPage: (page: number) => void;
  disabled?: boolean;
  label?: string;
}) {
  const pages = Math.max(pageCount, 1);
  const first = total ? (page - 1) * pageSize + 1 : 0;
  const last = Math.min(page * pageSize, total);
  return (
    <div className="th-report-pager">
      <p className="th-report-pager__info" role="status">
        Showing {first}–{last} of {total} results
      </p>
      {(pages > 1 || page > 1) && (
        <nav className="th-report-pager__nav" aria-label={label}>
          <button
            type="button"
            disabled={disabled || page <= 1}
            onClick={() => onPage(page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft />
          </button>
          {pageItems(Math.min(page, pages), pages).map((item) =>
            typeof item === 'number' ? (
              <button
                key={item}
                type="button"
                className={item === page ? 'is-active' : undefined}
                aria-current={item === page ? 'page' : undefined}
                disabled={disabled}
                onClick={() => item !== page && onPage(item)}
              >
                {item}
              </button>
            ) : (
              <span key={item} className="th-report-pager__gap" aria-hidden="true">
                …
              </span>
            ),
          )}
          <button
            type="button"
            disabled={disabled || page >= pages}
            onClick={() => onPage(page + 1)}
            aria-label="Next page"
          >
            <ChevronRight />
          </button>
        </nav>
      )}
    </div>
  );
}
