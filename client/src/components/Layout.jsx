import { useEffect, useState, useCallback } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  TrendingUp, LineChart, LogOut, Settings, BarChart3,
  Menu, X, LogIn, Lock, Shield, Heart, ChevronDown, ChevronRight,
  Wallet, BarChart2,
} from 'lucide-react';
import InstallPrompt from './InstallPrompt';
import PageContainer from './PageContainer';
import api from '../lib/api';
import { applyTheme } from '../lib/theme';
import { setCurrencySymbol } from '../lib/utils';

const FINANCE_ROUTES = ['/dashboard', '/portfolio', '/investments', '/other-assets', '/cashflow', '/transactions'];

const TRADING_NAV = [
  { to: '/trade',                   icon: LineChart,  label: 'Trade Ideas' },
  { to: '/stock-trade',             icon: BarChart3,  label: 'Stock Trade' },
  { to: '/live-trading/backtest',   icon: TrendingUp, label: 'Backtest' },
  { to: '/live-trading/post-trade', icon: BarChart2,  label: 'Post-Trade' },
];

/* ── Nav link class helpers ──────────────────────────────────────────────── */
function navClass(isActive, locked = false) {
  const base = 'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-body transition-all min-h-[44px] relative';
  if (isActive)  return `${base} text-accent-ink bg-accent/8`;
  if (locked)    return `${base} text-muted/50 hover:text-muted hover:bg-hairline/[0.05]`;
  return `${base} text-soft hover:text-white hover:bg-hairline/[0.06]`;
}

export default function Layout() {
  const { logout, isAuth, isAdmin, persons, activePerson, setActivePerson } = useAuth();
  const navigate   = useNavigate();
  const location  = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showProfilePicker, setShowProfilePicker] = useState(false);
  const [tradingOpen, setTradingOpen] = useState(false);
  const [sidebarFinanceEnabled, setSidebarFinanceEnabled] = useState(true);
  const [sidebarWellnessEnabled, setSidebarWellnessEnabled] = useState(true);

  const isFinanceRoute = FINANCE_ROUTES.includes(location.pathname);
  useEffect(() => {
    if (location.pathname.startsWith('/live-trading') || ['/trade', '/stock-trade'].includes(location.pathname))
      setTradingOpen(true);
  }, [location.pathname]);

  const refreshSettings = useCallback(() => {
    if (!isAuth) return;
    api.get('/settings').then(r => {
      const d = r.data;
      applyTheme(d?.themeMode ?? d?.theme ?? 'light', d?.accent ?? 'teal');
      if (d?.currencyDisplay) setCurrencySymbol(d.currencyDisplay);
      setSidebarFinanceEnabled(d?.sidebarFinanceEnabled !== false);
      setSidebarWellnessEnabled(d?.sidebarWellnessEnabled !== false);
    }).catch(() => {});
  }, [isAuth]);

  useEffect(() => {
    if (!isAuth) {
      setSidebarFinanceEnabled(true);
      setSidebarWellnessEnabled(true);
      return;
    }
    refreshSettings();
    const on = () => refreshSettings();
    window.addEventListener('investtrack-settings', on);
    return () => window.removeEventListener('investtrack-settings', on);
  }, [isAuth, refreshSettings]);

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
      {/* The sidebar follows the theme like every other surface. It was briefly
          pinned dark in both themes as a deliberate "anchor"; in practice a
          near-black rail beside an otherwise light app just looked broken. Its
          colours come from --sidebar-rgb and the ordinary ramp tokens, so both
          themes fall out for free. */}
      <aside
        className={`
          w-56 flex flex-col shrink-0
          fixed md:relative inset-y-0 left-0 z-50 md:z-auto
          transform transition-transform duration-250 ease-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
        style={{
          background: 'rgb(var(--sidebar-rgb))',
          borderRight: '1px solid rgb(var(--hairline-rgb) / 0.08)',
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center justify-between px-4 py-5 md:px-5"
          style={{ borderBottom: '1px solid rgb(var(--hairline-rgb) / 0.08)' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: 'linear-gradient(135deg, rgb(var(--accent-rgb)), rgb(var(--accent-dim-rgb)))',
                boxShadow: '0 0 16px rgb(var(--accent-rgb) / 0.30)',
              }}
            >
              <span className="text-accent-fg font-display font-bold text-[10px] tracking-tight">
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

        {/* Person switcher — shown when multi-person account */}
        {isAuth && persons.length > 1 && (
          <div
            className="px-3 py-3"
            style={{ borderBottom: '1px solid rgb(var(--hairline-rgb) / 0.08)' }}
          >
            <p className="text-[10px] text-muted/50 uppercase tracking-widest font-mono mb-2 px-1">Profile</p>
            {/* Inline rgba here was white-on-white in light theme, so the track
                the pills sit in vanished and only the active pill was visible. */}
            <div className="flex gap-1.5 p-1 rounded-full bg-hairline/[0.06] border border-hairline/10">
              {persons.map(p => (
                <button
                  key={p}
                  onClick={() => setActivePerson(p)}
                  className={`flex-1 px-2 py-1.5 rounded-full text-xs font-display font-bold transition-all min-h-[44px]
                    ${activePerson === p ? 'bg-accent text-accent-fg shadow-glow-accent' : 'text-soft bg-hairline/[0.06] hover:bg-hairline/15 hover:text-text'}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {/* Finance — single link; sub-tabs live in the top ribbon */}
          {sidebarFinanceEnabled && (
            <button
              type="button"
              onClick={() => { navigate('/dashboard'); closeSidebar(); }}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-body transition-all min-h-[44px] w-full text-left relative ${
                isFinanceRoute ? 'text-accent-ink bg-accent/8' : 'text-soft hover:text-white hover:bg-hairline/[0.06]'
              }`}
            >
              {isFinanceRoute && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full" style={{ background: 'var(--accent, #f0c040)' }} />}
              <Wallet size={16} className="shrink-0" />
              <span>Finance</span>
            </button>
          )}

          {/* Wellness — single link; sub-tabs live in the top ribbon */}
          {sidebarWellnessEnabled && (
            <button
              type="button"
              onClick={() => { navigate('/wellness/habits'); closeSidebar(); }}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-body transition-all min-h-[44px] w-full text-left relative ${
                location.pathname.startsWith('/wellness') ? 'text-accent-ink bg-accent/8' : 'text-soft hover:text-white hover:bg-hairline/[0.06]'
              }`}
            >
              {location.pathname.startsWith('/wellness') && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full" style={{ background: 'var(--accent, #f0c040)' }} />}
              <Heart size={16} className="shrink-0" />
              <span>Wellness</span>
            </button>
          )}

          {/* Trading (collapsible) — Trade Ideas, Stock Trade, Backtest, Post-Trade */}
          <div className="space-y-0.5">
            <button
              type="button"
              onClick={() => {
                if (!tradingOpen) { setTradingOpen(true); navigate('/trade'); }
                else { setTradingOpen(false); }
              }}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-body transition-all min-h-[44px] w-full text-left ${
                ['/trade', '/stock-trade'].includes(location.pathname) || location.pathname.startsWith('/live-trading')
                  ? 'text-accent-ink bg-accent/8'
                  : 'text-soft hover:text-white hover:bg-hairline/[0.06]'
              }`}
            >
              <BarChart3 size={16} className="shrink-0" />
              <span className="flex-1">Trading</span>
              {tradingOpen ? <ChevronDown size={14} className="text-muted shrink-0" /> : <ChevronRight size={14} className="text-muted shrink-0" />}
            </button>
            {tradingOpen && (
              <div className="pl-4 space-y-0.5">
                {TRADING_NAV.map(({ to, icon: Icon, label }) => (
                  <NavLink key={to} to={to}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-body transition-all min-h-[44px] relative ${
                        isActive ? 'text-accent-ink bg-accent/8' : 'text-muted hover:text-soft hover:bg-hairline/[0.05]'
                      }`
                    }
                    onClick={closeSidebar}
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-r-full" style={{ background: 'var(--accent, #f0c040)' }} />}
                        <Icon size={14} className="shrink-0" />
                        <span>{label}</span>
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            )}
          </div>

          {/* Settings */}
          <NavLink
            to="/settings"
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
                <Settings size={16} className="shrink-0" />
                <span className="flex-1">Settings</span>
                {!isAuth && <Lock size={11} className="text-muted/40 shrink-0" />}
              </>
            )}
          </NavLink>

          {/* Admin */}
          {isAdmin && (
            <>
              <div className="py-2">
                <div style={{ height: 1, background: 'rgb(var(--hairline-rgb) / 0.08)' }} />
              </div>
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-body transition-all min-h-[44px] relative ${
                    isActive
                      ? 'text-hue-amber bg-hue-amber/8'
                      : 'text-hue-amber/50 hover:text-hue-amber hover:bg-hue-amber/5'
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
          style={{ borderTop: '1px solid rgb(var(--hairline-rgb) / 0.08)' }}
        >
          <InstallPrompt />
          {isAuth ? (
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-soft hover:text-rose hover:bg-rose/5 transition-all w-full min-h-[44px]"
            >
              <LogOut size={16} />
              Sign Out
            </button>
          ) : (
            <button
              onClick={() => { navigate('/'); closeSidebar(); }}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-soft hover:text-accent-ink hover:bg-accent/5 transition-all w-full min-h-[44px]"
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
          className="md:hidden sticky top-0 z-30 flex items-center gap-3 px-4 pb-3 safe-area-top"
          style={{
            // Kept padding; the notch inset is added on top of it. `py-3` would
            // have been overridden outright by .safe-area-top.
            '--safe-pad-top': '0.75rem',
            background: 'rgb(var(--ink-rgb) / 0.92)',
            backdropFilter: 'blur(16px)',
            borderBottom: '1px solid rgb(var(--hairline-rgb) / 0.08)',
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
                background: 'linear-gradient(135deg, rgb(var(--accent-rgb)), rgb(var(--accent-dim-rgb)))',
                boxShadow: '0 0 12px rgb(var(--accent-rgb) / 0.25)',
              }}
            >
              <span className="text-accent-fg font-display font-bold text-[9px]">H·K</span>
            </div>
            <span className="font-display font-bold text-white text-sm tracking-tight">
              InvestTrack
            </span>
          </div>
          {isAuth && activePerson && (
            showProfilePicker ? (
              /* Expanded — all profiles inline, tap any to switch / collapse */
              <div
                className="flex gap-1 p-0.5 rounded-full"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                {persons.map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => { setActivePerson(p); setShowProfilePicker(false); }}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-display font-bold transition-all min-h-[44px] ${
                      activePerson === p
                        ? 'bg-accent text-accent-fg shadow-glow-accent'
                        : 'text-muted hover:bg-hairline/15 hover:text-text'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            ) : (
              /* Collapsed — pure pill, no chevron */
              <button
                type="button"
                onClick={() => persons.length > 1 && setShowProfilePicker(true)}
                className="px-4 py-2 rounded-full text-sm font-display font-bold min-h-[44px] transition-all"
                style={{ background: 'rgb(var(--accent-rgb) / 0.15)', color: 'var(--accent)' }}
              >
                {activePerson}
              </button>
            )
          )}
          {!isAuth && (
            <button
              onClick={() => navigate('/')}
              className="text-accent-ink text-sm font-medium hover:opacity-80 transition-opacity"
            >
              Sign In
            </button>
          )}
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-ink flex flex-col">
          <PageContainer>
            <Outlet />
            {/* Clearance for the fixed bottom ribbon on mobile. Must be a flex
                child inside PageContainer (not a sibling) so it is part of the
                content scroll-height, not covered by PageContainer's overflow. */}
            <div
              className="md:hidden shrink-0"
              style={{ height: 'calc(80px + env(safe-area-inset-bottom, 0px))' }}
            />
          </PageContainer>
        </main>
      </div>

      {/* ── Bottom Section Tab Bar — floating pill (mobile only) ─────── */}
      {/* overflow-hidden kills backdrop-filter in WebKit — must not be set */}
      <nav
        className="md:hidden fixed z-30 flex"
        style={{
          bottom: 'calc(14px + env(safe-area-inset-bottom, 0px))',
          left: '5%',
          right: '5%',
          borderRadius: '20px',
          /* surface-rgb adapts to theme: near-white in light, near-black in dark.
             At 15% opacity the blur does all the visual work in both themes. */
          background: 'rgb(var(--surface-rgb) / 0.01)',
          backdropFilter: 'blur(48px) saturate(220%)',
          WebkitBackdropFilter: 'blur(48px) saturate(220%)',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.10)',
        }}
      >
        {[
          { key: 'finance',  label: 'Finance',  icon: Wallet, to: '/dashboard',       isActive: !location.pathname.startsWith('/wellness') },
          { key: 'wellness', label: 'Wellness', icon: Heart,  to: '/wellness/habits', isActive: location.pathname.startsWith('/wellness') },
        ].map(({ key, label, icon: Icon, to, isActive }) => (
          <button
            key={key}
            type="button"
            onClick={() => { if (!isActive) navigate(to); }}
            className="flex-1 flex flex-col items-center gap-0.5 py-2 min-h-[44px] transition-all"
          >
            <div
              className="flex items-center justify-center w-12 h-5 rounded-full transition-all"
              style={isActive ? { background: 'rgb(var(--accent-rgb) / 0.18)' } : {}}
            >
              <Icon size={17} style={{ color: isActive ? 'var(--accent)' : 'rgb(var(--fg-soft-rgb))' }} />
            </div>
            <span
              className="text-[10px] font-semibold"
              style={{ color: isActive ? 'var(--accent)' : 'rgb(var(--fg-soft-rgb))' }}
            >
              {label}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
}
