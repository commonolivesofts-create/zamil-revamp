// Shown for menu items whose page is not rebuilt yet: says which phase brings it and links to the
// pages that already work (no placeholder data).
import { Link } from 'react-router';
import { RouteNotice } from '../../components/Feedback';
import { OrvexaIcon } from '../../components/OrvexaIcon';
import { ALL_NAV_ITEMS, BUILT_PAGES, type NavItem } from '../../app/navigation';

export function PlannedPage({ item }: { item: NavItem }) {
  const available = ALL_NAV_ITEMS.filter((nav) => BUILT_PAGES.has(nav.id));
  return (
    <div className="zat-planned">
      <RouteNotice
        eyebrow={`Planned · phase ${item.phase}`}
        title={item.label}
        description={
          <>
            This page is being rebuilt in phase {item.phase} of the attendance migration. Until then
            it is still available in the current attendance system.
          </>
        }
      />
      <section className="zrv-ir-card zat-available" aria-labelledby="zat-available-title">
        <header className="zrv-ir-card__head">
          <h2 id="zat-available-title">Available now</h2>
        </header>
        <ul className="zat-available__list">
          {available.map((nav) => (
            <li key={nav.id}>
              <Link to={nav.path} className="zat-available__link">
                <OrvexaIcon name={nav.icon} size={18} />
                <span>{nav.label}</span>
                <OrvexaIcon name="chevron-right" size={16} />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
