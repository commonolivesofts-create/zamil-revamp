// Table footer: page summary and page controls (markup of client ReportPager.jsx), plus page size.
import { formatCount } from '../../lib/format';
import { OrvexaIcon } from '../OrvexaIcon';
import { pageItems } from './pageItems';

export function ReportPager({
  page,
  pages: count,
  total,
  onPage,
  disabled,
  label,
}: {
  page: number;
  pages: number;
  total: number;
  onPage: (page: number) => void;
  disabled: boolean;
  label: string;
}) {
  const pages = Math.max(count, 1);
  return (
    <div className="zrv-ir-pager">
      <p className="zrv-ir-pager__info" role="status">
        Page {page} of {pages} · {formatCount(total)} total
      </p>
      {(pages > 1 || page > 1) && (
        <nav className="zrv-ir-pager__nav" aria-label={label}>
          <button
            type="button"
            disabled={disabled || page <= 1}
            onClick={() => onPage(page - 1)}
            aria-label="Previous page"
          >
            <OrvexaIcon name="chevron-left" size={15} />
          </button>
          {pageItems(Math.min(page, pages), pages).map((item) =>
            typeof item === 'number' ? (
              <button
                key={item}
                type="button"
                className={item === page ? 'zrv-ir-is-on' : undefined}
                aria-current={item === page ? 'page' : undefined}
                disabled={disabled}
                onClick={() => item !== page && onPage(item)}
              >
                {item}
              </button>
            ) : (
              <span key={item} className="zrv-ir-pager__gap" aria-hidden="true">
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
            <OrvexaIcon name="chevron-right" size={15} />
          </button>
        </nav>
      )}
    </div>
  );
}
