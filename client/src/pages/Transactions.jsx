import { useEffect, useState } from 'react';
import api from '../lib/api';
import { fmt, fmtDate, TYPE_COLORS } from '../lib/utils';
import { Plus, Search, Trash2, Edit2, X, Save, Download, ArrowUp, ArrowDown } from 'lucide-react';
import AiEntryPanel, { AiEditPanel } from '../components/AiEntryPanel';
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
  const { personName, persons, activePerson, bumpDataVersion } = useAuth();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filters, setFilters] = useState({ type: '', search: '' });
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [sortConfig, setSortConfig] = useState({ key: null, dir: 'asc' });

  const handleSort = key => setSortConfig(prev => ({ key, dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc' }));

  const currentPerson = activePerson || personName;

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (currentPerson) params.append('account', currentPerson);
    if (filters.type) params.append('type', filters.type);
    api.get(`/transactions?${params}`).then(r => setData(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [currentPerson, filters.type]);

  const handleSave = async (form) => {
    try {
      if (form.id) await api.put(`/transactions/${form.id}`, form);
      else await api.post('/transactions', form);
      setShowForm(false);
      setEditing(null);
      load();
      bumpDataVersion();
    } catch (err) {
      alert(err.response?.data?.error || 'Save failed');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this transaction?')) return;
    await api.delete(`/transactions/${id}`);
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    load();
    bumpDataVersion();
  };

  const handleDeleteSelected = async () => {
    if (!selectedIds.size) return;
    if (!confirm(`Delete ${selectedIds.size} selected transaction(s)?`)) return;
    for (const id of selectedIds) await api.delete(`/transactions/${id}`);
    setSelectedIds(new Set());
    load();
    bumpDataVersion();
  };

  const handleAiAdd = async (entries) => {
    for (const e of entries) {
      await api.post('/transactions', {
        date:    e.date,
        type:    e.type,
        account: e.account,
        amount:  Number(e.amount) || 0,
        remark:  e.remark || '',
      });
    }
    load();
    bumpDataVersion();
  };

  const handleAiEdit = async (operations) => {
    for (const op of operations) {
      if (op.action === 'delete') {
        await api.delete(`/transactions/${op.id}`);
      } else if (op.action === 'update' && op.changes) {
        await api.put(`/transactions/${op.id}`, { ...op.original, ...op.changes });
      }
    }
    load();
    bumpDataVersion();
  };

  const handleAiDelete = async (operations) => {
    for (const op of operations) {
      await api.delete(`/transactions/${op.id}`);
    }
    load();
    bumpDataVersion();
  };

  const filtered = data.filter(t =>
    !filters.search ||
    t.remark?.toLowerCase().includes(filters.search.toLowerCase()) ||
    String(t.amount).includes(filters.search)
  );

  const allFilteredSelected = filtered.length > 0 && filtered.every(t => selectedIds.has(t.id));
  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(prev => { const n = new Set(prev); filtered.forEach(t => n.delete(t.id)); return n; });
    } else {
      setSelectedIds(prev => { const n = new Set(prev); filtered.forEach(t => n.add(t.id)); return n; });
    }
  };

  const totalShown = filtered.reduce((s, t) => s + Number(t.amount), 0);

  const sorted = sortConfig.key
    ? [...filtered].sort((a, b) => {
        let av = a[sortConfig.key], bv = b[sortConfig.key];
        if (sortConfig.key === 'amount') { av = Number(av); bv = Number(bv); }
        else { av = String(av ?? '').toLowerCase(); bv = String(bv ?? '').toLowerCase(); }
        return (av < bv ? -1 : av > bv ? 1 : 0) * (sortConfig.dir === 'asc' ? 1 : -1);
      })
    : filtered;

  function downloadCSV() {
    const headers = ['Date', 'Type', 'Account', 'Amount', 'Remark'];
    const rows = filtered.map(t => [
      t.date?.slice(0, 10) || '',
      t.type,
      t.account,
      t.amount,
      t.remark || '',
    ]);
    const csv = [headers, ...rows]
      .map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions_${currentPerson || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">{currentPerson ? `${currentPerson}'s Transactions` : 'Transactions'}</h1>
          <p className="text-muted text-sm mt-0.5">All income, major, non-recurring & trip expenses</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {selectedIds.size > 0 && (
            <button onClick={handleDeleteSelected} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-rose/10 text-rose border border-rose/20 hover:bg-rose/20 transition-colors">
              <Trash2 size={14} /> Delete {selectedIds.size} selected
            </button>
          )}
          <button onClick={downloadCSV} className="btn-ghost flex items-center gap-2 text-sm">
            <Download size={14} /> Export CSV
          </button>
          <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary flex items-center gap-2">
            <Plus size={14} /> Add Transaction
          </button>
        </div>
      </div>

      <AiEntryPanel type="transactions" persons={persons.length ? persons : [personName]} onAdd={handleAiAdd} />
      <AiEditPanel type="transactions" persons={persons.length ? persons : [personName]} onEdit={handleAiEdit} />

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
        <select className="input w-36" value={filters.type} onChange={e => setFilters(p => ({...p, type: e.target.value}))}>
          <option value="">All Types</option>
          {TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
        {(filters.type || filters.search) && (
          <button onClick={() => setFilters({ type: '', search: '' })} className="text-muted hover:text-white text-xs flex items-center gap-1">
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
                <th className="py-3 px-4 w-10">
                  <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll}
                    className="rounded border-border bg-transparent accent-accent cursor-pointer" />
                </th>
                {(() => {
                  const SortIcon = ({ k }) => sortConfig.key === k
                    ? (sortConfig.dir === 'asc' ? <ArrowUp size={10} className="inline ml-0.5" /> : <ArrowDown size={10} className="inline ml-0.5" />)
                    : null;
                  return (<>
                    <th onClick={() => handleSort('date')} className="text-left py-3 px-4 text-muted font-display text-xs uppercase tracking-wider cursor-pointer hover:text-white select-none whitespace-nowrap">Date<SortIcon k="date" /></th>
                    <th onClick={() => handleSort('type')} className="text-left py-3 px-4 text-muted font-display text-xs uppercase tracking-wider cursor-pointer hover:text-white select-none whitespace-nowrap">Type<SortIcon k="type" /></th>
                    <th onClick={() => handleSort('account')} className="text-left py-3 px-4 text-muted font-display text-xs uppercase tracking-wider cursor-pointer hover:text-white select-none whitespace-nowrap">Account<SortIcon k="account" /></th>
                    <th onClick={() => handleSort('amount')} className="text-left py-3 px-4 text-muted font-display text-xs uppercase tracking-wider cursor-pointer hover:text-white select-none whitespace-nowrap">Amount<SortIcon k="amount" /></th>
                    <th className="text-left py-3 px-4 text-muted font-display text-xs uppercase tracking-wider">Remark</th>
                    <th className="text-left py-3 px-4 text-muted font-display text-xs uppercase tracking-wider"></th>
                  </>);
                })()}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="py-8 text-center text-muted font-mono text-sm animate-pulse">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-muted">No transactions found</td></tr>
              ) : (
                sorted.map(row => (
                  <tr key={row.id} className={`border-b border-border/40 hover:bg-surface/50 transition-colors ${selectedIds.has(row.id) ? 'bg-accent/5' : ''}`}>
                    <td className="py-3 px-4">
                      <input type="checkbox" checked={selectedIds.has(row.id)}
                        onChange={() => setSelectedIds(prev => { const n = new Set(prev); n.has(row.id) ? n.delete(row.id) : n.add(row.id); return n; })}
                        className="rounded border-border bg-transparent accent-accent cursor-pointer" />
                    </td>
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
