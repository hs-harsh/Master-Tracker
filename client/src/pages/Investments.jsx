import { useEffect, useState } from 'react';
import api from '../lib/api';
import { fmt, fmtDate } from '../lib/utils';
import { Plus, Search, Trash2, Edit2, X, Save, Download } from 'lucide-react';
import AiEntryPanel from '../components/AiEntryPanel';
import { useAuth } from '../hooks/useAuth';

const ASSET_CLASSES = ['Equity', 'Debt', 'Gold', 'Cash', 'Real Estate', 'Crypto'];
const SIDES = ['BUY', 'SELL'];

function InvestmentForm({ initial, defaultAccount, persons, onSave, onCancel }) {
  const EMPTY = {
    date: '',
    account: defaultAccount || '',
    goal: '',
    asset_class: 'Equity',
    instrument: '',
    side: 'BUY',
    amount: 0,
    avg_price: '',
    ticker: '',
    broker: '',
  };
  const [form, setForm] = useState(initial || { ...EMPTY });
  useEffect(() => {
    setForm(initial || { ...EMPTY, account: defaultAccount || '' });
  }, [initial?.id, defaultAccount]);

  const onChange = e => {
    const { name, value } = e.target;
    setForm(p => ({ ...p, [name]: value }));
  };

  const computedAvgPrice = form.qty && Number(form.qty) > 0 && Number(form.amount) > 0
    ? (Number(form.amount) / Number(form.qty)).toFixed(4)
    : null;

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
          <input type="date" name="date" value={form.date} onChange={onChange} className="input" />
        </div>
        <div>
          <label className="label">Account</label>
          <select name="account" value={form.account} onChange={onChange} className="input">
            {(persons || []).map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Goal</label>
          <input type="text" name="goal" value={form.goal} onChange={onChange} className="input" placeholder="e.g. Europe Trip, House, Retirement" />
        </div>
        <div>
          <label className="label">Asset Class</label>
          <select name="asset_class" value={form.asset_class} onChange={onChange} className="input">
            {ASSET_CLASSES.map(a => <option key={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Instrument</label>
          <input type="text" name="instrument" value={form.instrument} onChange={onChange} className="input" placeholder="Fund / stock / FD name" />
        </div>
        <div>
          <label className="label">Side</label>
          <select name="side" value={form.side} onChange={onChange} className="input">
            {SIDES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Amount (₹)</label>
          <input type="number" name="amount" value={form.amount} onChange={onChange} className="input" />
        </div>
        <div>
          <label className="label">
            Qty / Units
            <span className="text-muted font-normal ml-1 text-xs">(optional)</span>
          </label>
          <input
            type="number"
            name="qty"
            value={form.qty || ''}
            onChange={onChange}
            className="input"
            placeholder="No. of units / shares"
            step="0.0001"
          />
          {computedAvgPrice && (
            <p className="text-xs text-teal mt-1">Avg price ≈ ₹{Number(computedAvgPrice).toLocaleString('en-IN', { maximumFractionDigits: 4 })}</p>
          )}
        </div>
        <div>
          <label className="label">
            Yahoo Ticker
            <span className="text-muted font-normal ml-1 text-xs">(for live price)</span>
          </label>
          <input
            type="text"
            name="ticker"
            value={form.ticker}
            onChange={onChange}
            className="input"
            placeholder="e.g. RELIANCE.NS, GC=F, ^NSEI"
          />
          <p className="text-[10px] text-muted mt-1">NSE: add .NS · BSE: add .BO · Gold futures: GC=F · Leave blank — AI will try to find it</p>
        </div>
        <div className="col-span-2 md:col-span-3">
          <label className="label">Broker / Account</label>
          <input type="text" name="broker" value={form.broker} onChange={onChange} className="input" placeholder="e.g. Harsh Zerodha, Kirti Coin" />
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

export default function Investments() {
  const { personName, persons, activePerson, bumpDataVersion } = useAuth();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [inlineEdit, setInlineEdit] = useState(null); // { id, form: {...row} }
  const [filters, setFilters] = useState({ goal: '', asset_class: '', search: '' });
  const [selectedIds, setSelectedIds] = useState(new Set());

  const currentPerson = activePerson || personName;

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (currentPerson) params.append('account', currentPerson);
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
  }, [currentPerson, filters.goal, filters.asset_class]);

  const handleSave = async form => {
    try {
      if (form.id) {
        await api.put(`/investments/${form.id}`, form);
      } else {
        await api.post('/investments', form);
      }
      setShowForm(false);
      setInlineEdit(null);
      load();
      bumpDataVersion();
    } catch (err) {
      alert(err.response?.data?.error || 'Save failed');
    }
  };

  const handleDelete = async id => {
    if (!confirm('Delete this investment?')) return;
    await api.delete(`/investments/${id}`);
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    load();
    bumpDataVersion();
  };

  const handleDeleteSelected = async () => {
    if (!selectedIds.size) return;
    if (!confirm(`Delete ${selectedIds.size} selected investment(s)?`)) return;
    for (const id of selectedIds) await api.delete(`/investments/${id}`);
    setSelectedIds(new Set());
    load();
    bumpDataVersion();
  };

  const handleAiAdd = async (entries) => {
    for (const e of entries) {
      await api.post('/investments', {
        date:        e.date,
        account:     e.account,
        goal:        e.goal || '',
        asset_class: e.asset_class || 'Equity',
        instrument:  e.instrument || '',
        side:        e.side || 'BUY',
        amount:      Number(e.amount) || 0,
        qty:         e.qty != null && e.qty !== '' ? Number(e.qty) : null,
        avg_price:   e.avg_price != null && e.avg_price !== '' ? Number(e.avg_price) : null,
        ticker:      e.ticker || '',
        broker:      e.broker || '',
      });
    }
    load();
    bumpDataVersion();
  };

  const handleAiEdit = async (operations) => {
    for (const op of operations) {
      if (op.action === 'delete') {
        await api.delete(`/investments/${op.id}`);
      } else if (op.action === 'update' && op.changes) {
        await api.put(`/investments/${op.id}`, { ...op.original, ...op.changes });
      }
    }
    load();
    bumpDataVersion();
  };


  const filtered = data.filter(inv => {
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (!(
        inv.goal.toLowerCase().includes(q) ||
        inv.instrument.toLowerCase().includes(q) ||
        inv.broker?.toLowerCase().includes(q) ||
        String(inv.amount).includes(q)
      )) return false;
    }
    return true;
  });

  function downloadCSV() {
    const headers = ['Date', 'Account', 'Goal', 'Asset Class', 'Instrument', 'Side', 'Amount', 'Qty', 'Avg Price', 'Broker', 'Ticker'];
    const rows = filtered.map(r => [
      r.date?.slice(0, 10) || '',
      r.account,
      r.goal,
      r.asset_class,
      r.instrument,
      r.side,
      r.amount,
      r.qty ?? '',
      r.avg_price ?? '',
      r.broker || '',
      r.ticker || '',
    ]);
    const csv = [headers, ...rows]
      .map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `investments_${currentPerson || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const allFilteredSelected = filtered.length > 0 && filtered.every(r => selectedIds.has(r.id));
  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(prev => { const n = new Set(prev); filtered.forEach(r => n.delete(r.id)); return n; });
    } else {
      setSelectedIds(prev => { const n = new Set(prev); filtered.forEach(r => n.add(r.id)); return n; });
    }
  };

  const goals = Array.from(new Set(data.map(d => d.goal))).sort();
  const totalShown = filtered.reduce(
    (sum, inv) => sum + (inv.side === 'SELL' ? -Number(inv.amount) : Number(inv.amount)),
    0
  );
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">{currentPerson ? `${currentPerson}'s Investments` : 'Investments'}</h1>
          <p className="text-muted text-sm mt-0.5">Raw investment entries powering your goal-based portfolio</p>
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
          <button
            onClick={() => setShowForm(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={14} /> Add Investment
          </button>
        </div>
      </div>

      <AiEntryPanel type="investments" persons={persons.length ? persons : [personName]} onAdd={handleAiAdd} onEdit={handleAiEdit} />

      {showForm && (
        <InvestmentForm
          initial={null}
          defaultAccount={personName}
          persons={persons}
          onSave={handleSave}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="input pl-8"
            placeholder="Search goal, instrument, broker…"
            value={filters.search}
            onChange={e => setFilters(p => ({ ...p, search: e.target.value }))}
          />
        </div>
        <select className="input w-40" value={filters.goal} onChange={e => setFilters(p => ({ ...p, goal: e.target.value }))}>
          <option value="">All Goals</option>
          {goals.map(g => <option key={g}>{g}</option>)}
        </select>
        <select className="input w-40" value={filters.asset_class} onChange={e => setFilters(p => ({ ...p, asset_class: e.target.value }))}>
          <option value="">All Asset Classes</option>
          {ASSET_CLASSES.map(a => <option key={a}>{a}</option>)}
        </select>
        {(filters.goal || filters.asset_class || filters.search) && (
          <button onClick={() => setFilters({ goal: '', asset_class: '', search: '' })} className="text-muted hover:text-white text-xs flex items-center gap-1">
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
                <th className="py-3 px-4 w-10">
                  <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll}
                    className="rounded border-border bg-transparent accent-accent cursor-pointer" />
                </th>
                {['Date', 'Account', 'Goal', 'Asset Class', 'Instrument', 'Side', 'Amount', 'Qty', 'Avg Price', 'Broker', ''].map(h => (
                  <th key={h} className="text-left py-3 px-4 text-muted font-display text-xs uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} className="py-8 text-center text-muted font-mono text-sm animate-pulse">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={12} className="py-8 text-center text-muted">No investments yet</td></tr>
              ) : (
                filtered.map(row => {
                  const isEditing = inlineEdit?.id === row.id;
                  const ef = inlineEdit?.form || {};

                  if (isEditing) {
                    const computedAvgP = ef.qty && Number(ef.qty) > 0 && Number(ef.amount) > 0
                      ? (Number(ef.amount) / Number(ef.qty)).toFixed(2)
                      : null;
                    const setEf = patch => setInlineEdit(prev => ({ ...prev, form: { ...prev.form, ...patch } }));
                    const ic = 'input text-xs py-0.5 px-1.5 h-7 w-full';
                    return (
                      <tr key={row.id} className="border-b border-border/40 bg-surface/60">
                        <td className="py-1.5 px-4">
                          <input type="checkbox" checked={selectedIds.has(row.id)}
                            onChange={() => setSelectedIds(prev => { const n = new Set(prev); n.has(row.id) ? n.delete(row.id) : n.add(row.id); return n; })}
                            className="rounded border-border bg-transparent accent-accent cursor-pointer" />
                        </td>
                        <td className="py-1.5 px-2 min-w-[110px]"><input type="date" value={ef.date || ''} onChange={e => setEf({ date: e.target.value })} className={ic} /></td>
                        <td className="py-1.5 px-2 min-w-[90px]">
                          <select value={ef.account || ''} onChange={e => setEf({ account: e.target.value })} className={ic}>
                            {(persons.length ? persons : [personName]).map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </td>
                        <td className="py-1.5 px-2 min-w-[100px]"><input type="text" value={ef.goal || ''} onChange={e => setEf({ goal: e.target.value })} placeholder="Goal" className={ic} /></td>
                        <td className="py-1.5 px-2 min-w-[90px]">
                          <select value={ef.asset_class || ''} onChange={e => setEf({ asset_class: e.target.value })} className={ic}>
                            {ASSET_CLASSES.map(a => <option key={a}>{a}</option>)}
                          </select>
                        </td>
                        <td className="py-1.5 px-2 min-w-[130px]"><input type="text" value={ef.instrument || ''} onChange={e => setEf({ instrument: e.target.value })} placeholder="Instrument" className={ic} /></td>
                        <td className="py-1.5 px-2 min-w-[70px]">
                          <select value={ef.side || 'BUY'} onChange={e => setEf({ side: e.target.value })} className={ic}>
                            {SIDES.map(s => <option key={s}>{s}</option>)}
                          </select>
                        </td>
                        <td className="py-1.5 px-2 min-w-[90px]"><input type="number" value={ef.amount ?? ''} onChange={e => setEf({ amount: e.target.value })} className={`${ic} font-mono`} /></td>
                        <td className="py-1.5 px-2 min-w-[90px]">
                          <div className="flex flex-col gap-0.5">
                            <input type="number" value={ef.qty ?? ''} onChange={e => setEf({ qty: e.target.value })} placeholder="Qty" className={`${ic} font-mono`} step="0.0001" />
                            {computedAvgP && <span className="text-[10px] text-teal font-mono">₹{Number(computedAvgP).toLocaleString('en-IN', { maximumFractionDigits: 2 })}/u</span>}
                          </div>
                        </td>
                        <td className="py-1.5 px-2 text-xs text-muted font-mono whitespace-nowrap">{computedAvgP ? `₹${Number(computedAvgP).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}</td>
                        <td className="py-1.5 px-2 min-w-[90px]"><input type="text" value={ef.broker || ''} onChange={e => setEf({ broker: e.target.value })} placeholder="Broker" className={ic} /></td>
                        <td className="py-1.5 px-2">
                          <div className="flex gap-1.5">
                            <button onClick={() => handleSave(ef)} className="text-teal hover:text-teal/80 transition-colors" title="Save">
                              <Save size={14} />
                            </button>
                            <button onClick={() => setInlineEdit(null)} className="text-muted hover:text-rose transition-colors" title="Cancel">
                              <X size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={row.id} className={`border-b border-border/40 hover:bg-surface/50 transition-colors ${selectedIds.has(row.id) ? 'bg-accent/5' : ''}`}>
                      <td className="py-3 px-4">
                        <input type="checkbox" checked={selectedIds.has(row.id)}
                          onChange={() => setSelectedIds(prev => { const n = new Set(prev); n.has(row.id) ? n.delete(row.id) : n.add(row.id); return n; })}
                          className="rounded border-border bg-transparent accent-accent cursor-pointer" />
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-soft">{fmtDate(row.date)}</td>
                      <td className="py-3 px-4 text-xs"><span className="tag">{row.account}</span></td>
                      <td className="py-3 px-4 text-soft text-xs">{row.goal}</td>
                      <td className="py-3 px-4 text-xs"><span className="tag bg-card/60">{row.asset_class}</span></td>
                      <td className="py-3 px-4 text-soft text-xs max-w-[160px]">
                        <div className="truncate">{row.instrument}</div>
                        {row.ticker && <div className="text-muted text-[10px]">{row.ticker}</div>}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`tag text-xs ${row.side === 'BUY' ? 'bg-teal/10 text-teal' : 'bg-rose/10 text-rose'}`}>
                          {row.side}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-soft">
                        {row.side === 'SELL' ? '-' : ''}{fmt(row.amount)}
                      </td>
                      <td className="py-3 px-4 font-mono text-soft text-xs">
                        {row.qty ? Number(row.qty).toLocaleString('en-IN', { maximumFractionDigits: 3 }) : '—'}
                      </td>
                      <td className="py-3 px-4 font-mono text-soft text-xs">
                        {row.avg_price ? `₹${Number(row.avg_price).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td className="py-3 px-4 text-soft text-xs">{row.broker || '—'}</td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          <button onClick={() => setInlineEdit({ id: row.id, form: { ...row, date: row.date?.slice(0, 10) || '' } })} className="text-muted hover:text-accent transition-colors">
                            <Edit2 size={14} />
                          </button>
                          <button onClick={() => handleDelete(row.id)} className="text-muted hover:text-rose transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
