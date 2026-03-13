import { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  LayoutDashboard, TrendingUp, Receipt, PieChart, Briefcase,
  Calculator, LineChart, LogOut, Settings, BarChart3,
  Menu, X, LogIn, Lock, Shield,
} from 'lucide-react';
import InstallPrompt from './InstallPrompt';
import api from '../lib/api';
import { applyTheme } from '../lib/theme';
import { setCurrencySymbol } from '../lib/utils';

const PUBLIC_NAV = [
  { to: '/trade',       icon: LineChart,  label: 'Trade Ideas' },
  { to: '/stock-trade', icon: BarChart3,  label: 'Stock Trade' },
];

const PRIVATE_NAV = [
  { to: '/',                  icon: LayoutDashboard, label: 'Dashboard',        end: true },
  { to: '/portfolio',         icon: PieChart,        label: 'Portfolio' },
  { to: '/investments',       icon: Briefcase,       label: 'Investments' },
  { to: '/cashflow',          icon: TrendingUp,      label: 'Cashflow' },
  { to: '/transactions',      icon: Receipt,         label: 'Transactions' },
  { to: '/expense-analyser',  icon: Calculator,      label: 'Expense Analyser' },
  { to: '/settings',          icon: Settings,        label: 'Settings' },
];

/* ── Nav link class helpers ──────────────────────────────────────────────── */
function navClass(isActive, locked = false) {
  const base = 'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-body transition-all min-h-[42px] relative';
  if (isActive)  return `${base} text-accent bg-accent/8`;
  if (locked)    return `${base} text-muted/50 hover:text-muted hover:bg-white/[0.03]`;
  return `${base} text-soft hover:text-white hover:bg-white/[0.04]`;
}

export default function Layout() {
  const { logout, isAuth, isAdmin } = useAuth();
  const navigate   = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isAuth) return;
    api.get('/settings').then(r => {
      const d = r.data;
      applyTheme(d?.themeMode ?? d?.theme ?? 'dark', d?.accent ?? 'gold');
      if (d?.currencyDisplay) setCurrencySymbol(d.currencyDisplay);
    }).catch(() => {});
  }, [isAuth]);

  const handleLogout  = () => { logout(); setSidebarOpen(false); };
  const closeSidebar  = () => setSidebarOpen(false);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile backdrop */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Close menu"
        className={`md:hidden fixed inset-0 z-40 transition-all duration-300 ${
          sidebarOpen
            ? 'bg-black/70 backdrop-blur-sm opacity-100'
            : 'opacity-0 pointer-events-none'
        }`}
        onClick={closeSidebar}
        onKeyDown={e => e.key === 'Escape' && closeSidebar()}
      />

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside
        className={`
          w-56 flex flex-col shrink-0
          fixed md:relative inset-y-0 left-0 z-50 md:z-auto
          transform transition-transform duration-250 ease-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
        style={{
          background: '#0b0d14',
          borderRight: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center justify-between px-4 py-5 md:px-5"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: 'linear-gradient(135deg, #f0c040, #c9a030)',
                boxShadow: '0 0 16px rgba(240,192,64,0.30)',
              }}
            >
              <span className="text-ink font-display font-black text-[10px] tracking-tight">
                H·K
              </span>
            </div>
            <div>
              <span className="font-display font-bold text-white text-sm tracking-tight block leading-tight">
                InvestTrack
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={closeSidebar}
            className="md:hidden p-2 -mr-1 text-muted hover:text-white rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {/* Public tabs */}
          {PUBLIC_NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => navClass(isActive)}
              onClick={closeSidebar}
            >
              {({ isActive }) => (
                <>
                  {/* Active accent bar */}
                  {isActive && (
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
                      style={{ background: 'var(--accent, #f0c040)' }}
                    />
                  )}
                  <Icon size={16} className="shrink-0" />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}

          {/* Divider */}
          <div className="py-2">
            <div style={{ height: 1, background: 'rgba(255,255,255,0.05)' }} />
          </div>

          {/* Private tabs */}
          {PRIVATE_NAV.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => navClass(isActive, !isAuth)}
              onClick={closeSidebar}
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
                      style={{ background: 'var(--accent, #f0c040)' }}
                    />
                  )}
                  <Icon size={16} className="shrink-0" />
                  <span className="flex-1">{label}</span>
                  {!isAuth && <Lock size={11} className="text-muted/40 shrink-0" />}
                </>
              )}
            </NavLink>
          ))}

          {/* Admin */}
          {isAdmin && (
            <>
              <div className="py-2">
                <div style={{ height: 1, background: 'rgba(255,255,255,0.05)' }} />
              </div>
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-body transition-all min-h-[42px] relative ${
                    isActive
                      ? 'text-amber-400 bg-amber-500/8'
                      : 'text-amber-500/50 hover:text-amber-400 hover:bg-amber-500/5'
                  }`
                }
                onClick={closeSidebar}
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full bg-amber-400" />
                    )}
                    <Shield size={16} className="shrink-0" />
                    Admin
                  </>
                )}
              </NavLink>
            </>
          )}
        </nav>

        {/* Bottom — install + sign out */}
        <div
          className="px-3 py-4 space-y-1"
          style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
        >
          <InstallPrompt />
          {isAuth ? (
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-soft hover:text-rose hover:bg-rose/5 transition-all w-full min-h-[42px]"
            >
              <LogOut size={16} />
              Sign Out
            </button>
          ) : (
            <button
              onClick={() => { navigate('/'); closeSidebar(); }}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-soft hover:text-accent hover:bg-accent/5 transition-all w-full min-h-[42px]"
            >
              <LogIn size={16} />
              Sign In
            </button>
          )}
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Mobile top bar */}
        <header
          className="md:hidden sticky top-0 z-30 flex items-center gap-3 px-4 py-3 safe-area-top"
          style={{
            background: 'rgba(9, 9, 14, 0.92)',
            backdropFilter: 'blur(16px)',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 text-soft hover:text-white rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #f0c040, #c9a030)',
                boxShadow: '0 0 12px rgba(240,192,64,0.25)',
              }}
            >
              <span className="text-ink font-display font-black text-[9px]">H·K</span>
            </div>
            <span className="font-display font-bold text-white text-sm tracking-tight">
              InvestTrack
            </span>
          </div>
          {!isAuth && (
            <button
              onClick={() => navigate('/')}
              className="text-accent text-sm font-medium hover:opacity-80 transition-opacity"
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
