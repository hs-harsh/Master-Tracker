import { useEffect, useRef, useState } from 'react';
import api from '../lib/api';
import { fmt, fmtDate } from '../lib/utils';
import { Plus, Search, Trash2, Edit2, X, Save, Download, Upload } from 'lucide-react';

const ASSET_CLASSES = ['Equity', 'Debt', 'Gold', 'Cash', 'Real Estate', 'Crypto'];
const SIDES = ['BUY', 'SELL'];
const ACCOUNTS = ['Harsh', 'Kirti'];

const EMPTY = {
  date: '',
  account: 'Harsh',
  goal: '',
  asset_class: 'Equity',
  instrument: '',
  side: 'BUY',
  amount: 0,
  broker: '',
};

function InvestmentForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || EMPTY);

  const onChange = e => {
    const { name, value } = e.target;
    setForm(p => ({
      ...p,
      [name]: name === 'amount' ? Number(value) : value,
    }));
  };

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-bold text-white">
          {initial?.id ? 'Edit Investment' : 'New Investment'}
        </h3>
        <button onClick={onCancel} className="text-muted hover:text-white">
          <X size={18} />
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <label className="label">Date</label>
          <input
            type="date"
            name="date"
            value={form.date}
            onChange={onChange}
            className="input"
          />
        </div>
        <div>
          <label className="label">Account</label>
          <select
            name="account"
            value={form.account}
            onChange={onChange}
            className="input"
          >
            {ACCOUNTS.map(a => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Goal</label>
          <input
            type="text"
            name="goal"
            value={form.goal}
            onChange={onChange}
            className="input"
            placeholder="e.g. Europe Trip, House, Retirement"
          />
        </div>
        <div>
          <label className="label">Asset Class</label>
          <select
            name="asset_class"
            value={form.asset_class}
            onChange={onChange}
            className="input"
          >
            {ASSET_CLASSES.map(a => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Instrument</label>
          <input
            type="text"
            name="instrument"
            value={form.instrument}
            onChange={onChange}
            className="input"
            placeholder="Fund / stock / FD name"
          />
        </div>
        <div>
          <label className="label">Side</label>
          <select
            name="side"
            value={form.side}
            onChange={onChange}
            className="input"
          >
            {SIDES.map(s => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Amount (₹)</label>
          <input
            type="number"
            name="amount"
            value={form.amount}
            onChange={onChange}
            className="input"
          />
        </div>
        <div className="col-span-2">
          <label className="label">Broker / Account</label>
          <input
            type="text"
            name="broker"
            value={form.broker}
            onChange={onChange}
            className="input"
            placeholder="e.g. Harsh Zerodha, Kirti Coin"
          />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={() => onSave(form)} className="btn-primary flex items-center gap-2">
          <Save size={14} /> Save
        </button>
        <button onClick={onCancel} className="btn-ghost">
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function Investments() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [person, setPerson] = useState('Harsh');
  const [filters, setFilters] = useState({ goal: '', asset_class: '', search: '' });

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.append('account', person);
    if (filters.goal) params.append('goal', filters.goal);
    if (filters.asset_class) params.append('asset_class', filters.asset_class);
    api
      .get(`/investments?${params.toString()}`)
      .then(r => setData(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person, filters.goal, filters.asset_class]);

  const handleSave = async form => {
    try {
      if (form.id) {
        await api.put(`/investments/${form.id}`, form);
      } else {
        await api.post('/investments', form);
      }
      setShowForm(false);
      setEditing(null);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Save failed');
    }
  };

  const handleDelete = async id => {
    if (!confirm('Delete this investment?')) return;
    await api.delete(`/investments/${id}`);
    load();
  };

  const exportTemplate = async () => {
    try {
      const r = await api.get('/investments/export-template', { responseType: 'text' });
      const blob = new Blob([r.data], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'investments_template.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      alert(e.response?.data?.error || 'Export failed');
    }
  };

  const fileInputRef = useRef(null);
  const [importResult, setImportResult] = useState(null);

  const handleImport = async e => {
    const file = e.target?.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const text = await file.text();
      const res = await api.post('/investments/import', { csv: text });
      setImportResult(res.data);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Import failed');
    }
  };

  const filtered = data.filter(inv => {
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (
        !(
          inv.goal.toLowerCase().includes(q) ||
          inv.instrument.toLowerCase().includes(q) ||
          inv.broker?.toLowerCase().includes(q) ||
          String(inv.amount).includes(q)
        )
      ) {
        return false;
      }
    }
    return true;
  });

  const goals = Array.from(new Set(data.map(d => d.goal))).sort();
  const totalShown = filtered.reduce(
    (sum, inv) => sum + (inv.side === 'SELL' ? -Number(inv.amount) : Number(inv.amount)),
    0
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Investments</h1>
          <p className="text-muted text-sm mt-0.5">
            Raw investment entries powering your goal-based portfolio
          </p>
        </div>
        <div className="flex gap-2">
          {ACCOUNTS.map(p => (
            <button
              key={p}
              onClick={() => setPerson(p)}
              className={`px-4 py-2 rounded-lg text-sm font-mono transition-colors ${person === p ? 'bg-accent text-ink font-bold' : 'btn-ghost'}`}
            >
              {p}
            </button>
          ))}
          <button onClick={exportTemplate} className="btn-ghost flex items-center gap-2" title="Download CSV template with column headers">
            <Download size={14} /> Export CSV
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="btn-ghost flex items-center gap-2" title="Upload filled CSV to import rows">
            <Upload size={14} /> Import CSV
          </button>
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
          <button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={14} /> Add Investment
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
        <InvestmentForm
          initial={editing}
          onSave={handleSave}
          onCancel={() => {
            setShowForm(false);
            setEditing(null);
          }}
        />
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            className="input pl-8"
            placeholder="Search goal, instrument, broker…"
            value={filters.search}
            onChange={e => setFilters(p => ({ ...p, search: e.target.value }))}
          />
        </div>
        <select
          className="input w-40"
          value={filters.goal}
          onChange={e => setFilters(p => ({ ...p, goal: e.target.value }))}
        >
          <option value="">All Goals</option>
          {goals.map(g => (
            <option key={g}>{g}</option>
          ))}
        </select>
        <select
          className="input w-40"
          value={filters.asset_class}
          onChange={e => setFilters(p => ({ ...p, asset_class: e.target.value }))}
        >
          <option value="">All Asset Classes</option>
          {ASSET_CLASSES.map(a => (
            <option key={a}>{a}</option>
          ))}
        </select>
        {(filters.goal || filters.asset_class || filters.search) && (
          <button
            onClick={() => setFilters({ goal: '', asset_class: '', search: '' })}
            className="text-muted hover:text-white text-xs flex items-center gap-1"
          >
            <X size={12} /> Clear
          </button>
        )}
        <div className="ml-auto text-right">
          <p className="text-muted text-xs">{filtered.length} investments</p>
          <p className="font-mono text-teal text-sm">{fmt(totalShown)} net</p>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {[
                  'Date',
                  'Account',
                  'Goal',
                  'Asset Class',
                  'Instrument',
                  'Side',
                  'Amount',
                  'Broker',
                  '',
                ].map(h => (
                  <th
                    key={h}
                    className="text-left py-3 px-4 text-muted font-display text-xs uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={9}
                    className="py-8 text-center text-muted font-mono text-sm animate-pulse"
                  >
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-muted">
                    No investments yet
                  </td>
                </tr>
              ) : (
                filtered.map(row => (
                  <tr
                    key={row.id}
                    className="border-b border-border/40 hover:bg-surface/50 transition-colors"
                  >
                    <td className="py-3 px-4 font-mono text-xs text-soft">
                      {fmtDate(row.date)}
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <span className={`tag tag-${(row.account || 'Harsh').toLowerCase()}`}>
                        {row.account || 'Harsh'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-soft text-xs">{row.goal}</td>
                    <td className="py-3 px-4 text-xs">
                      <span className="tag bg-card/60">{row.asset_class}</span>
                    </td>
                    <td className="py-3 px-4 text-soft text-xs max-w-xs truncate">
                      {row.instrument}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`tag text-xs ${
                          row.side === 'BUY'
                            ? 'bg-teal/10 text-teal'
                            : 'bg-rose/10 text-rose'
                        }`}
                      >
                        {row.side}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-soft">
                      {row.side === 'SELL' ? '-' : ''}
                      {fmt(row.amount)}
                    </td>
                    <td className="py-3 px-4 text-soft text-xs">
                      {row.broker || '—'}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditing(row);
                            setShowForm(false);
                          }}
                          className="text-muted hover:text-accent transition-colors"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(row.id)}
                          className="text-muted hover:text-rose transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
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

