import type { ReactNode } from 'react';
import type { z } from 'zod';
import type { Paged } from '@attendance/shared';

/** Filter values as sent to the API: optional strings ('' = not set). */
export type FilterValues = Record<string, string | undefined>;

export interface FilterField<F extends FilterValues> {
  key: keyof F & string;
  label: string;
  type: 'text' | 'date' | 'select';
  placeholder?: string;
  options?: readonly { value: string; label: string }[];
}

export interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
}

/** Everything a list page needs; the page itself is generic (ReportPage). */
export interface ReportConfig<F extends FilterValues, T> {
  /** Query-cache key and CSS variant, e.g. 'employees'. */
  id: string;
  /** API path prefix: POST {endpoint}/list and {endpoint}/export. */
  endpoint: string;
  pageSchema: z.ZodType<Paged<T>>;
  breadcrumb: readonly string[];
  title: string;
  subtitle?: string;
  heading: string;
  filters: readonly FilterField<F>[];
  /** Filters applied on first load and by Reset. */
  initialFilters: () => F;
  columns: readonly Column<T>[];
  rowKey: (row: T, index: number) => string;
  searchPlaceholder: string;
  emptyMessage: string;
}
