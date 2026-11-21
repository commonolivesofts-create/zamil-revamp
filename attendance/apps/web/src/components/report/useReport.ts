// State and data for a ReportPage: paging, search (debounced), applied filters, CSV export.
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { DEFAULT_PAGE_SIZE } from '@attendance/shared';
import { api, apiDownload, errorMessage } from '../../lib/api';
import { saveBlob } from '../../lib/download';
import { useToast } from '../toastContext';
import type { FilterValues, ReportConfig } from './types';

/** Only filters with a value are sent. */
export function compactFilters<F extends FilterValues>(filters: F): Partial<F> {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value)) as Partial<F>;
}

export function useReport<F extends FilterValues, T>(config: ReportConfig<F, T>) {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const limit = config.pageSize ?? DEFAULT_PAGE_SIZE;
  const [filters, setFilters] = useState<F>(config.initialFilters);
  const [exporting, setExporting] = useState(false);

  // CI3 pages had no free-text search box; the API keeps the parameter for parity.
  const body = { page, limit, search: '', filters: compactFilters(filters) };
  const query = useQuery({
    queryKey: [config.id, body],
    queryFn: ({ signal }) =>
      api(`${config.endpoint}/list`, config.pageSchema, { method: 'POST', body, signal }),
    placeholderData: keepPreviousData,
  });

  const applyFilters = (next: F) => {
    setFilters(next);
    setPage(1);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const { blob, fileName } = await apiDownload(`${config.endpoint}/export`, {
        search: '',
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

  return {
    query,
    page,
    setPage,
    limit,
    filters,
    applyFilters,
    exporting,
    exportCsv,
  };
}
