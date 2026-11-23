import { describe, expect, it } from 'vitest';
import { FEATURE_GROUPS } from '../features/functionFeature/catalogue';
import { filterFeatures, summarize } from '../features/functionFeature/filterFeatures';
import { pageItems } from '../components/report/pageItems';
import { formatIsoDate } from '../lib/format';
import { ALL_NAV_ITEMS, BUILT_PAGES, NAVIGATION, findNavItem } from './navigation';

describe('navigation', () => {
  it('keeps every CI3 menu entry (19) in the CI3 groups, with unique ids and paths', () => {
    expect(NAVIGATION.map((s) => s.label)).toEqual([
      'Main',
      'Reports',
      'Contractors',
      'Interface & Jobs',
      'Planning',
    ]);
    expect(ALL_NAV_ITEMS).toHaveLength(19);
    expect(new Set(ALL_NAV_ITEMS.map((i) => i.id)).size).toBe(19);
    expect(new Set(ALL_NAV_ITEMS.map((i) => i.path)).size).toBe(19);
  });

  it('marks exactly the pages of phases 2-8 as built', () => {
    const built = ALL_NAV_ITEMS.filter((i) => i.phase >= 2 && i.phase <= 8).map((i) => i.id);
    expect([...BUILT_PAGES].sort()).toEqual(built.sort());
    expect(findNavItem('/report/absence')?.label).toBe('Absence');
  });
});

describe('function & feature catalogue', () => {
  it('carries the CI3 catalogue over unchanged', () => {
    expect(FEATURE_GROUPS).toHaveLength(7);
    // Same counts as the CI3 controller's summary cards.
    expect(summarize(FEATURE_GROUPS)).toEqual({ total: 35, existing: 16, proposed: 19, high: 24 });
  });

  it('filters by search, category, status and priority and drops empty groups', () => {
    const byStatus = filterFeatures(FEATURE_GROUPS, {
      search: '',
      category: 'payroll',
      status: 'new',
      priority: 'high',
    });
    expect(byStatus.map((g) => g.features.map((f) => f.title))).toEqual([
      ['Payroll Readiness Gate'],
    ]);
    const bySearch = filterFeatures(FEATURE_GROUPS, {
      search: 'IQAMA',
      category: '',
      status: '',
      priority: '',
    });
    expect(bySearch.flatMap((g) => g.features.map((f) => f.title))).toEqual([
      'Document Expiry Setup',
    ]);
  });
});

describe('helpers', () => {
  it('builds compact page lists', () => {
    expect(pageItems(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageItems(10, 20)).toEqual([1, 'gap-start', 9, 10, 11, 'gap-end', 20]);
  });

  it('formats ISO dates and leaves other values as stored', () => {
    expect(formatIsoDate('2024-03-01')).toBe('01 Mar 2024');
    expect(formatIsoDate('21-10-26')).toBe('21-10-26');
    expect(formatIsoDate(null)).toBe('—');
  });
});
