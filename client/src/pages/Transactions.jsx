import { useEffect, useRef, useState } from 'react';
import api from '../lib/api';
import { fmt, fmtDate, TYPE_COLORS } from '../lib/utils';
import { Plus, Search, Trash2, Edit2, X, Save, Download, Upload } from 'lucide-react';

const TYPES = ['Income', 'Major', 'Non-Recurring', 'Trips'];
const ACCOUNTS = ['Harsh', 'Kirti'];

const EMPTY = { date: '', type: 'Major', account: 'Harsh', amount: 0, remark: '' };

function TransactionForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || EMPTY);
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
            {ACCOUNTS.map(a => <option key={a}>{a}</option>)}
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
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filters, setFilters] = useState({ account: '', type: '', search: '' });

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

  const exportTemplate = async () => {
    try {
      const r = await api.get('/transactions/export-template', { responseType: 'text' });
      const blob = new Blob([r.data], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'transactions_template.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      alert(e.response?.data?.error || 'Export failed');
    }
  };

  const fileInputRef = useRef(null);
  const [importResult, setImportResult] = useState(null);

  const handleImport = async (e) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const text = await file.text();
      const r = await api.post('/transactions/import', { csv: text });
      setImportResult(r.data);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Import failed');
    }
  };

  const filtered = data.filter(t =>
    !filters.search ||
    t.remark?.toLowerCase().includes(filters.search.toLowerCase()) ||
    String(t.amount).includes(filters.search)
  );

  const totalShown = filtered.reduce((s, t) => s + Number(t.amount), 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Transactions</h1>
          <p className="text-muted text-sm mt-0.5">All income, major, non-recurring & trip expenses</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportTemplate} className="btn-ghost flex items-center gap-2" title="Download CSV template with column headers">
            <Download size={14} /> Export CSV
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="btn-ghost flex items-center gap-2" title="Upload filled CSV to import rows">
            <Upload size={14} /> Import CSV
          </button>
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
          <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary flex items-center gap-2">
            <Plus size={14} /> Add Transaction
          </button>
        </div>
      </div>

      {importResult && (
        <div className="card border-accent/20 bg-accent/5 flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-white">
            Imported <strong>{importResult.added}</strong> of {importResult.totalRows} rows.
            {importResult.errors?.length > 0 && (
              <span className="text-rose ml-2">{importResult.errors.length} row(s) had errors.</span>
            )}
          </span>
          {importResult.errors?.length > 0 && (
            <ul className="text-xs text-rose list-disc list-inside">
              {importResult.errors.slice(0, 5).map((err, i) => (
                <li key={i}>Row {err.row}: {err.message}</li>
              ))}
              {importResult.errors.length > 5 && <li>… and {importResult.errors.length - 5} more</li>}
            </ul>
          )}
          <button onClick={() => setImportResult(null)} className="text-muted hover:text-white"><X size={16} /></button>
        </div>
      )}

      {(showForm || editing) && (
        <TransactionForm
          initial={editing}
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
          <option value="">All Accounts</option>
          {ACCOUNTS.map(a => <option key={a}>{a}</option>)}
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
                          row.type === 'Major'
                            ? 'tag-major'
                            : row.type === 'Non-Recurring'
                            ? 'tag-non-recurring'
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
