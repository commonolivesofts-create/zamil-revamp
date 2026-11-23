// Filtering and summary for the Function & Feature catalogue (CI3: function_feature/list.js and
// Function_feature::index summary counts).
import type { Feature, FeatureGroup, FeaturePriority, FeatureStatus } from './catalogue';

export interface FeatureFilters {
  search: string;
  category: string;
  status: '' | FeatureStatus;
  priority: '' | FeaturePriority;
}

export const EMPTY_FEATURE_FILTERS: FeatureFilters = {
  search: '',
  category: '',
  status: '',
  priority: '',
};

export function summarize(groups: readonly FeatureGroup[]) {
  const all = groups.flatMap((group) => group.features);
  return {
    total: all.length,
    existing: all.filter((f) => f.status === 'existing').length,
    proposed: all.filter((f) => f.status !== 'existing').length,
    high: all.filter((f) => f.priority === 'high').length,
  };
}

const haystack = (group: FeatureGroup, feature: Feature) =>
  [feature.title, feature.description, feature.benefit, group.title].join(' ').toLowerCase();

/** Groups with only the matching features; groups left empty are dropped. */
export function filterFeatures(
  groups: readonly FeatureGroup[],
  filters: FeatureFilters,
): FeatureGroup[] {
  const search = filters.search.trim().toLowerCase();
  return groups
    .filter((group) => !filters.category || group.key === filters.category)
    .map((group) => ({
      ...group,
      features: group.features.filter(
        (feature) =>
          (!search || haystack(group, feature).includes(search)) &&
          (!filters.status || feature.status === filters.status) &&
          (!filters.priority || feature.priority === filters.priority),
      ),
    }))
    .filter((group) => group.features.length > 0);
}
