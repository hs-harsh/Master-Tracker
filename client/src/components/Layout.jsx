import { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { LayoutDashboard, TrendingUp, Receipt, PieChart, Briefcase, Calculator, LineChart, LogOut, Settings, BarChart3, Menu, X, LogIn, Lock } from 'lucide-react';
import api from '../lib/api';
import { applyTheme } from '../lib/theme';
import { setCurrencySymbol } from '../lib/utils';

const PUBLIC_NAV = [
  { to: '/trade', icon: LineChart, label: 'Trade Ideas' },
  { to: '/stock-trade', icon: BarChart3, label: 'Stock Trade' },
];

const PRIVATE_NAV = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/portfolio', icon: PieChart, label: 'Portfolio' },
  { to: '/investments', icon: Briefcase, label: 'Investments' },
  { to: '/cashflow', icon: TrendingUp, label: 'Cashflow' },
  { to: '/transactions', icon: Receipt, label: 'Transactions' },
  { to: '/expense-analyser', icon: Calculator, label: 'Expense Analyser' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Layout() {
  const { logout, isAuth } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isAuth) return;
    api.get('/settings').then(r => {
      const d = r.data;
      applyTheme(d?.themeMode ?? d?.theme ?? 'dark', d?.accent ?? 'gold');
      if (d?.currencyDisplay) setCurrencySymbol(d.currencyDisplay);
    }).catch(() => {});
  }, [isAuth]);

  const handleLogout = () => { logout(); setSidebarOpen(false); };
  const closeSidebar = () => setSidebarOpen(false);

  const navLinkClass = ({ isActive }) =>
    `flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-body transition-all min-h-[44px] ${
      isActive ? 'bg-accent/10 text-accent border border-accent/20' : 'text-soft hover:text-white hover:bg-card'
    }`;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile overlay */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Close menu"
        className={`md:hidden fixed inset-0 z-40 bg-black/60 transition-opacity ${sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={closeSidebar}
        onKeyDown={(e) => e.key === 'Escape' && closeSidebar()}
      />

      {/* Sidebar */}
      <aside
        className={`
          w-56 bg-surface border-r border-border flex flex-col shrink-0
          fixed md:relative inset-y-0 left-0 z-50 md:z-auto
          transform transition-transform duration-200 ease-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-border md:px-5 md:py-6">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
              <span className="text-ink font-display font-bold text-xs">H·K</span>
            </div>
            <span className="font-display font-bold text-white text-sm tracking-tight">InvestTrack</span>
          </div>
          <button
            type="button"
            onClick={closeSidebar}
            className="md:hidden p-2 -mr-2 text-muted hover:text-white rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>
        {isAuth && <p className="text-muted text-xs px-5 pb-2 font-body hidden md:block">Harsh & Kirti</p>}

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {/* Public tabs — always accessible */}
          {PUBLIC_NAV.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} className={navLinkClass} onClick={closeSidebar}>
              <Icon size={18} />
              {label}
            </NavLink>
          ))}

          {/* Divider */}
          <div className="pt-2 pb-1">
            <div className="border-t border-border" />
          </div>

          {/* Private tabs — visible always, show login prompt when not authed */}
          {PRIVATE_NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-body transition-all min-h-[44px] ${
                  isActive
                    ? 'bg-accent/10 text-accent border border-accent/20'
                    : isAuth
                    ? 'text-soft hover:text-white hover:bg-card'
                    : 'text-muted hover:text-soft hover:bg-card/50'
                }`
              }
              onClick={closeSidebar}
            >
              <Icon size={18} />
              <span className="flex-1">{label}</span>
              {!isAuth && <Lock size={12} className="text-muted shrink-0" />}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-border">
          {isAuth ? (
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-soft hover:text-rose hover:bg-rose/5 transition-all w-full min-h-[44px]"
            >
              <LogOut size={18} />
              Sign Out
            </button>
          ) : (
            <button
              onClick={() => { navigate('/'); closeSidebar(); }}
              className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-soft hover:text-accent hover:bg-accent/5 transition-all w-full min-h-[44px]"
            >
              <LogIn size={18} />
              Sign In
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-col flex-1 min-w-0">
        <header className="md:hidden sticky top-0 z-30 flex items-center gap-3 px-4 py-3 bg-ink border-b border-border safe-area-top">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 text-soft hover:text-white rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Open menu"
          >
            <Menu size={24} />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
              <span className="text-ink font-display font-bold text-xs">H·K</span>
            </div>
            <span className="font-display font-bold text-white text-sm">InvestTrack</span>
          </div>
          {!isAuth && (
            <button
              onClick={() => navigate('/')}
              className="text-accent text-sm font-medium hover:underline"
            >
              Sign In
            </button>
          )}
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-ink flex flex-col">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
