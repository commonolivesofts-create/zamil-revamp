import OrvexaIcon from "@/components/icons/OrvexaIcon.jsx";
import { INSIGHT_TEXT as T } from "../../hrRecruitmentText.js";
import "@/styles/hr-report-pager.css";

// Page numbers around the current one, with gaps ("…") toward the ends.
function pageItems(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const start = Math.max(2, Math.min(current - 1, total - 4));
  const end = Math.min(total - 1, Math.max(current + 1, 5));
  const middle = Array.from({ length: end - start + 1 }, (_, index) => start + index);
  return [1, ...(start > 2 ? ["gap-start"] : []), ...middle, ...(end < total - 1 ? ["gap-end"] : []), total];
}

// HR report table footer: the page summary on the left, page controls on the
// right. `page` is 1-based; controls stay on a page past the end so the user
// can always get back.
export function ReportPager({ page, pages: count, total, onPage, disabled = false, label }) {
  const pages = Math.max(count, 1);
  return (
    <div className="zrv-ir-pager">
      <p className="zrv-ir-pager__info" role="status">
        {T.pageOf(page, pages, total)}
      </p>
      {(pages > 1 || page > 1) && (
        <nav className="zrv-ir-pager__nav" aria-label={label}>
          <button type="button" disabled={disabled || page <= 1} onClick={() => onPage(page - 1)} aria-label={T.previousPage}>
            <OrvexaIcon name="chevron-left" size={15} />
          </button>
          {pageItems(Math.min(page, pages), pages).map((item) =>
            typeof item === "number" ? (
              <button key={item} type="button" className={item === page ? "zrv-ir-is-on" : undefined}
                aria-current={item === page ? "page" : undefined} disabled={disabled}
                onClick={() => item !== page && onPage(item)}>
                {item}
              </button>
            ) : (
              <span key={item} className="zrv-ir-pager__gap" aria-hidden="true">…</span>
            ),
          )}
          <button type="button" disabled={disabled || page >= pages} onClick={() => onPage(page + 1)} aria-label={T.nextPage}>
            <OrvexaIcon name="chevron-right" size={15} />
          </button>
        </nav>
      )}
    </div>
  );
}
