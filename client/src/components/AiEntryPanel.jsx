import { useState } from 'react';
import { Sparkles, Loader2, Check, X, Trash2, Edit2, ChevronDown, ChevronUp } from 'lucide-react';
import api from '../lib/api';


const TX_TYPES    = ['Income', 'Other Income', 'Major', 'Non-Recurring', 'Regular', 'EMI', 'Trips'];
const INV_CLASSES = ['Equity', 'Debt', 'Gold', 'Cash', 'Real Estate', 'Crypto'];
const INV_SIDES   = ['BUY', 'SELL'];

// ── Inline editable cell ──────────────────────────────────────────────────────
function EditCell({ value, onChange, type = 'text', options }) {
  if (options) {
    return (
      <select
        className="bg-surface border border-border rounded px-2 py-1 text-xs text-white w-full"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  return (
    <input
      type={type}
      className="bg-surface border border-border rounded px-2 py-1 text-xs text-white w-full min-w-[80px]"
      value={value}
      onChange={e => onChange(type === 'number' ? Number(e.target.value) : e.target.value)}
    />
  );
}

// ── Transaction confirmation table (add mode) ─────────────────────────────────
function TxConfirmTable({ entries, setEntries, persons }) {
  const update = (i, field, val) =>
    setEntries(prev => prev.map((e, idx) => idx === i ? { ...e, [field]: val } : e));
  const remove = i => setEntries(prev => prev.filter((_, idx) => idx !== i));
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-surface/60">
            {['Date', 'Type', 'Account', 'Amount (₹)', 'Remark', ''].map(h => (
              <th key={h} className="text-left py-2.5 px-3 text-muted font-display uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={i} className="border-b border-border/50 hover:bg-surface/40">
              <td className="py-2 px-3"><EditCell value={e.date} onChange={v => update(i, 'date', v)} type="date" /></td>
              <td className="py-2 px-3"><EditCell value={e.type} onChange={v => update(i, 'type', v)} options={TX_TYPES} /></td>
              <td className="py-2 px-3"><EditCell value={e.account} onChange={v => update(i, 'account', v)} options={persons} /></td>
              <td className="py-2 px-3"><EditCell value={e.amount} onChange={v => update(i, 'amount', v)} type="number" /></td>
              <td className="py-2 px-3"><EditCell value={e.remark || ''} onChange={v => update(i, 'remark', v)} /></td>
              <td className="py-2 px-3">
                <button onClick={() => remove(i)} className="p-1 rounded hover:bg-rose/10 text-muted hover:text-rose transition-colors">
                  <Trash2 size={12} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Investment confirmation table (add mode) ──────────────────────────────────
function InvConfirmTable({ entries, setEntries, persons }) {
  const update = (i, field, val) =>
    setEntries(prev => prev.map((e, idx) => idx === i ? { ...e, [field]: val } : e));
  const remove = i => setEntries(prev => prev.filter((_, idx) => idx !== i));
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-surface/60">
            {['Date', 'Account', 'Instrument', 'Class', 'Side', 'Amount', 'Goal', 'Broker', ''].map(h => (
              <th key={h} className="text-left py-2.5 px-3 text-muted font-display uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={i} className="border-b border-border/50 hover:bg-surface/40">
              <td className="py-2 px-3"><EditCell value={e.date} onChange={v => update(i, 'date', v)} type="date" /></td>
              <td className="py-2 px-3"><EditCell value={e.account} onChange={v => update(i, 'account', v)} options={persons} /></td>
              <td className="py-2 px-3"><EditCell value={e.instrument || ''} onChange={v => update(i, 'instrument', v)} /></td>
              <td className="py-2 px-3"><EditCell value={e.asset_class} onChange={v => update(i, 'asset_class', v)} options={INV_CLASSES} /></td>
              <td className="py-2 px-3"><EditCell value={e.side} onChange={v => update(i, 'side', v)} options={INV_SIDES} /></td>
              <td className="py-2 px-3"><EditCell value={e.amount} onChange={v => update(i, 'amount', v)} type="number" /></td>
              <td className="py-2 px-3"><EditCell value={e.goal || ''} onChange={v => update(i, 'goal', v)} /></td>
              <td className="py-2 px-3"><EditCell value={e.broker || ''} onChange={v => update(i, 'broker', v)} /></td>
              <td className="py-2 px-3">
                <button onClick={() => remove(i)} className="p-1 rounded hover:bg-rose/10 text-muted hover:text-rose transition-colors">
                  <Trash2 size={12} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Cashflow confirmation table (add mode) ────────────────────────────────────
function CfConfirmTable({ entries, setEntries, persons }) {
  const update = (i, field, val) =>
    setEntries(prev => prev.map((e, idx) => idx === i ? { ...e, [field]: val } : e));
  const remove = i => setEntries(prev => prev.filter((_, idx) => idx !== i));
  const COLS = [
    ['month','Month','date'],['person','Person','text'],
    ['income','Income','number'],['other_income','Other Inc','number'],
    ['major_expense','Major','number'],['non_recurring_expense','Non-Rec','number'],
    ['regular_expense','Regular','number'],['emi','EMI','number'],
    ['trips_expense','Trips','number'],['ideal_saving','Ideal Save','number'],
  ];
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-surface/60">
            {COLS.map(([,h]) => (
              <th key={h} className="text-left py-2.5 px-2 text-muted font-display uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={i} className="border-b border-border/50 hover:bg-surface/40">
              {COLS.map(([field, , colType]) => (
                <td key={field} className="py-1.5 px-2">
                  {field === 'person'
                    ? <EditCell value={e[field] || ''} onChange={v => update(i, field, v)} options={persons} />
                    : <EditCell value={e[field] ?? 0} onChange={v => update(i, field, v)} type={colType} />
                  }
                </td>
              ))}
              <td className="py-1.5 px-2">
                <button onClick={() => remove(i)} className="p-1 rounded hover:bg-rose/10 text-muted hover:text-rose">
                  <Trash2 size={12} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Operations review table (edit/delete mode) ────────────────────────────────
function OperationsTable({ operations, setOperations, type }) {
  const remove = i => setOperations(prev => prev.filter((_, idx) => idx !== i));
  const updateChange = (i, field, val) =>
    setOperations(prev => prev.map((op, idx) =>
      idx === i ? { ...op, changes: { ...op.changes, [field]: val } } : op
    ));

  const txFields  = ['date', 'type', 'account', 'amount', 'remark'];
  const invFields = ['date', 'account', 'goal', 'asset_class', 'instrument', 'side', 'amount', 'broker'];
  const fields    = type === 'transactions' ? txFields : invFields;

  const fmt = v => v == null ? '—' : String(v);

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-surface/60">
            <th className="text-left py-2 px-3 text-muted font-display uppercase tracking-wider whitespace-nowrap w-16">Op</th>
            <th className="text-left py-2 px-3 text-muted font-display uppercase tracking-wider">Entry</th>
            <th className="text-left py-2 px-3 text-muted font-display uppercase tracking-wider w-72">Changes</th>
            <th className="w-7" />
          </tr>
        </thead>
        <tbody>
          {operations.map((op, i) => {
            const orig = op.original;
            return (
              <tr key={i} className="border-b border-border/50 hover:bg-surface/40 align-top">
                {/* Action badge — compact dot + label */}
                <td className="py-2.5 px-3 whitespace-nowrap">
                  {op.action === 'delete'
                    ? <span className="inline-flex items-center gap-1 text-rose/80 text-xs font-medium"><span className="w-1.5 h-1.5 rounded-full bg-rose/70 shrink-0" />del</span>
                    : <span className="inline-flex items-center gap-1 text-accent/80 text-xs font-medium"><span className="w-1.5 h-1.5 rounded-full bg-accent/70 shrink-0" />upd</span>
                  }
                </td>

                {/* Original entry summary — gets the extra width */}
                <td className="py-2.5 px-3">
                  <span className="font-mono text-white text-xs">{fmt(orig?.amount) !== '—' ? `₹${Number(orig.amount).toLocaleString('en-IN')}` : '—'}</span>
                  <span className="text-muted mx-1.5">·</span>
                  <span className="text-muted text-xs">
                    {type === 'transactions'
                      ? `${orig?.type} · ${orig?.account} · ${orig?.date}`
                      : `${orig?.instrument || orig?.asset_class} · ${orig?.account} · ${orig?.date}`
                    }
                  </span>
                  {orig?.remark && <p className="text-muted/60 mt-0.5 truncate max-w-xs">{orig.remark}</p>}
                  {orig?.goal  && <p className="text-muted/60 mt-0.5">Goal: {orig.goal}</p>}
                </td>

                {/* Changes — compact, fixed width */}
                <td className="py-2 px-3 w-72">
                  {op.action === 'delete' ? (
                    <span className="text-muted/60 italic text-xs">will be deleted</span>
                  ) : (
                    <div className="space-y-1">
                      {Object.entries(op.changes || {}).map(([field, val]) => (
                        <div key={field} className="flex items-center gap-1.5">
                          <span className="text-muted/70 w-14 shrink-0 capitalize text-xs">{field.replace(/_/g, ' ')}:</span>
                          {field === 'type' ? (
                            <EditCell value={val} onChange={v => updateChange(i, field, v)} options={TX_TYPES} />
                          ) : field === 'asset_class' ? (
                            <EditCell value={val} onChange={v => updateChange(i, field, v)} options={INV_CLASSES} />
                          ) : field === 'side' ? (
                            <EditCell value={val} onChange={v => updateChange(i, field, v)} options={INV_SIDES} />
                          ) : field === 'amount' ? (
                            <EditCell value={val} onChange={v => updateChange(i, field, Number(v))} type="number" />
                          ) : field === 'date' ? (
                            <EditCell value={val} onChange={v => updateChange(i, field, v)} type="date" />
                          ) : (
                            <EditCell value={val ?? ''} onChange={v => updateChange(i, field, v)} />
                          )}
                          <span className="text-muted/40 text-xs shrink-0">{fmt(orig?.[field])}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </td>

                {/* Remove from list */}
                <td className="py-2.5 px-2">
                  <button onClick={() => remove(i)} className="p-1 rounded hover:bg-rose/10 text-muted/40 hover:text-rose transition-colors" title="Remove">
                    <X size={11} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── AiEditPanel ───────────────────────────────────────────────────────────────
// Handles both edits (UPDATE) and deletions (DELETE) via a single prompt.
// Shows the full OperationsTable for review before applying.
export function AiEditPanel({ type, persons, onEdit }) {
  const [open, setOpen]         = useState(false);
  const [prompt, setPrompt]     = useState('');
  const [parsing, setParsing]   = useState(false);
  const [operations, setOps]    = useState(null);
  const [applying, setApplying] = useState(false);
  const [error, setError]       = useState('');
  const [done, setDone]         = useState(false);

  const handleParse = async () => {
    if (!prompt.trim()) return;
    setParsing(true);
    setError('');
    setOps(null);
    setDone(false);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const r = await api.post('/ai/edit', { prompt, type, persons, today });
      const ops = r.data.operations || [];
      if (!ops.length) {
        setError('No matching entries found. Try a more specific description.');
      } else {
        setOps(ops);
      }
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to find matching entries. Try again.');
    } finally {
      setParsing(false);
    }
  };

  const handleConfirm = async () => {
    if (!operations?.length) return;
    setApplying(true);
    try {
      await onEdit(operations);
      setDone(true);
      setOps(null);
      setPrompt('');
      setTimeout(() => { setDone(false); setOpen(false); }, 2000);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to apply changes.');
    } finally {
      setApplying(false);
    }
  };

  const handleReset = () => { setOps(null); setError(''); setDone(false); };

  const delCount = operations?.filter(o => o.action === 'delete').length || 0;
  const updCount = operations?.filter(o => o.action === 'update').length || 0;

  const placeholder = type === 'transactions'
    ? '"delete all Regular for March" / "change remark of ₹50k income to Bonus" / "remove Kirti\'s trip entries"'
    : '"delete all Equity under Goal X" / "set goal to Retirement for all Zerodha entries"';

  return (
    <div className="card border-violet-500/30 bg-gradient-to-br from-violet-500/5 to-transparent">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <div className="flex items-center gap-2">
          <Edit2 size={16} className="text-violet-400" />
          <span className="font-display font-semibold text-white text-sm">Edit with AI</span>
          <span className="text-xs text-muted">— describe changes or deletions, AI previews before applying</span>
        </div>
        {open ? <ChevronUp size={16} className="text-muted" /> : <ChevronDown size={16} className="text-muted" />}
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          {!operations && (
            <>
              <textarea
                className="input w-full resize-none text-sm leading-relaxed"
                rows={3}
                placeholder={placeholder}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleParse(); }}
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleParse}
                  disabled={parsing || !prompt.trim()}
                  className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-50"
                >
                  {parsing
                    ? <><Loader2 size={14} className="animate-spin" />Finding…</>
                    : <><Edit2 size={14} />Find & Preview</>}
                </button>
                <span className="text-xs text-muted">Ctrl+Enter to search</span>
              </div>
            </>
          )}

          {error && (
            <div className="rounded-lg bg-rose/10 border border-rose/30 px-3 py-2 text-sm text-rose flex items-center gap-2">
              <X size={14} /> {error}
              <button onClick={handleReset} className="ml-auto text-xs underline hover:no-underline">Try again</button>
            </div>
          )}

          {done && (
            <div className="rounded-lg bg-teal/10 border border-teal/30 px-3 py-2 text-sm text-teal flex items-center gap-2">
              <Check size={14} /> Changes applied successfully!
            </div>
          )}

          {operations && operations.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-white font-semibold">
                  {delCount > 0 && <><span className="text-rose">{delCount} delete{delCount !== 1 ? 's' : ''}</span>{updCount > 0 ? ' · ' : ''}</>}
                  {updCount > 0 && <span className="text-accent">{updCount} update{updCount !== 1 ? 's' : ''}</span>}
                  <span className="text-muted font-normal"> — review &amp; adjust below, then apply</span>
                </p>
                <button onClick={handleReset} className="text-xs text-muted hover:text-white underline">← Change prompt</button>
              </div>

              <OperationsTable operations={operations} setOperations={setOps} type={type} />

              <div className="flex gap-2 items-center">
                <button
                  onClick={handleConfirm}
                  disabled={applying || operations.length === 0}
                  className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-50"
                >
                  {applying
                    ? <><Loader2 size={14} className="animate-spin" />Applying…</>
                    : <><Check size={14} />Apply {operations.length} change{operations.length !== 1 ? 's' : ''}</>}
                </button>
                <button onClick={handleReset} className="btn-ghost text-sm">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main AiEntryPanel ─────────────────────────────────────────────────────────
export default function AiEntryPanel({ type, persons, onAdd }) {
  const [open, setOpen]         = useState(false);
  const [prompt, setPrompt]     = useState('');
  const [parsing, setParsing]   = useState(false);
  const [entries, setEntries]   = useState(null);
  const [applying, setApplying] = useState(false);
  const [error, setError]       = useState('');
  const [done, setDone]         = useState(false);

  const placeholder =
    type === 'transactions'
      ? 'Describe or paste transactions in any format — plain text, table, or bullet points'
      : type === 'cashflow'
      ? 'Paste a monthly cashflow table (Month | Income | Other Income | Major | Non-Recurring | Regular | EMI | Trips)'
      : 'Describe or paste investment entries — e.g. "Bought Nifty 50 for ₹15k via Zerodha on 3 Jan"';

  const handleParse = async () => {
    if (!prompt.trim()) return;
    setParsing(true);
    setError('');
    setEntries(null);
    setOps(null);
    setDone(false);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const r = await api.post('/ai/parse', { prompt, type, persons, today });
      setEntries(r.data.entries);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to parse. Try again.');
    } finally {
      setParsing(false);
    }
  };

  const handleConfirmAdd = async () => {
    if (!entries?.length) return;
    setApplying(true);
    try {
      await onAdd(entries);
      setDone(true);
      setEntries(null);
      setPrompt('');
      setTimeout(() => { setDone(false); setOpen(false); }, 2000);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to add entries.');
    } finally {
      setApplying(false);
    }
  };

  const handleReset = () => { setEntries(null); setError(''); setDone(false); };

  return (
    <div className="card border-accent/30 bg-gradient-to-br from-accent/5 to-transparent">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-accent" />
          <span className="font-display font-semibold text-white text-sm">Add with AI</span>
          <span className="text-xs text-muted">— describe in plain text, AI creates the entries</span>
        </div>
        {open ? <ChevronUp size={16} className="text-muted" /> : <ChevronDown size={16} className="text-muted" />}
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          {/* Prompt input */}
          {!entries && (
            <>
              <textarea
                className="input w-full resize-none text-sm leading-relaxed"
                rows={3}
                placeholder={placeholder}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleParse(); }}
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleParse}
                  disabled={parsing || !prompt.trim()}
                  className="btn-primary flex items-center gap-1.5 text-sm disabled:opacity-50"
                >
                  {parsing
                    ? <><Loader2 size={14} className="animate-spin" />Parsing…</>
                    : <><Sparkles size={14} />Parse</>}
                </button>
                <span className="text-xs text-muted">Ctrl+Enter to parse</span>
              </div>
            </>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-rose/10 border border-rose/30 px-3 py-2 text-sm text-rose flex items-center gap-2">
              <X size={14} /> {error}
              <button onClick={handleReset} className="ml-auto text-xs underline hover:no-underline">Try again</button>
            </div>
          )}

          {/* Success */}
          {done && (
            <div className="rounded-lg bg-teal/10 border border-teal/30 px-3 py-2 text-sm text-teal flex items-center gap-2">
              <Check size={14} /> Entries added successfully!
            </div>
          )}

          {/* ── Add: confirmation table ── */}
          {entries && entries.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-white font-semibold">
                  {entries.length} entr{entries.length === 1 ? 'y' : 'ies'} parsed —
                  <span className="text-muted font-normal"> review and edit below, then confirm</span>
                </p>
                <button onClick={handleReset} className="text-xs text-muted hover:text-white underline">← Change prompt</button>
              </div>
              {type === 'transactions' && <TxConfirmTable  entries={entries} setEntries={setEntries} persons={persons} />}
              {type === 'investments'  && <InvConfirmTable entries={entries} setEntries={setEntries} persons={persons} />}
              {type === 'cashflow'     && <CfConfirmTable  entries={entries} setEntries={setEntries} persons={persons} />}
              <div className="flex gap-2 items-center">
                <button
                  onClick={handleConfirmAdd}
                  disabled={applying || entries.length === 0}
                  className="btn-primary flex items-center gap-1.5 text-sm disabled:opacity-50"
                >
                  {applying
                    ? <><Loader2 size={14} className="animate-spin" />Adding…</>
                    : <><Check size={14} />Confirm &amp; Add {entries.length} entr{entries.length === 1 ? 'y' : 'ies'}</>}
                </button>
                <button onClick={handleReset} className="btn-ghost text-sm">Cancel</button>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
