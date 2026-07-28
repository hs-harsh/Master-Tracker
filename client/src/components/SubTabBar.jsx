import { NavLink } from 'react-router-dom';

/**
 * Section sub-navigation, shared by FinanceLayout and WellnessLayout.
 *
 * Deliberately *secondary* to the sidebar. The sidebar owns the accent (accent
 * text + a left accent bar on the active item); this bar is entirely neutral,
 * so a screenshot of a finance page reads sidebar-first. The active tab is a
 * raised `bg-card` chip with a neutral inset hairline, not an accent fill —
 * which also returns one accent element per finance/wellness page to the
 * Phase 5 accent budget.
 *
 * Colours come from theme tokens (`bg-card`, `text-text`, `hairline`), not the
 * old inline `rgba(255,255,255,0.04)` / `rgba(255,255,255,0.08)` pair, which
 * was invisible on a light background.
 *
 * Wraps rather than scrolls at narrow widths, so it never widens the page.
 */
export default function SubTabBar({ tabs }) {
  return (
    <div className="flex gap-1 p-1 rounded-xl bg-hairline/[0.04] border border-hairline/10 overflow-x-auto scrollbar-none sm:flex-wrap">
      {tabs.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          title={label}
          className={({ isActive }) =>
            `flex items-center gap-2 px-2.5 sm:px-4 py-2 rounded-lg text-sm font-body transition-all min-h-[44px] shrink-0 ${
              isActive
                ? 'bg-card text-text font-semibold ring-1 ring-inset ring-hairline/15'
                : 'text-soft hover:text-text'
            }`
          }
        >
          {Icon && <Icon size={16} className="shrink-0" />}
          <span className="hidden sm:inline">{label}</span>
        </NavLink>
      ))}
    </div>
  );
}
