import { useLocation, useNavigate } from 'react-router-dom';
import { Wallet, Heart } from 'lucide-react';

const SECTIONS = [
  {
    key: 'finance',
    label: 'Finance',
    icon: Wallet,
    to: '/dashboard',
    active: p => !p.startsWith('/wellness'),
  },
  {
    key: 'wellness',
    label: 'Wellness',
    icon: Heart,
    to: '/wellness/habits',
    active: p => p.startsWith('/wellness'),
  },
];

/**
 * Mobile-only pill row that lets the user switch between Finance and Wellness
 * without opening the sidebar. Renders above the SubTabBar in both
 * FinanceLayout and WellnessLayout; hidden on md+ (sidebar handles it there).
 */
export default function MobileSectionSwitcher() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  return (
    <div className="md:hidden flex gap-2 px-1">
      {SECTIONS.map(({ key, label, icon: Icon, to, active }) => {
        const isActive = active(pathname);
        return (
          <button
            key={key}
            type="button"
            onClick={() => { if (!isActive) navigate(to); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              isActive
                ? 'bg-accent text-accent-fg shadow-glow-accent'
                : 'text-soft hover:text-text bg-hairline/[0.06] hover:bg-hairline/15'
            }`}
          >
            <Icon size={12} className="shrink-0" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
