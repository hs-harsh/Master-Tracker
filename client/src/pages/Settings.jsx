import { useEffect, useState } from 'react';
import api from '../lib/api';
import { Save, Trash2, UserPlus, X, Mail } from 'lucide-react';
import { applyTheme } from '../lib/theme';
import { useAuth } from '../hooks/useAuth';
import PageHeader from '../components/PageHeader';

const THEME_MODES = ['dark', 'light'];
const ACCENT_OPTIONS = [
  { id: 'gold',   label: 'Gold',   hex: '#f0c040' },
  { id: 'teal',   label: 'Teal',   hex: '#2dd4bf' },
  { id: 'blue',   label: 'Blue',   hex: '#60a5fa' },
  { id: 'purple', label: 'Purple', hex: '#a78bfa' },
  { id: 'rose',   label: 'Rose',   hex: '#fb7185' },
];
const CURRENCY_OPTIONS = [
  { id: 'INR', label: '₹ INR' },
  { id: 'USD', label: '$ USD' },
];
export default function Settings() {
  const { personName, persons, fetchPersons } = useAuth();

  // ── People ──────────────────────────────────────────────────────────────────
  const [newPersonName, setNewPersonName] = useState('');
  const [personError,   setPersonError]   = useState('');
  const [addingPerson,  setAddingPerson]  = useState(false);

  // ── Profile emails ───────────────────────────────────────────────────────────
  const [profileEmails, setProfileEmails] = useState({});  // { personName: email }
  const [savingEmail,   setSavingEmail]   = useState({});  // { personName: bool }

  // ── Preferences / theme ──────────────────────────────────────────────────────
  const [defaultAccount,           setDefaultAccount]           = useState('');
  const [themeMode,                setThemeMode]                = useState('light');
  const [accent,                   setAccent]                   = useState('teal');
  const [currencyDisplay,          setCurrencyDisplay]          = useState('INR');
  const [dashboardDefaultProfile,  setDashboardDefaultProfile]  = useState('Both');
  const [anthropicApiKeySet,       setAnthropicApiKeySet]       = useState(false);
  const [anthropicApiKeyInput,     setAnthropicApiKeyInput]     = useState('');
  const [anthropicApiKeyTouched,   setAnthropicApiKeyTouched]   = useState(false);
  const [sidebarFinanceEnabled,     setSidebarFinanceEnabled]     = useState(true);
  const [sidebarWellnessEnabled,    setSidebarWellnessEnabled]    = useState(true);
  const [sidebarLiveTradingEnabled, setSidebarLiveTradingEnabled] = useState(true);
  const [expenseAnalyserSlotsPerProfile, setExpenseAnalyserSlotsPerProfile] = useState(3);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(null);

  // ── Monthly finance export ─────────────────────────────────────────────────
  const [financeExportEnabled, setFinanceExportEnabled] = useState(false);
  const [financeExportEmail,   setFinanceExportEmail]   = useState('');
  const [savingFinanceExport,  setSavingFinanceExport]  = useState(false);

  // ── Load global settings ────────────────────────────────────────────────────
  const load = () => {
    api.get('/settings').then(r => {
      const d = r.data;
      setDefaultAccount(d.defaultAccount || personName || '');
      setThemeMode(d.themeMode           || 'dark');
      setAccent(d.accent                 || 'gold');
      setCurrencyDisplay(d.currencyDisplay   || 'INR');
      setDashboardDefaultProfile(d.dashboardDefaultProfile || 'Both');
      setAnthropicApiKeySet(!!d.anthropicApiKeySet);
      setSidebarFinanceEnabled(d.sidebarFinanceEnabled !== false);
      setSidebarWellnessEnabled(d.sidebarWellnessEnabled !== false);
      setSidebarLiveTradingEnabled(d.sidebarLiveTradingEnabled !== false);
      setExpenseAnalyserSlotsPerProfile(
        typeof d.expenseAnalyserSlotsPerProfile === 'number' ? d.expenseAnalyserSlotsPerProfile : 3
      );
      setFinanceExportEnabled(!!d.financeExportRecurringEnabled);
      setFinanceExportEmail(d.financeExportRecurringEmail || '');
      applyTheme(d.themeMode || 'light', d.accent || 'teal');
    }).catch(() => {});
  };

  const loadProfileEmails = () => {
    api.get('/settings/profile').then(r => {
      const map = {};
      (r.data.profiles || []).forEach(p => { map[p.person_name] = p.email || ''; });
      setProfileEmails(map);
    }).catch(() => {});
  };

  useEffect(() => { load(); loadProfileEmails(); }, []);

  // ── Add person ──────────────────────────────────────────────────────────────
  const handleAddPerson = async () => {
    if (!newPersonName.trim()) return;
    setPersonError('');
    setAddingPerson(true);
    try {
      await api.post('/persons', { personName: newPersonName.trim() });
      setNewPersonName('');
      fetchPersons();
      loadProfileEmails();
    } catch (err) {
      setPersonError(err.response?.data?.error || 'Failed to add person');
    } finally {
      setAddingPerson(false);
    }
  };

  const handleRemovePerson = async (name) => {
    if (!confirm(`Remove "${name}"? Their data won't be deleted.`)) return;
    try {
      await api.delete(`/persons/${encodeURIComponent(name)}`);
      fetchPersons();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to remove');
    }
  };

  const handleSaveEmail = async (personName) => {
    setSavingEmail(s => ({ ...s, [personName]: true }));
    try {
      await api.put('/settings/profile', { person_name: personName, email: profileEmails[personName] || '' });
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save email');
    } finally {
      setSavingEmail(s => ({ ...s, [personName]: false }));
    }
  };

  const handleSaveFinanceExport = async () => {
    setSavingFinanceExport(true);
    try {
      await api.put('/settings', {
        financeExportRecurringEnabled: financeExportEnabled,
        financeExportRecurringEmail: financeExportEmail.trim(),
      });
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save monthly export settings');
    } finally {
      setSavingFinanceExport(false);
    }
  };

  // ── Save global settings ────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      const body = {
        defaultAccount,
        themeMode,
        accent,
        currencyDisplay,
        dashboardDefaultProfile,
        sidebarFinanceEnabled,
        sidebarWellnessEnabled,
        sidebarLiveTradingEnabled,
        expenseAnalyserSlotsPerProfile,
      };
      if (anthropicApiKeyTouched) body.anthropicApiKey = anthropicApiKeyInput.trim();
      await api.put('/settings', body);
      setAnthropicApiKeyTouched(false);
      setAnthropicApiKeyInput('');
      applyTheme(themeMode, accent);
      load();
      window.dispatchEvent(new Event('investtrack-settings'));
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleClearTransactions = async () => {
    if (!confirm('Delete ALL transactions? This cannot be undone.')) return;
    setClearing('transactions');
    try {
      const r = await api.delete('/transactions/clear-all');
      alert(`Cleared ${r.data?.deleted ?? 0} transaction(s).`);
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to clear');
    } finally { setClearing(null); }
  };

  const handleClearInvestments = async () => {
    if (!confirm('Delete ALL investments? This cannot be undone.')) return;
    setClearing('investments');
    try {
      const r = await api.delete('/investments/clear-all');
      alert(`Cleared ${r.data?.deleted ?? 0} investment(s).`);
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to clear');
    } finally { setClearing(null); }
  };

  return (
    <div className="stack-section">
      <PageHeader title="Settings" eyebrow="Manage profiles, sheet links and appearance" />

      {/* ── 1. People ── */}
      <div className="card max-w-2xl">
        <div className="flex items-center gap-2 mb-4">
          <UserPlus size={18} className="text-soft" />
          <h2 className="font-display font-bold text-white">People</h2>
        </div>
        <p className="text-sm text-soft mb-4">
          Each person has their own transactions, investments and cashflow.
        </p>

        {/* Profile list with email */}
        <div className="space-y-3 mb-4">
          {persons.map(p => (
            <div key={p} className="p-3 rounded-lg bg-card/60 border border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-mono text-white font-semibold">{p}</span>
                {p !== personName && (
                  <button onClick={() => handleRemovePerson(p)}
                    className="icon-btn text-muted hover:text-rose transition-colors" title={`Remove ${p}`}>
                    <X size={13} />
                  </button>
                )}
              </div>
              <div className="flex gap-2 items-center">
                <Mail size={13} className="text-muted shrink-0" />
                <input
                  className="input flex-1 text-xs py-1.5"
                  type="email"
                  placeholder={`${p.toLowerCase()}@example.com`}
                  value={profileEmails[p] || ''}
                  onChange={e => setProfileEmails(m => ({ ...m, [p]: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleSaveEmail(p)}
                />
                <button
                  onClick={() => handleSaveEmail(p)}
                  disabled={savingEmail[p]}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold min-h-[44px]
                    bg-hairline/5 text-soft border border-hairline/15 hover:text-text hover:border-hairline/25 transition-colors disabled:opacity-50">
                  <Save size={12} />{savingEmail[p] ? 'Saving…' : 'Save email'}
                </button>
              </div>
              <p className="text-[10px] text-muted mt-1.5 ml-5">Used for plan acceptance emails & wellness reminders</p>
            </div>
          ))}
        </div>

        <div className="flex gap-2 items-start">
          <div className="flex-1">
            <input className="input w-full" placeholder="New person name (e.g. Bob)"
              value={newPersonName}
              onChange={e => { setNewPersonName(e.target.value); setPersonError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleAddPerson()} />
            {personError && <p className="text-rose text-xs mt-1">{personError}</p>}
          </div>
          <button onClick={handleAddPerson} disabled={addingPerson || !newPersonName.trim()}
            className="btn-ghost flex items-center gap-2 shrink-0">
            <UserPlus size={14} /> Add
          </button>
        </div>

        <div className="mt-6 pt-6 border-t border-border">
          <label className="label">Expense Analyser — upload slots per profile</label>
          <p className="text-xs text-muted mb-2">
            Maximum bank / credit card PDFs each person can attach at once (1–10). Save below to apply.
          </p>
          <input
            type="number"
            min={1}
            max={10}
            className="input max-w-[120px]"
            value={expenseAnalyserSlotsPerProfile}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              setExpenseAnalyserSlotsPerProfile(Number.isFinite(n) ? Math.min(10, Math.max(1, n)) : 3);
            }}
          />
        </div>
      </div>

      {/* ── 1b. Monthly Finance Export ── */}
      <div className="card max-w-2xl">
        <div className="flex items-center gap-2 mb-4">
          <Mail size={18} className="text-soft" />
          <h2 className="font-display font-bold text-white">Monthly Finance Export</h2>
        </div>
        <p className="text-sm text-soft mb-4">
          On the 1st of every month, email a combined PDF report and Excel workbook covering every profile
          (net worth, portfolio, investments, illiquid assets, cashflow and transactions).
        </p>
        <label className="flex items-center justify-between gap-4 cursor-pointer mb-4">
          <span className="text-sm text-white">Enable monthly export</span>
          <button
            type="button"
            role="switch"
            aria-checked={financeExportEnabled}
            onClick={() => setFinanceExportEnabled(v => !v)}
            className={`tap relative w-11 h-6 rounded-full transition-colors shrink-0 ${financeExportEnabled ? 'bg-accent' : 'bg-muted/40'}`}
          >
            <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-accent-fg transition-transform ${financeExportEnabled ? 'translate-x-5' : ''}`} />
          </button>
        </label>
        <div className="flex gap-2 items-center">
          <Mail size={13} className="text-muted shrink-0" />
          <input
            className="input flex-1 text-sm"
            type="email"
            placeholder="you@example.com"
            value={financeExportEmail}
            onChange={e => setFinanceExportEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSaveFinanceExport()}
          />
          <button
            onClick={handleSaveFinanceExport}
            disabled={savingFinanceExport}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold min-h-[44px]
              bg-hairline/5 text-soft border border-hairline/15 hover:text-text hover:border-hairline/25 transition-colors disabled:opacity-50">
            <Save size={12} />{savingFinanceExport ? 'Saving…' : 'Save'}
          </button>
        </div>
        {financeExportEnabled && !financeExportEmail.trim() && (
          <p className="text-[11px] text-hue-amber mt-2">Enabled but no recipient email saved yet — the monthly export will be skipped until one is set.</p>
        )}
      </div>

      {/* ── 2. Preferences ── */}

      <div className="card max-w-2xl">
        <h2 className="font-display font-bold text-white mb-4">Preferences</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Currency</label>
            <select className="input w-full" value={currencyDisplay} onChange={e => setCurrencyDisplay(e.target.value)}>
              {CURRENCY_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-6 space-y-4 border-t border-border pt-6">
          <p className="text-sm text-soft">Sidebar: show or hide whole sections. Off = tab group hidden from the menu.</p>
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <span className="text-sm text-white">Show Finance (Dashboard, Portfolio, …)</span>
            <button
              type="button"
              role="switch"
              aria-checked={sidebarFinanceEnabled}
              onClick={() => setSidebarFinanceEnabled(v => !v)}
              className={`tap relative w-11 h-6 rounded-full transition-colors shrink-0 ${sidebarFinanceEnabled ? 'bg-accent' : 'bg-muted/40'}`}
            >
              <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-accent-fg transition-transform ${sidebarFinanceEnabled ? 'translate-x-5' : ''}`} />
            </button>
          </label>
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <span className="text-sm text-white">Show Wellness (Habits, Meals, Workouts)</span>
            <button
              type="button"
              role="switch"
              aria-checked={sidebarWellnessEnabled}
              onClick={() => setSidebarWellnessEnabled(v => !v)}
              className={`tap relative w-11 h-6 rounded-full transition-colors shrink-0 ${sidebarWellnessEnabled ? 'bg-accent' : 'bg-muted/40'}`}
            >
              <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-accent-fg transition-transform ${sidebarWellnessEnabled ? 'translate-x-5' : ''}`} />
            </button>
          </label>
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <span className="text-sm text-white">Show Live Trading (Backtest, Post-Trade)</span>
            <button
              type="button"
              role="switch"
              aria-checked={sidebarLiveTradingEnabled}
              onClick={() => setSidebarLiveTradingEnabled(v => !v)}
              className={`tap relative w-11 h-6 rounded-full transition-colors shrink-0 ${sidebarLiveTradingEnabled ? 'bg-accent' : 'bg-muted/40'}`}
            >
              <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-accent-fg transition-transform ${sidebarLiveTradingEnabled ? 'translate-x-5' : ''}`} />
            </button>
          </label>
        </div>
      </div>

      {/* ── 4. AI ── */}
      <div className="card max-w-2xl">
        <h2 className="font-display font-bold text-white mb-2">Claude / Anthropic (AI)</h2>
        <p className="text-sm text-soft mb-4">
          Used for <strong>Expense Analyser</strong>, <strong>Live Trading</strong> (backtest strategy parsing), <strong>Meals</strong> and <strong>Workouts</strong> AI features.
          Paste your key below and click <strong>Save all</strong>. Get a key at{' '}
          <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="tap text-soft hover:text-text hover:underline">console.anthropic.com</a>.
        </p>
        <div>
          <label className="label">Anthropic API key</label>
          <input type="password" className="input w-full max-w-md"
            placeholder={anthropicApiKeySet ? '•••••••• (enter new key to change)' : 'sk-ant-…'}
            value={anthropicApiKeyInput}
            onChange={e => { setAnthropicApiKeyInput(e.target.value); setAnthropicApiKeyTouched(true); }}
            autoComplete="off" />
          {anthropicApiKeySet && !anthropicApiKeyTouched && (
            <p className="text-xs text-muted mt-1">Key is set. Enter a new value above to change, then Save.</p>
          )}
        </div>
      </div>

      {/* ── Theme ── */}
      <div className="card max-w-2xl">
        <h2 className="font-display font-bold text-white mb-4">Theme</h2>
        <div className="space-y-4">
          <div>
            <span className="label block mb-2">Mode</span>
            <div className="flex flex-wrap gap-2">
              {THEME_MODES.map(t => (
                <button key={t} onClick={() => setThemeMode(t)}
                  className={`px-4 py-2 rounded-lg text-sm font-mono capitalize min-h-[44px] ${themeMode === t ? 'bg-accent text-accent-fg font-bold' : 'btn-ghost'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="label block mb-2">Accent color</span>
            <div className="flex flex-wrap gap-2">
              {ACCENT_OPTIONS.map(o => (
                <button key={o.id} onClick={() => setAccent(o.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-mono font-bold min-h-[44px] min-w-[44px] ${accent === o.id ? 'ring-2 ring-white ring-offset-2 ring-offset-ink' : 'opacity-80 hover:opacity-100'}`}
                  style={{ background: o.hex, color: '#0d0f14' }}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Save all (after theme) ── */}
      <div className="flex gap-2 max-w-2xl">
        <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
          <Save size={14} /> {saving ? 'Saving…' : 'Save all'}
        </button>
      </div>

      {/* ── 6. Clear data ── */}
      <div className="card max-w-2xl border-rose/30">
        <h2 className="font-display font-bold text-white mb-2">Clear data</h2>
        <p className="text-sm text-muted mb-4">Permanently delete all rows. This cannot be undone.</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleClearTransactions} disabled={clearing !== null}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm border border-rose/50 text-rose hover:bg-rose/10 transition-colors disabled:opacity-50 min-h-[44px]">
            <Trash2 size={14} />
            {clearing === 'transactions' ? 'Clearing…' : 'Clear all transactions'}
          </button>
          <button onClick={handleClearInvestments} disabled={clearing !== null}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm border border-rose/50 text-rose hover:bg-rose/10 transition-colors disabled:opacity-50 min-h-[44px]">
            <Trash2 size={14} />
            {clearing === 'investments' ? 'Clearing…' : 'Clear all investments'}
          </button>
        </div>
      </div>
    </div>
  );
}
