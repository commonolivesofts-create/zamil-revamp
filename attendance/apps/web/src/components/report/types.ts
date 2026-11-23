import type { ReactNode } from 'react';
import type { z } from 'zod';
import type { Paged } from '@attendance/shared';

/** Filter values as sent to the API: optional strings ('' = not set). */
export type FilterValues = Record<string, string | undefined>;

export interface FilterField<F extends FilterValues> {
  key: keyof F & string;
  label: string;
  type: 'text' | 'date' | 'time' | 'select';
  /** Text inputs: placeholder. Selects: label of the empty option (default "All"). */
  placeholder?: string;
  options?: readonly { value: string; label: string }[];
}

export interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
}

/** Everything a list page needs; the page itself is generic (ReportPage). */
export interface ReportConfig<F extends FilterValues, T, P extends Paged<T> = Paged<T>> {
  /** Query-cache key and CSS variant, e.g. 'employees'. */
  id: string;
  /** API path prefix: POST {endpoint}/list and {endpoint}/export. */
  endpoint: string;
  pageSchema: z.ZodType<P>;
  breadcrumb: readonly string[];
  title: string;
  subtitle?: string;
  heading: string;
  filters: readonly FilterField<F>[];
  /** Filters applied on first load (and by Reset unless resetFilters is given). */
  initialFilters: () => F;
  /** Filters applied by Reset when they differ from the first load (CI3 Reset cleared the default dates). */
  resetFilters?: () => F;
  /** Columns, or a function of the applied filters (e.g. an action that needs the date range). */
  columns: readonly Column<T>[] | ((filters: F) => readonly Column<T>[]);
  /** Extra class for a row (CI3 tinted some rows, e.g. absence without permission). */
  rowClassName?: (row: T) => string | undefined;
  rowKey: (row: T, index: number) => string;
  emptyMessage: string;
  /** Show the CSV export button (default true; needs a POST {endpoint}/export route). */
  exportable?: boolean;
  /** Rows per page on first load (default 10; CI3 used 30 on setup pages). */
  pageSize?: number;
  /** Cards between the filters and the table, from the list response (e.g. Alerts summary). */
  summary?: (data: P) => ReactNode;
  /** A line under the subtitle, from the list response (e.g. "Generated …"). */
  headerNote?: (data: P) => ReactNode;
  /** Shows CI3's free-text search box (only on pages that had one), with this placeholder. */
  searchPlaceholder?: string;
  /** Checked before filters are applied; a message blocks Apply (CI3 client-side checks). */
  validateFilters?: (filters: F) => string | null;
  /** Allow exporting an empty list (CI3 Alerts wrote a header-only file). */
  exportWhenEmpty?: boolean;
  /**
   * Keeps the applied filters and page in the address bar under these parameter names (CI3 Alerts
   * used history.pushState), so Back restores a view and a filtered view can be bookmarked.
   * Not combined with searchPlaceholder.
   */
  urlState?: { [K in keyof F & string]: string };
  /** Shows CI3's active-filter chips (remove one filter, or "Clear All" = Reset). */
  filterChips?: boolean;
  /** Extra buttons in the page header (e.g. "Add shift"), shown before Filter. */
  headerActions?: ReactNode;
}
