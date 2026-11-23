// State and data for a ReportPage: paging, search (debounced), applied filters, CSV export.
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { DEFAULT_PAGE_SIZE } from '@attendance/shared';
import { api, apiDownload, errorMessage } from '../../lib/api';
import { saveBlob } from '../../lib/download';
import { useToast } from '../toastContext';
import type { Paged } from '@attendance/shared';
import type { FilterValues, ReportConfig } from './types';

/** Only filters with a value are sent. */
export function compactFilters<F extends FilterValues>(filters: F): Partial<F> {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value)) as Partial<F>;
}

/** Filters from the address bar; a missing parameter keeps the page's initial value. */
function filtersFromUrl<F extends FilterValues>(
  params: URLSearchParams,
  names: { [K in keyof F & string]: string },
  initial: F,
): F {
  const next: FilterValues = { ...initial };
  for (const [key, name] of Object.entries(names)) {
    const value = params.get(name);
    if (value !== null) next[key] = value;
  }
  return next as F;
}

export function useReport<F extends FilterValues, T, P extends Paged<T>>(
  config: ReportConfig<F, T, P>,
) {
  const toast = useToast();
  const [localPage, setLocalPage] = useState(1);
  const limit = config.pageSize ?? DEFAULT_PAGE_SIZE;
  const [localFilters, setLocalFilters] = useState<F>(config.initialFilters);
  const [searchParams, setSearchParams] = useSearchParams();
  const urlNames = config.urlState;
  const filters = urlNames
    ? filtersFromUrl(searchParams, urlNames, config.initialFilters())
    : localFilters;
  const page = urlNames ? Math.max(1, Number(searchParams.get('currentPage')) || 1) : localPage;
  /** Writes filters + page to the address bar as a new history entry (CI3 pushState). */
  const pushUrl = (next: F, nextPage: number) => {
    if (!urlNames) return;
    const params = new URLSearchParams();
    for (const [key, name] of Object.entries(urlNames)) params.set(name, next[key] ?? '');
    params.set('currentPage', String(nextPage));
    setSearchParams(params);
  };
  const setPage = (next: number) => (urlNames ? pushUrl(filters, next) : setLocalPage(next));
  const [exporting, setExporting] = useState(false);

  // Search box only where CI3 had one (config.searchPlaceholder); typed text is applied after 350 ms.
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchText.trim());
      setLocalPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchText]);
  const body = { page, limit, search, filters: compactFilters(filters) };
  // CI3 ran its client-side checks before every load: an invalid filter set shows the message and
  // loads nothing (e.g. Leave Requests with no processed data has no default dates).
  const blocked = config.validateFilters?.(filters) ?? null;
  const query = useQuery({
    enabled: !blocked,
    queryKey: [config.id, body],
    queryFn: ({ signal }) =>
      api(`${config.endpoint}/list`, config.pageSchema, { method: 'POST', body, signal }),
    placeholderData: keepPreviousData,
  });

  const applyFilters = (next: F) => {
    if (urlNames) {
      pushUrl(next, 1);
      return;
    }
    setLocalFilters(next);
    setLocalPage(1);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const { blob, fileName } = await apiDownload(`${config.endpoint}/export`, {
        search,
        filters: compactFilters(filters),
      });
      saveBlob(blob, fileName);
      toast.success('Export downloaded.');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  /** CI3 Reset / Clear All emptied the search box too. */
  const clearSearch = () => {
    setSearchText('');
    setSearch('');
  };

  return {
    query,
    page,
    setPage,
    limit,
    filters,
    applyFilters,
    exporting,
    exportCsv,
    searchText,
    setSearchText,
    clearSearch,
    blocked,
    /** Changes when the address bar changes the filters (Back / Forward). */
    urlKey: urlNames ? searchParams.toString() : '',
  };
}
