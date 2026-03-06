import { useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { LayoutDashboard, TrendingUp, Receipt, PieChart, Briefcase, Calculator, LineChart, LogOut, Settings, BarChart3 } from 'lucide-react';
import api from '../lib/api';
import { applyTheme } from '../lib/theme';
import { setCurrencySymbol } from '../lib/utils';

const NAV = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/trade', icon: LineChart, label: 'Trade Ideas' },
  { to: '/stock-trade', icon: BarChart3, label: 'Stock Trade' },
  { to: '/portfolio', icon: PieChart, label: 'Portfolio' },
  { to: '/investments', icon: Briefcase, label: 'Investments' },
  { to: '/cashflow', icon: TrendingUp, label: 'Cashflow' },
  { to: '/transactions', icon: Receipt, label: 'Transactions' },
  { to: '/expense-analyser', icon: Calculator, label: 'Expense Analyser' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Layout() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/settings').then(r => {
      const d = r.data;
      applyTheme(d?.themeMode ?? d?.theme ?? 'dark', d?.accent ?? 'gold');
      if (d?.currencyDisplay) setCurrencySymbol(d.currencyDisplay);
    }).catch(() => {});
  }, []);

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 bg-surface border-r border-border flex flex-col shrink-0">
        {/* Logo */}
        <div className="px-5 py-6 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
              <span className="text-ink font-display font-bold text-xs">H·K</span>
            </div>
            <span className="font-display font-bold text-white text-sm tracking-tight">InvestTrack</span>
          </div>
          <p className="text-muted text-xs mt-1 font-body">Harsh & Kirti</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-body transition-all ${
                  isActive
                    ? 'bg-accent/10 text-accent border border-accent/20'
                    : 'text-soft hover:text-white hover:bg-card'
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <div className="px-3 py-4 border-t border-border">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-soft hover:text-rose hover:bg-rose/5 transition-all w-full"
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto bg-ink">
        <Outlet />
      </main>
    </div>
  );
}
