import { useMemo, useState } from 'react'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import ViewHead from '@/features/dashboard/components/ViewHead.jsx'
import {
  DOMAIN_DEFINITIONS,
  MODULES,
  MODULES_PER_PAGE,
  filterModules,
} from '@/features/dashboard/dashboardExperience.js'

const ALL_DOMAINS = 'all'
const FILTERS = [
  { value: ALL_DOMAINS, label: 'All' },
  ...DOMAIN_DEFINITIONS.map((domain) => ({ value: domain.name, label: domain.name })),
]

function normalizeDomain(value) {
  if (!value || value === 'All') return ALL_DOMAINS
  return DOMAIN_DEFINITIONS.some((domain) => domain.name === value) ? value : ALL_DOMAINS
}

export default function ModuleAtlas({ initialDomain, onBack }) {
  const [domain, setDomain] = useState(() => normalizeDomain(initialDomain))
  const [query, setQuery] = useState('')
  const [visible, setVisible] = useState(MODULES_PER_PAGE)

  const filtered = useMemo(() => filterModules({ domain, query }), [domain, query])
  const shown = filtered.slice(0, visible)

  const changeDomain = (value) => {
    setDomain(value)
    setVisible(MODULES_PER_PAGE)
  }

  const changeQuery = (value) => {
    setQuery(value)
    setVisible(MODULES_PER_PAGE)
  }

  return (
    <>
      <ViewHead
        eyebrow="Navigate at scale"
        title="Module Atlas"
        description="Search and filter across 12 business domains. The 216 entries are representative placeholders for future workflows."
        onBack={onBack}
      />

      <div className="stat-strip" data-zrv-reveal>
        <div className="stat-card">
          <small>Sample modules</small>
          <strong>{MODULES.length}</strong>
          <em>Scalable navigation model</em>
        </div>
        <div className="stat-card">
          <small>Business spaces</small>
          <strong>{DOMAIN_DEFINITIONS.length}</strong>
          <em>Filter by department</em>
        </div>
        <div className="stat-card">
          <small>Catalogue previews</small>
          <strong>{MODULES.length}</strong>
          <em>Representative placeholders</em>
        </div>
        <div className="stat-card">
          <small>Menu depth</small>
          <strong>01</strong>
          <em>Direct access pattern</em>
        </div>
      </div>

      <div className="atlas-toolbar">
        <label className="search-field">
          <OrvexaIcon name="search" />
          <input
            type="search"
            value={query}
            onChange={(event) => changeQuery(event.target.value)}
            placeholder={`Search ${MODULES.length} module names, domains, or actions…`}
            aria-label="Search modules"
          />
        </label>
      </div>

      <div className="filters">
        {FILTERS.map((filter) => (
          <button
            className={`filter ${domain === filter.value ? 'active' : ''}`}
            type="button"
            key={filter.value}
            onClick={() => changeDomain(filter.value)}
            aria-pressed={domain === filter.value}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="atlas-count">
        <span>{filtered.length} matching module{filtered.length === 1 ? '' : 's'} · {Math.min(filtered.length, visible)} displayed</span>
        <span>Only matching entries are rendered · Lightweight discovery</span>
      </div>

      <div className="module-grid" data-zrv-reveal>
        {shown.length ? shown.map((module) => (
          <article className="module-tile" key={module.id}>
            <span className="tile-icon"><OrvexaIcon name={module.icon} /></span>
            <div>
              <strong>{module.name}</strong>
              <small>{module.domain}</small>
            </div>
            <div className="tile-bottom">
              <span className="tag mock">Catalog preview</span>
              <OrvexaIcon name="arrow-right" className="icon-sm" />
            </div>
          </article>
        )) : (
          <div className="empty" style={{ gridColumn: '1 / -1' }}>
            No modules found. Try a shorter term or another business space.
          </div>
        )}
      </div>

      {filtered.length > visible && (
        <div style={{ textAlign: 'center', padding: '28px 0' }}>
          <button className="btn ghost" type="button" onClick={() => setVisible((value) => value + MODULES_PER_PAGE)}>
            Show more modules <OrvexaIcon name="arrow-right" />
          </button>
        </div>
      )}
    </>
  )
}
