import { useEffect, useState } from 'react';
import api from '../lib/api';
import { Save, Trash2, UserPlus, X } from 'lucide-react';
import { applyTheme } from '../lib/theme';
import { useAuth } from '../hooks/useAuth';

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

  // ── Preferences / theme ──────────────────────────────────────────────────────
  const [defaultAccount,           setDefaultAccount]           = useState('');
  const [themeMode,                setThemeMode]                = useState('dark');
  const [accent,                   setAccent]                   = useState('gold');
  const [currencyDisplay,          setCurrencyDisplay]          = useState('INR');
  const [dashboardDefaultProfile,  setDashboardDefaultProfile]  = useState('Both');
  const [anthropicApiKeySet,       setAnthropicApiKeySet]       = useState(false);
  const [anthropicApiKeyInput,     setAnthropicApiKeyInput]     = useState('');
  const [anthropicApiKeyTouched,   setAnthropicApiKeyTouched]   = useState(false);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(null);

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
      applyTheme(d.themeMode || 'dark', d.accent || 'gold');
    }).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  // ── Add person ──────────────────────────────────────────────────────────────
  const handleAddPerson = async () => {
    if (!newPersonName.trim()) return;
    setPersonError('');
    setAddingPerson(true);
    try {
      await api.post('/persons', { personName: newPersonName.trim() });
      setNewPersonName('');
      fetchPersons();
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
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Settings</h1>
        <p className="text-muted text-sm mt-0.5">Manage profiles, sheet links and appearance.</p>
      </div>

      {/* ── 1. People ── */}
      <div className="card max-w-2xl">
        <div className="flex items-center gap-2 mb-4">
          <UserPlus size={18} className="text-accent" />
          <h2 className="font-display font-bold text-white">People</h2>
        </div>
        <p className="text-sm text-soft mb-4">
          Each person has their own transactions, investments and cashflow.
        </p>
        <div className="flex flex-wrap gap-2 mb-4">
          {persons.map(p => (
            <div key={p} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card/60 border border-border text-sm font-mono text-white">
              {p}
              {p !== personName && (
                <button onClick={() => handleRemovePerson(p)}
                  className="text-muted hover:text-rose ml-1 transition-colors" title={`Remove ${p}`}>
                  <X size={13} />
                </button>
              )}
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
            className="btn-primary flex items-center gap-2 shrink-0">
            <UserPlus size={14} /> Add
          </button>
        </div>

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
      </div>

      {/* ── 4. AI ── */}
      <div className="card max-w-2xl">
        <h2 className="font-display font-bold text-white mb-2">Expense Analyser (AI)</h2>
        <p className="text-sm text-soft mb-4">
          Required for the <strong>Expense Analyser</strong> tab. Get a key at{' '}
          <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">console.anthropic.com</a>.
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

      {/* ── Save all ── */}
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
          <Save size={14} /> {saving ? 'Saving…' : 'Save all'}
        </button>
      </div>

      {/* ── 5. Theme ── */}
      <div className="card max-w-2xl">
        <h2 className="font-display font-bold text-white mb-4">Theme</h2>
        <div className="space-y-4">
          <div>
            <span className="label block mb-2">Mode</span>
            <div className="flex flex-wrap gap-2">
              {THEME_MODES.map(t => (
                <button key={t} onClick={() => setThemeMode(t)}
                  className={`px-4 py-2 rounded-lg text-sm font-mono capitalize ${themeMode === t ? 'bg-accent text-ink font-bold' : 'btn-ghost'}`}>
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
                  className={`px-4 py-2 rounded-lg text-sm font-mono font-bold ${accent === o.id ? 'ring-2 ring-white ring-offset-2 ring-offset-ink' : 'opacity-80 hover:opacity-100'}`}
                  style={{ background: o.hex, color: '#0d0f14' }}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── 6. Clear data ── */}
      <div className="card max-w-2xl border-rose/30">
        <h2 className="font-display font-bold text-white mb-2">Clear data</h2>
        <p className="text-sm text-muted mb-4">Permanently delete all rows. This cannot be undone.</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleClearTransactions} disabled={clearing !== null}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm border border-rose/50 text-rose hover:bg-rose/10 transition-colors disabled:opacity-50">
            <Trash2 size={14} />
            {clearing === 'transactions' ? 'Clearing…' : 'Clear all transactions'}
          </button>
          <button onClick={handleClearInvestments} disabled={clearing !== null}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm border border-rose/50 text-rose hover:bg-rose/10 transition-colors disabled:opacity-50">
            <Trash2 size={14} />
            {clearing === 'investments' ? 'Clearing…' : 'Clear all investments'}
          </button>
        </div>
      </div>
    </div>
  );
}
