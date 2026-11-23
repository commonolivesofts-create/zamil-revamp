// Function & Feature (CI3 /function_feature): the attendance roadmap catalogue with search and
// category / status / priority filters. Static content.
import { useId, useState, type CSSProperties } from 'react';
import { Badge, type Tone } from '../../components/Badge';
import { OrvexaIcon } from '../../components/OrvexaIcon';
import { FEATURE_GROUPS, type FeaturePriority } from './catalogue';
import {
  EMPTY_FEATURE_FILTERS,
  filterFeatures,
  summarize,
  type FeatureFilters,
} from './filterFeatures';

const SUMMARY = summarize(FEATURE_GROUPS);

const PRIORITY_TONE: Record<FeaturePriority, Tone> = {
  high: 'bad',
  medium: 'warn',
  low: 'neutral',
};

const CARDS = [
  {
    key: 'total',
    label: 'Total features',
    icon: 'layers',
    value: SUMMARY.total,
    note: 'Across all attendance modules',
    theme: 'primary',
  },
  {
    key: 'existing',
    label: 'Available features',
    icon: 'circle-check',
    value: SUMMARY.existing,
    note: 'Already available or currently developed',
    theme: 'mint',
  },
  {
    key: 'proposed',
    label: 'Proposed features',
    icon: 'sparkles',
    value: SUMMARY.proposed,
    note: 'Recommended for future phases',
    theme: 'cyan',
  },
  {
    key: 'high',
    label: 'High priority',
    icon: 'flag',
    value: SUMMARY.high,
    note: 'Recommended before lower-priority items',
    theme: 'amber',
  },
] as const;

export default function FunctionFeaturePage() {
  const id = useId().replace(/:/g, '');
  const [filters, setFilters] = useState<FeatureFilters>(EMPTY_FEATURE_FILTERS);
  const groups = filterFeatures(FEATURE_GROUPS, filters);
  const shown = groups.reduce((count, group) => count + group.features.length, 0);
  const set = <K extends keyof FeatureFilters>(key: K, value: FeatureFilters[K]) =>
    setFilters((current) => ({ ...current, [key]: value }));

  return (
    <div className="zrv-hr zrv-hr--function-feature zrv-hr--compact zrv-ir zrv-ir--fitted zrv-ir--responsive zat-report">
      <header className="zrv-ir-head">
        <div className="zrv-ir-head__title">
          <nav aria-label="Breadcrumb">
            <ol className="zrv-ir-crumb">
              <li>Attendance</li>
              <li>Planning</li>
              <li>Function &amp; Feature</li>
            </ol>
          </nav>
          <h1 className="zrv-hr-title">Function &amp; Features</h1>
          <p className="zrv-hr-sub">
            What the attendance system does today and what is proposed next.
          </p>
        </div>
      </header>

      <section className="zrv-ir-overview" aria-label="Summary">
        {CARDS.map((card, index) => (
          <div key={card.key} className="zrv-ir-overview__slot">
            <article
              className={`zrv-ir-ov zrv-ir-ov--${card.theme}`}
              style={{ '--i': index } as CSSProperties}
            >
              <div className="zrv-ir-ov__top">
                <span className="zrv-ir-ov__label">
                  <OrvexaIcon name={card.icon} size={15} />
                  {card.label}
                </span>
              </div>
              <div className="zrv-ir-ov__hero">
                <b>{card.value}</b>
              </div>
              <p className="zrv-ir-ov__foot">{card.note}</p>
            </article>
          </div>
        ))}
      </section>

      <form
        className="zrv-ir-filters zat-feature-filters"
        aria-label="Filter features"
        onSubmit={(e) => e.preventDefault()}
      >
        <label className="zrv-ir-field zrv-ir-field--search" htmlFor={`${id}-search`}>
          <span>Search</span>
          <span className="zrv-ir-search">
            <OrvexaIcon name="search" size={16} />
            <input
              id={`${id}-search`}
              type="search"
              maxLength={100}
              placeholder="Search features"
              value={filters.search}
              onChange={(e) => set('search', e.target.value)}
            />
          </span>
        </label>
        <label className="zrv-ir-field" htmlFor={`${id}-category`}>
          <span>Category</span>
          <select
            id={`${id}-category`}
            value={filters.category}
            onChange={(e) => set('category', e.target.value)}
          >
            <option value="">All categories</option>
            {FEATURE_GROUPS.map((group) => (
              <option key={group.key} value={group.key}>
                {group.title}
              </option>
            ))}
          </select>
        </label>
        <label className="zrv-ir-field" htmlFor={`${id}-status`}>
          <span>Status</span>
          <select
            id={`${id}-status`}
            value={filters.status}
            onChange={(e) => set('status', e.target.value as FeatureFilters['status'])}
          >
            <option value="">All statuses</option>
            <option value="existing">Available</option>
            <option value="new">Proposed</option>
          </select>
        </label>
        <label className="zrv-ir-field" htmlFor={`${id}-priority`}>
          <span>Priority</span>
          <select
            id={`${id}-priority`}
            value={filters.priority}
            onChange={(e) => set('priority', e.target.value as FeatureFilters['priority'])}
          >
            <option value="">All priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <div className="zrv-ir-filters__actions">
          <button
            type="button"
            className="zrv-ir-btn"
            onClick={() => setFilters(EMPTY_FEATURE_FILTERS)}
          >
            <OrvexaIcon name="rotate-ccw" size={15} />
            Clear
          </button>
        </div>
      </form>

      <p className="zat-result-line" role="status">
        {shown} {shown === 1 ? 'feature' : 'features'} shown
      </p>

      {groups.length === 0 ? (
        <p className="zrv-admin-state" role="status">
          No features match the selected filters.
        </p>
      ) : (
        groups.map((group) => (
          <section
            key={group.key}
            className="zrv-ir-card zat-feature-group"
            aria-labelledby={`${id}-${group.key}`}
          >
            <header className="zrv-ir-card__head">
              <h2 id={`${id}-${group.key}`}>
                <OrvexaIcon name={group.icon} size={18} /> {group.title}
              </h2>
              <p className="zat-muted">{group.description}</p>
            </header>
            <ul className="zat-feature-grid">
              {group.features.map((feature) => (
                <li key={feature.title} className="zat-feature-card">
                  <div className="zat-feature-card__badges">
                    <Badge tone={feature.status === 'existing' ? 'good' : 'neutral'}>
                      {feature.status === 'existing' ? 'Available' : 'Proposed'}
                    </Badge>
                    <Badge tone={PRIORITY_TONE[feature.priority]}>
                      {feature.priority.charAt(0).toUpperCase() + feature.priority.slice(1)}{' '}
                      priority
                    </Badge>
                  </div>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                  <p className="zat-feature-card__benefit">
                    <OrvexaIcon name="target" size={14} /> {feature.benefit}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
