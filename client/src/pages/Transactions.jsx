import { useEffect, useState } from 'react';
import api from '../lib/api';
import { fmt, fmtDate, TYPE_COLORS } from '../lib/utils';
import { Plus, Search, Trash2, Edit2, X, Save, RefreshCw, ExternalLink } from 'lucide-react';
import SyncResultModal, { downloadBackupCsv } from '../components/SyncResultModal';
import { useAuth } from '../hooks/useAuth';

const TYPES = ['Income', 'Other Income', 'Major', 'Non-Recurring', 'Regular', 'EMI', 'Trips'];

function TransactionForm({ initial, defaultAccount, persons, onSave, onCancel }) {
  const EMPTY = { date: '', type: 'Major', account: defaultAccount || '', amount: 0, remark: '' };
  const [form, setForm] = useState(initial || { ...EMPTY });
  useEffect(() => {
    setForm(initial || { ...EMPTY, account: defaultAccount || '' });
  }, [initial?.id, defaultAccount]);
  const onChange = e => {
    const { name, value } = e.target;
    setForm(p => ({ ...p, [name]: name === 'amount' ? Number(value) : value }));
  };
  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-bold text-white">{initial?.id ? 'Edit Transaction' : 'New Transaction'}</h3>
        <button onClick={onCancel} className="text-muted hover:text-white"><X size={18} /></button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <label className="label">Date</label>
          <input type="date" name="date" value={form.date} onChange={onChange} className="input" />
        </div>
        <div>
          <label className="label">Type</label>
          <select name="type" value={form.type} onChange={onChange} className="input">
            {TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Account</label>
          <select name="account" value={form.account} onChange={onChange} className="input">
            {(persons || []).map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Amount (₹)</label>
          <input type="number" name="amount" value={form.amount} onChange={onChange} className="input" />
        </div>
        <div className="col-span-2">
          <label className="label">Remark</label>
          <input type="text" name="remark" value={form.remark || ''} onChange={onChange} className="input" placeholder="What was this for?" />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={() => onSave(form)} className="btn-primary flex items-center gap-2">
          <Save size={14} /> Save
        </button>
        <button onClick={onCancel} className="btn-ghost">Cancel</button>
      </div>
    </div>
  );
}

export default function Transactions() {
  const { personName, persons } = useAuth();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filters, setFilters] = useState({ account: '', type: '', search: '' });
  const [syncResult, setSyncResult] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [sheetUrl, setSheetUrl] = useState('');
  const [sheetUrlTx, setSheetUrlTx] = useState('');

  useEffect(() => {
    api.get('/settings').then(r => {
      if (r.data?.sheetUrl) setSheetUrl(r.data.sheetUrl);
      if (r.data?.sheetUrlTransactions) setSheetUrlTx(r.data.sheetUrlTransactions);
    }).catch(() => {});
  }, []);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.account) params.append('account', filters.account);
    if (filters.type) params.append('type', filters.type);
    api.get(`/transactions?${params}`).then(r => setData(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filters.account, filters.type]);

  const handleSave = async (form) => {
    try {
      if (form.id) await api.put(`/transactions/${form.id}`, form);
      else await api.post('/transactions', form);
      setShowForm(false);
      setEditing(null);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Save failed');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this transaction?')) return;
    await api.delete(`/transactions/${id}`);
    load();
  };

  const handleOpenSheet = () => {
    const url = sheetUrlTx || sheetUrl;
    if (!url) {
      alert('No sheet URL configured.\n\nGo to Settings → Linked Google Sheet and add your Transactions Sheet CSV URL first.');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleSync = async () => {
    const url = sheetUrlTx || sheetUrl;
    if (!url) {
      alert('No sheet URL configured.\n\nGo to Settings → Linked Google Sheet and add your Transactions Sheet CSV URL first.');
      return;
    }
    setSyncing(true);
    setSyncResult(null);
    try {
      await downloadBackupCsv('transactions');
      const r = await api.post('/settings/sync-from-sheet', { type: 'transactions' });
      setSyncResult(r.data);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Sync failed. Check your sheet URL in Settings.');
    } finally {
      setSyncing(false);
    }
  };

  const filtered = data.filter(t =>
    !filters.search ||
    t.remark?.toLowerCase().includes(filters.search.toLowerCase()) ||
    String(t.amount).includes(filters.search)
  );

  const totalShown = filtered.reduce((s, t) => s + Number(t.amount), 0);

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Transactions</h1>
          <p className="text-muted text-sm mt-0.5">All income, major, non-recurring & trip expenses</p>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <button onClick={handleOpenSheet}
            className="text-accent hover:text-accent/80 flex items-center gap-2 text-sm font-medium border-b border-accent/40 pb-0.5">
            <ExternalLink size={14} /> Open sheet
          </button>
          <div className="flex gap-2 border-l border-border pl-4">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="btn-ghost flex items-center gap-2"
            title="Pull new rows from linked Google Sheet"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing…' : 'Sync with sheet'}
          </button>
          <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary flex items-center gap-2">
            <Plus size={14} /> Add Transaction
          </button>
          </div>
        </div>
      </div>

      {syncResult && <SyncResultModal result={syncResult} syncType="transactions" onClose={() => setSyncResult(null)} />}

      {(showForm || editing) && (
        <TransactionForm
          initial={editing}
          defaultAccount={personName}
          persons={persons}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="input pl-8"
            placeholder="Search remarks, amounts…"
            value={filters.search}
            onChange={e => setFilters(p => ({...p, search: e.target.value}))}
          />
        </div>
        <select className="input w-32" value={filters.account} onChange={e => setFilters(p => ({...p, account: e.target.value}))}>
          <option value="">All</option>
          {persons.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className="input w-36" value={filters.type} onChange={e => setFilters(p => ({...p, type: e.target.value}))}>
          <option value="">All Types</option>
          {TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
        {(filters.account || filters.type || filters.search) && (
          <button onClick={() => setFilters({ account: '', type: '', search: '' })} className="text-muted hover:text-white text-xs flex items-center gap-1">
            <X size={12} /> Clear
          </button>
        )}
        <div className="ml-auto text-right">
          <p className="text-muted text-xs">{filtered.length} transactions</p>
          <p className="font-mono text-rose text-sm">{fmt(totalShown)} total</p>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Date', 'Type', 'Account', 'Amount', 'Remark', ''].map(h => (
                  <th key={h} className="text-left py-3 px-4 text-muted font-display text-xs uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-8 text-center text-muted font-mono text-sm animate-pulse">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-muted">No transactions found</td></tr>
              ) : (
                filtered.map(row => (
                  <tr key={row.id} className="border-b border-border/40 hover:bg-surface/50 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs text-soft">{fmtDate(row.date)}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`tag ${
                          row.type === 'Income'
                            ? 'tag-income'
                            : row.type === 'Other Income'
                            ? 'tag-other-income'
                            : row.type === 'Major'
                            ? 'tag-major'
                            : row.type === 'Non-Recurring'
                            ? 'tag-non-recurring'
                            : row.type === 'Regular'
                            ? 'tag-regular'
                            : row.type === 'EMI'
                            ? 'tag-emi'
                            : row.type === 'Trips'
                            ? 'tag-trips'
                            : 'tag-income'
                        }`}
                      >
                        {row.type}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`tag tag-${row.account.toLowerCase()}`}>{row.account}</span>
                    </td>
                    <td className="py-3 px-4 font-mono text-rose">{fmt(row.amount)}</td>
                    <td className="py-3 px-4 text-soft max-w-xs truncate">{row.remark || '—'}</td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2">
                        <button onClick={() => { setEditing(row); setShowForm(false); }} className="text-muted hover:text-accent transition-colors"><Edit2 size={14} /></button>
                        <button onClick={() => handleDelete(row.id)} className="text-muted hover:text-rose transition-colors"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
