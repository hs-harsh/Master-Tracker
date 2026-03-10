import { useEffect, useState, useCallback } from 'react';
import api from '../lib/api';
import { Settings as SettingsIcon, Save, Trash2, UserPlus, X, CalendarDays, CheckCircle2, Loader2 } from 'lucide-react';
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
const YEAR = new Date().getFullYear();

export default function Settings() {
  const { personName, persons, fetchPersons } = useAuth();

  // ── People ──────────────────────────────────────────────────────────────────
  const [newPersonName, setNewPersonName] = useState('');
  const [personError,   setPersonError]   = useState('');
  const [addingPerson,  setAddingPerson]  = useState(false);
  const [quickSetupPerson, setQuickSetupPerson] = useState(null);
  const [quickSetupLoading, setQuickSetupLoading] = useState(false);
  const [quickSetupDone,    setQuickSetupDone]    = useState(false);

  // ── Per-person cashflow defaults ────────────────────────────────────────────
  const [selectedProfile,  setSelectedProfile]  = useState('');
  const [profileIncome,    setProfileIncome]    = useState(0);
  const [profileSaving,    setProfileSaving]    = useState(0);
  const [profileRegular,   setProfileRegular]   = useState(0);
  const [profileEmi,       setProfileEmi]       = useState(0);
  const [savingDefaults,   setSavingDefaults]   = useState(false);
  const [applyingDefaults, setApplyingDefaults] = useState(false);
  const [applyMsg,         setApplyMsg]         = useState('');

  // ── Sheet URLs ───────────────────────────────────────────────────────────────
  const [sheetUrlTransactions, setSheetUrlTransactions] = useState('');
  const [sheetUrlInvestments,  setSheetUrlInvestments]  = useState('');
  const [sheetUrl,             setSheetUrl]             = useState('');

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
      setSheetUrlTransactions(d.sheetUrlTransactions || '');
      setSheetUrlInvestments(d.sheetUrlInvestments   || '');
      setSheetUrl(d.sheetUrl                         || '');
      setDefaultAccount(d.defaultAccount || personName || '');
      setThemeMode(d.themeMode           || 'dark');
      setAccent(d.accent                 || 'gold');
      setCurrencyDisplay(d.currencyDisplay   || 'INR');
      setDashboardDefaultProfile(d.dashboardDefaultProfile || 'Both');
      setAnthropicApiKeySet(!!d.anthropicApiKeySet);
      applyTheme(d.themeMode || 'dark', d.accent || 'gold');
    }).catch(() => {});
  };

  // ── Load defaults for the selected profile ──────────────────────────────────
  const loadProfileDefaults = useCallback(async (profile) => {
    if (!profile) return;
    try {
      const r = await api.get(`/settings/person-defaults/${encodeURIComponent(profile)}`);
      setProfileIncome(r.data.income          || 0);
      setProfileSaving(r.data.idealSaving     || 0);
      setProfileRegular(r.data.regularExpense || 0);
      setProfileEmi(r.data.emi                || 0);
    } catch {}
  }, []);

  useEffect(() => { load(); }, []);

  // Auto-select first person and load their defaults
  useEffect(() => {
    if (persons.length && !selectedProfile) {
      setSelectedProfile(persons[0]);
    }
  }, [persons]);

  useEffect(() => {
    if (selectedProfile) loadProfileDefaults(selectedProfile);
  }, [selectedProfile, loadProfileDefaults]);

  // ── Save per-person defaults ────────────────────────────────────────────────
  const handleSaveDefaults = async () => {
    if (!selectedProfile) return;
    setSavingDefaults(true);
    try {
      await api.put(`/settings/person-defaults/${encodeURIComponent(selectedProfile)}`, {
        income: Number(profileIncome) || 0,
        idealSaving: Number(profileSaving) || 0,
        regularExpense: Number(profileRegular) || 0,
        emi: Number(profileEmi) || 0,
      });
      setApplyMsg(`✓ Defaults saved for ${selectedProfile}.`);
      setTimeout(() => setApplyMsg(''), 4000);
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to save defaults');
    } finally {
      setSavingDefaults(false);
    }
  };

  // ── Apply defaults to current year ─────────────────────────────────────────
  const handleApplyDefaults = async () => {
    if (!selectedProfile) return;
    if (!confirm(`Apply defaults to all 12 months of ${YEAR} for ${selectedProfile}?\n\nIncome, Ideal Saving, Regular Expense and EMI will be updated. Other data is preserved.`)) return;
    setApplyingDefaults(true);
    try {
      // Save first, then apply
      await api.put(`/settings/person-defaults/${encodeURIComponent(selectedProfile)}`, {
        income: Number(profileIncome) || 0,
        idealSaving: Number(profileSaving) || 0,
        regularExpense: Number(profileRegular) || 0,
        emi: Number(profileEmi) || 0,
      });
      const r = await api.post('/settings/apply-year-defaults', { year: YEAR, personName: selectedProfile });
      setApplyMsg(`✓ Seeded ${r.data.seeded} months for ${selectedProfile} in ${YEAR}.`);
      setTimeout(() => setApplyMsg(''), 6000);
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to apply defaults');
    } finally {
      setApplyingDefaults(false);
    }
  };

  // ── Add person ──────────────────────────────────────────────────────────────
  const handleAddPerson = async () => {
    if (!newPersonName.trim()) return;
    setPersonError('');
    setAddingPerson(true);
    try {
      await api.post('/persons', { personName: newPersonName.trim() });
      const added = newPersonName.trim();
      setNewPersonName('');
      fetchPersons();
      setSelectedProfile(added);
      setQuickSetupPerson(added);
      setQuickSetupDone(false);
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

  const handleQuickSetup = async () => {
    setQuickSetupLoading(true);
    try {
      await api.put(`/settings/person-defaults/${encodeURIComponent(quickSetupPerson)}`, {
        income: Number(profileIncome) || 0,
        idealSaving: Number(profileSaving) || 0,
        regularExpense: Number(profileRegular) || 0,
        emi: Number(profileEmi) || 0,
      });
      const r = await api.post('/settings/apply-year-defaults', { year: YEAR, personName: quickSetupPerson });
      setQuickSetupDone(true);
      setTimeout(() => setQuickSetupPerson(null), 3000);
    } catch (err) {
      alert(err.response?.data?.error || 'Set Income/Saving defaults above first, then try again.');
    } finally {
      setQuickSetupLoading(false);
    }
  };

  // ── Save global settings ────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      const body = {
        sheetUrlTransactions: sheetUrlTransactions.trim(),
        sheetUrlInvestments:  sheetUrlInvestments.trim(),
        sheetUrl:             sheetUrl.trim(),
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

  const discretionary = (Number(profileIncome) || 0) - (Number(profileSaving) || 0) - (Number(profileRegular) || 0) - (Number(profileEmi) || 0);

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Settings</h1>
        <p className="text-muted text-sm mt-0.5">Manage profiles, cashflow defaults, sheet links and appearance.</p>
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

        {/* Quick-setup prompt after adding a person */}
        {quickSetupPerson && !quickSetupDone && (
          <div className="mt-4 rounded-xl border border-accent/30 bg-accent/5 p-4 flex items-start gap-3">
            <CalendarDays size={16} className="text-accent mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white font-semibold">Populate {YEAR} for <span className="text-accent">{quickSetupPerson}</span>?</p>
              <p className="text-xs text-muted mt-0.5">Uses the defaults you set below. You can edit individual months in Cashflow.</p>
              <div className="flex gap-2 mt-3">
                <button onClick={handleQuickSetup} disabled={quickSetupLoading}
                  className="btn-primary text-xs flex items-center gap-1.5 py-1.5">
                  {quickSetupLoading
                    ? <><Loader2 size={12} className="animate-spin" />Populating…</>
                    : <><CalendarDays size={12} />Yes, populate {YEAR}</>}
                </button>
                <button onClick={() => setQuickSetupPerson(null)} disabled={quickSetupLoading}
                  className="btn-ghost text-xs text-muted py-1.5">Skip</button>
              </div>
            </div>
          </div>
        )}
        {quickSetupPerson && quickSetupDone && (
          <div className="mt-4 rounded-xl border border-teal/30 bg-teal/5 p-3 flex items-center gap-2 text-sm text-teal">
            <CheckCircle2 size={15} /> All 12 months of {YEAR} populated for <strong>{quickSetupPerson}</strong>.
          </div>
        )}
      </div>

      {/* ── 2. Cashflow defaults (per-person) ── */}
      <div className="card max-w-2xl">
        <div className="flex items-center gap-2 mb-1">
          <CalendarDays size={18} className="text-accent" />
          <h2 className="font-display font-bold text-white">Cashflow Defaults</h2>
        </div>
        <p className="text-sm text-soft mb-4">
          Set monthly defaults per profile. Use <strong>Apply to {YEAR}</strong> to seed all 12 months — override individual months in Cashflow.
        </p>

        {/* Profile selector */}
        {persons.length > 0 && (
          <div className="mb-5">
            <label className="label">Profile</label>
            <select className="input w-full max-w-xs" value={selectedProfile}
              onChange={e => setSelectedProfile(e.target.value)}>
              {persons.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 mb-5">
          <div>
            <label className="label">Income / Salary</label>
            <input type="number" className="input w-full" min={0} value={profileIncome}
              onChange={e => setProfileIncome(e.target.value)} placeholder="e.g. 150000" />
          </div>
          <div>
            <label className="label">Ideal Saving</label>
            <input type="number" className="input w-full" min={0} value={profileSaving}
              onChange={e => setProfileSaving(e.target.value)} placeholder="e.g. 50000" />
          </div>
          <div>
            <label className="label">Regular Expense</label>
            <input type="number" className="input w-full" min={0} value={profileRegular}
              onChange={e => setProfileRegular(e.target.value)} placeholder="e.g. 30000" />
          </div>
          <div>
            <label className="label">EMI</label>
            <input type="number" className="input w-full" min={0} value={profileEmi}
              onChange={e => setProfileEmi(e.target.value)} placeholder="e.g. 25000" />
          </div>
        </div>

        {/* Live discretionary preview */}
        {(Number(profileIncome) > 0) && (
          <div className="rounded-lg bg-surface border border-border p-3 grid grid-cols-4 gap-2 text-center text-xs mb-5">
            {[
              ['Income', profileIncome, 'text-accent'],
              ['Saving', profileSaving, 'text-teal'],
              ['Fixed Costs', (Number(profileRegular)||0)+(Number(profileEmi)||0), 'text-rose'],
              ['Discretionary', discretionary, discretionary >= 0 ? 'text-white' : 'text-rose'],
            ].map(([l, v, cls]) => (
              <div key={l}>
                <p className="text-muted mb-0.5">{l}</p>
                <p className={`font-mono font-semibold ${cls}`}>₹{(Number(v)||0).toLocaleString('en-IN')}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2 items-center">
          <button onClick={handleSaveDefaults} disabled={savingDefaults || !selectedProfile}
            className="btn-primary flex items-center gap-1.5 text-sm">
            <Save size={13} /> {savingDefaults ? 'Saving…' : 'Save defaults'}
          </button>
          <button onClick={handleApplyDefaults} disabled={applyingDefaults || !selectedProfile}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm border border-accent/40 text-accent hover:bg-accent/10 transition-colors disabled:opacity-50">
            <CalendarDays size={13} />
            {applyingDefaults ? 'Applying…' : `Apply to ${YEAR}`}
          </button>
        </div>
        {applyMsg && (
          <div className="mt-3 flex items-center gap-2 text-sm text-teal">
            <CheckCircle2 size={14} /> {applyMsg}
          </div>
        )}
      </div>

      {/* ── 3. Linked Google Sheet ── */}
      <div className="card max-w-2xl">
        <div className="flex items-center gap-2 mb-4">
          <SettingsIcon size={18} className="text-accent" />
          <h2 className="font-display font-bold text-white">Linked Google Sheet</h2>
        </div>
        <div className="space-y-4">
          <div>
            <label className="label">Transactions Sheet CSV URL</label>
            <input type="url" className="input w-full"
              placeholder="https://docs.google.com/… (published CSV link)"
              value={sheetUrlTransactions} onChange={e => setSheetUrlTransactions(e.target.value)} />
          </div>
          <div>
            <label className="label">Investment Sheet CSV URL</label>
            <input type="url" className="input w-full"
              placeholder="https://docs.google.com/… (published CSV link)"
              value={sheetUrlInvestments} onChange={e => setSheetUrlInvestments(e.target.value)} />
          </div>
          <div>
            <label className="label">Sheet CSV URL (legacy)</label>
            <input type="url" className="input w-full"
              placeholder="https://docs.google.com/… (published CSV link)"
              value={sheetUrl} onChange={e => setSheetUrl(e.target.value)} />
          </div>
        </div>
      </div>

      {/* ── 4. Preferences ── */}
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

      {/* ── 5. AI ── */}
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

      {/* ── 6. Theme ── */}
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

      {/* ── 7. Clear data ── */}
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
