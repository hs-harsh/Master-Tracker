import { useEffect, useState } from 'react';
import api from '../lib/api';
import { Settings as SettingsIcon, Save, Trash2 } from 'lucide-react';
import { applyTheme } from '../lib/theme';

const THEME_MODES = ['dark', 'light'];
const ACCENT_OPTIONS = [
  { id: 'gold', label: 'Gold', hex: '#f0c040' },
  { id: 'teal', label: 'Teal', hex: '#2dd4bf' },
  { id: 'blue', label: 'Blue', hex: '#60a5fa' },
  { id: 'purple', label: 'Purple', hex: '#a78bfa' },
  { id: 'rose', label: 'Rose', hex: '#fb7185' },
];
const CURRENCY_OPTIONS = [
  { id: 'INR', label: '₹ INR' },
  { id: 'USD', label: '$ USD' },
];
const DASHBOARD_PROFILES = ['Harsh', 'Kirti', 'Both'];

export default function Settings() {
  const [sheetUrlTransactions, setSheetUrlTransactions] = useState('');
  const [sheetUrlInvestments, setSheetUrlInvestments] = useState('');
  const [defaultIdealSaving, setDefaultIdealSaving] = useState(100000);
  const [defaultIncome, setDefaultIncome] = useState(0);
  const [defaultAccount, setDefaultAccount] = useState('Harsh');
  const [themeMode, setThemeMode] = useState('dark');
  const [accent, setAccent] = useState('gold');
  const [currencyDisplay, setCurrencyDisplay] = useState('INR');
  const [dashboardDefaultProfile, setDashboardDefaultProfile] = useState('Both');
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(null);

  const load = () => {
    api.get('/settings').then(r => {
      const d = r.data;
      setSheetUrlTransactions(d.sheetUrlTransactions || '');
      setSheetUrlInvestments(d.sheetUrlInvestments || '');
      setDefaultIdealSaving(d.defaultIdealSaving ?? 100000);
      setDefaultIncome(d.defaultIncome ?? 0);
      setDefaultAccount(d.defaultAccount || 'Harsh');
      setThemeMode(d.themeMode || 'dark');
      setAccent(d.accent || 'gold');
      setCurrencyDisplay(d.currencyDisplay || 'INR');
      setDashboardDefaultProfile(d.dashboardDefaultProfile || 'Both');
      applyTheme(d.themeMode || 'dark', d.accent || 'gold');
    }).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/settings', {
        sheetUrlTransactions: sheetUrlTransactions.trim(),
        sheetUrlInvestments: sheetUrlInvestments.trim(),
        defaultIdealSaving: Number(defaultIdealSaving) || 0,
        defaultIncome: Number(defaultIncome) || 0,
        defaultAccount,
        themeMode,
        accent,
        currencyDisplay,
        dashboardDefaultProfile,
      });
      applyTheme(themeMode, accent);
      load();
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
    } finally {
      setClearing(null);
    }
  };

  const handleClearInvestments = async () => {
    if (!confirm('Delete ALL investments? This cannot be undone.')) return;
    setClearing('investments');
    try {
      const r = await api.delete('/investments/clear-all');
      alert(`Cleared ${r.data?.deleted ?? 0} investment(s).`);
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to clear');
    } finally {
      setClearing(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Settings</h1>
        <p className="text-muted text-sm mt-0.5">Sheet links, defaults, and appearance. Use <strong>Sync with sheet</strong> on Transactions or Investments to pull new rows.</p>
      </div>

      {/* Linked Google Sheet — save links only */}
      <div className="card max-w-2xl">
        <div className="flex items-center gap-2 mb-4">
          <SettingsIcon size={18} className="text-accent" />
          <h2 className="font-display font-bold text-white">Linked Google Sheet</h2>
        </div>
        <p className="text-sm text-soft mb-4">
          Use one Google Sheet with two tabs: <strong>Transactions</strong> and <strong>Investments</strong>. Publish each tab to the web as CSV, then paste the two links below. Sync from the <strong>Transactions</strong> or <strong>Investments</strong> tab to add new rows.
        </p>
        <div className="space-y-3">
          <div>
            <label className="label">Transactions sheet CSV URL</label>
            <input
              type="url"
              className="input w-full"
              placeholder="https://docs.google.com/... (published CSV link)"
              value={sheetUrlTransactions}
              onChange={e => setSheetUrlTransactions(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Investments sheet CSV URL</label>
            <input
              type="url"
              className="input w-full"
              placeholder="https://docs.google.com/... (published CSV link)"
              value={sheetUrlInvestments}
              onChange={e => setSheetUrlInvestments(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Defaults */}
      <div className="card max-w-2xl">
        <h2 className="font-display font-bold text-white mb-4">Cashflow defaults</h2>
        <p className="text-sm text-soft mb-4">
          Pre-fill when adding a new Cashflow month (ideal saving and income/salary).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Ideal saving</label>
            <input
              type="number"
              className="input w-full"
              min={0}
              value={defaultIdealSaving}
              onChange={e => setDefaultIdealSaving(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Income / Salary</label>
            <input
              type="number"
              className="input w-full"
              min={0}
              value={defaultIncome}
              onChange={e => setDefaultIncome(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Other preferences */}
      <div className="card max-w-2xl">
        <h2 className="font-display font-bold text-white mb-4">Preferences</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Default account</label>
            <select className="input w-full" value={defaultAccount} onChange={e => setDefaultAccount(e.target.value)}>
              {['Harsh', 'Kirti'].map(a => <option key={a}>{a}</option>)}
            </select>
            <p className="text-xs text-muted mt-1">Pre-fill when adding Transaction or Investment</p>
          </div>
          <div>
            <label className="label">Currency</label>
            <select className="input w-full" value={currencyDisplay} onChange={e => setCurrencyDisplay(e.target.value)}>
              {CURRENCY_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Dashboard default profile</label>
            <select className="input w-full" value={dashboardDefaultProfile} onChange={e => setDashboardDefaultProfile(e.target.value)}>
              {DASHBOARD_PROFILES.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Clear data */}
      <div className="card max-w-2xl border-rose/30">
        <h2 className="font-display font-bold text-white mb-2">Clear data</h2>
        <p className="text-sm text-muted mb-4">Permanently delete all rows. This cannot be undone.</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleClearTransactions}
            disabled={clearing !== null}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm border border-rose/50 text-rose hover:bg-rose/10 transition-colors disabled:opacity-50"
          >
            <Trash2 size={14} />
            {clearing === 'transactions' ? 'Clearing…' : 'Clear all transactions'}
          </button>
          <button
            onClick={handleClearInvestments}
            disabled={clearing !== null}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm border border-rose/50 text-rose hover:bg-rose/10 transition-colors disabled:opacity-50"
          >
            <Trash2 size={14} />
            {clearing === 'investments' ? 'Clearing…' : 'Clear all investments'}
          </button>
        </div>
      </div>

      {/* Theme: mode + accent color */}
      <div className="card max-w-2xl">
        <h2 className="font-display font-bold text-white mb-4">Theme</h2>
        <div className="space-y-4">
          <div>
            <span className="label block mb-2">Mode</span>
            <div className="flex flex-wrap gap-2">
              {THEME_MODES.map(t => (
                <button
                  key={t}
                  onClick={() => setThemeMode(t)}
                  className={`px-4 py-2 rounded-lg text-sm font-mono capitalize ${themeMode === t ? 'bg-accent text-ink font-bold' : 'btn-ghost'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="label block mb-2">Accent color</span>
            <div className="flex flex-wrap gap-2">
              {ACCENT_OPTIONS.map(o => (
                <button
                  key={o.id}
                  onClick={() => setAccent(o.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-mono font-bold ${accent === o.id ? 'ring-2 ring-white ring-offset-2 ring-offset-ink' : 'opacity-80 hover:opacity-100'}`}
                  style={{ background: o.hex, color: '#0d0f14' }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
          <Save size={14} /> {saving ? 'Saving…' : 'Save all'}
        </button>
      </div>
    </div>
  );
}
