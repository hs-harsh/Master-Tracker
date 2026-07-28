import { Outlet, NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  PieChart,
  Briefcase,
  TrendingUp,
  Receipt,
  Calculator,
  Landmark,
} from 'lucide-react';
import MobileSectionSwitcher from './MobileSectionSwitcher';

const FINANCE_TABS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/portfolio', icon: PieChart, label: 'Portfolio' },
  { to: '/investments', icon: Briefcase, label: 'Liquid Investments' },
  { to: '/cashflow', icon: TrendingUp, label: 'Cashflow' },
  { to: '/transactions', icon: Receipt, label: 'Transactions' },
  { to: '/expense-analyser', icon: Calculator, label: 'Expense Analyser' },
  { to: '/other-assets', icon: Landmark, label: 'Illiquid Investments' },
];

export default function FinanceLayout() {
  return (
    <div className="p-4 sm:p-6 space-y-5">
      <MobileSectionSwitcher />

      {/* Sub-tab bar — icon-only on mobile (fills width), icon+label on sm+ */}
      <div
        className="flex gap-1 p-1 rounded-xl sm:flex-wrap scrollbar-none"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {FINANCE_TABS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/dashboard'}
            title={label}
            className={({ isActive }) =>
              `flex flex-1 sm:flex-none items-center justify-center sm:justify-start gap-2 sm:px-4 py-2 rounded-lg text-sm font-body transition-all min-h-[44px] ${
                isActive ? 'bg-accent text-ink font-semibold' : 'text-soft hover:text-white'
              }`
            }
          >
            <Icon size={16} className="shrink-0" />
            <span className="hidden sm:inline">{label}</span>
          </NavLink>
        ))}
      </div>

      <Outlet />
    </div>
  );
}
