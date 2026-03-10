import { useEffect, useState } from 'react';
import api from '../lib/api';
import { Settings as SettingsIcon, Save, Trash2 } from 'lucide-react';
import { applyTheme } from '../lib/theme';
import { useAuth } from '../hooks/useAuth';

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

export default function Settings() {
  const { personName } = useAuth();
  const [sheetUrlTransactions, setSheetUrlTransactions] = useState('');
  const [sheetUrlInvestments, setSheetUrlInvestments] = useState('');
  const [sheetUrl, setSheetUrl] = useState('');
  const [defaultIdealSaving, setDefaultIdealSaving] = useState(100000);
  const [defaultIncome, setDefaultIncome] = useState(0);
  const [defaultAccount, setDefaultAccount] = useState('');
  const [themeMode, setThemeMode] = useState('dark');
  const [accent, setAccent] = useState('gold');
  const [currencyDisplay, setCurrencyDisplay] = useState('INR');
  const [dashboardDefaultProfile, setDashboardDefaultProfile] = useState('Both');
  const [anthropicApiKeySet, setAnthropicApiKeySet] = useState(false);
  const [anthropicApiKeyInput, setAnthropicApiKeyInput] = useState('');
  const [anthropicApiKeyTouched, setAnthropicApiKeyTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(null);

  const load = () => {
    api.get('/settings').then(r => {
      const d = r.data;
      setSheetUrlTransactions(d.sheetUrlTransactions || '');
      setSheetUrlInvestments(d.sheetUrlInvestments || '');
      setSheetUrl(d.sheetUrl || '');
      setDefaultIdealSaving(d.defaultIdealSaving ?? 100000);
      setDefaultIncome(d.defaultIncome ?? 0);
      setDefaultAccount(d.defaultAccount || personName || '');
      setThemeMode(d.themeMode || 'dark');
      setAccent(d.accent || 'gold');
      setCurrencyDisplay(d.currencyDisplay || 'INR');
      setDashboardDefaultProfile(d.dashboardDefaultProfile || 'Both');
      setAnthropicApiKeySet(!!d.anthropicApiKeySet);
      applyTheme(d.themeMode || 'dark', d.accent || 'gold');
    }).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = {
        sheetUrlTransactions: sheetUrlTransactions.trim(),
        sheetUrlInvestments: sheetUrlInvestments.trim(),
        sheetUrl: sheetUrl.trim(),
        defaultIdealSaving: Number(defaultIdealSaving) || 0,
        defaultIncome: Number(defaultIncome) || 0,
        defaultAccount,
        themeMode,
        accent,
        currencyDisplay,
        dashboardDefaultProfile,
      };
      if (anthropicApiKeyTouched) body.anthropicApiKey = anthropicApiKeyInput.trim();
      await api.put('/settings', body);
      setAnthropicApiKeyTouched(false);
      setAnthropicApiKeyInput('');
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
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Settings</h1>
        <p className="text-muted text-sm mt-0.5">Sheet links, defaults, and appearance. Use <strong>Sync with sheet</strong> on Transactions or Investments to pull new rows.</p>
      </div>

      {/* Linked Google Sheet — 3 URL placeholders */}
      <div className="card max-w-2xl">
        <div className="flex items-center gap-2 mb-4">
          <SettingsIcon size={18} className="text-accent" />
          <h2 className="font-display font-bold text-white">Linked Google Sheet</h2>
        </div>
        <div className="space-y-4">
          <div>
            <label className="label">TRANSACTIONS SHEET CSV URL</label>
            <input
              type="url"
              className="input w-full"
              placeholder="https://docs.google.com/... (published CSV link)"
              value={sheetUrlTransactions}
              onChange={e => setSheetUrlTransactions(e.target.value)}
            />
          </div>
          <div>
            <label className="label">INVESTMENT SHEET CSV URL</label>
            <input
              type="url"
              className="input w-full"
              placeholder="https://docs.google.com/... (published CSV link)"
              value={sheetUrlInvestments}
              onChange={e => setSheetUrlInvestments(e.target.value)}
            />
          </div>
          <div>
            <label className="label">SHEET CSV URL</label>
            <input
              type="url"
              className="input w-full"
              placeholder="https://docs.google.com/... (published CSV link)"
              value={sheetUrl}
              onChange={e => setSheetUrl(e.target.value)}
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
            <label className="label">Currency</label>
            <select className="input w-full" value={currencyDisplay} onChange={e => setCurrencyDisplay(e.target.value)}>
              {CURRENCY_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Expense Analyser (Anthropic API key) */}
      <div className="card max-w-2xl">
        <h2 className="font-display font-bold text-white mb-2">Expense Analyser (AI)</h2>
        <p className="text-sm text-soft mb-4">
          Required for the <strong>Expense Analyser</strong> tab to analyze PDF statements with Claude. Get a key at <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">console.anthropic.com</a>. The key is stored only on this server and never shown again.
        </p>
        <div>
          <label className="label">Anthropic API key</label>
          <input
            type="password"
            className="input w-full max-w-md"
            placeholder={anthropicApiKeySet ? '•••••••• (enter new key to change)' : 'sk-ant-...'}
            value={anthropicApiKeyInput}
            onChange={e => { setAnthropicApiKeyInput(e.target.value); setAnthropicApiKeyTouched(true); }}
            autoComplete="off"
          />
          {anthropicApiKeySet && !anthropicApiKeyTouched && <p className="text-xs text-muted mt-1">Key is set. Enter a new value above to change, then Save.</p>}
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
