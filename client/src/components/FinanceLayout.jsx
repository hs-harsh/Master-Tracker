import { Outlet, NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  PieChart,
  Briefcase,
  TrendingUp,
  Receipt,
  Calculator,
} from 'lucide-react';

const FINANCE_TABS = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/portfolio', icon: PieChart, label: 'Portfolio' },
  { to: '/investments', icon: Briefcase, label: 'Investments' },
  { to: '/cashflow', icon: TrendingUp, label: 'Cashflow' },
  { to: '/transactions', icon: Receipt, label: 'Transactions' },
  { to: '/expense-analyser', icon: Calculator, label: 'Expense Analyser' },
];

export default function FinanceLayout() {
  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Sub-tab bar */}
      <div
        className="flex gap-1 p-1 rounded-xl flex-wrap"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {FINANCE_TABS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-body transition-all ${
                isActive ? 'bg-accent text-ink font-semibold' : 'text-soft hover:text-white'
              }`
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </div>

      <Outlet />
    </div>
  );
}
