import { useState } from 'react';
import { Sparkles, Loader2, Check, X, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import api from '../lib/api';

// Detect edit/delete intent from the prompt text
function isEditIntent(text) {
  return /\b(update|edit|change|set|delete|remove|fix|rename|replace|correct|modify|clear)\b/i.test(text);
}

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
            <th className="text-left py-2.5 px-3 text-muted font-display uppercase tracking-wider whitespace-nowrap">Action</th>
            <th className="text-left py-2.5 px-3 text-muted font-display uppercase tracking-wider whitespace-nowrap">Entry</th>
            <th className="text-left py-2.5 px-3 text-muted font-display uppercase tracking-wider whitespace-nowrap">Changes</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {operations.map((op, i) => {
            const orig = op.original;
            return (
              <tr key={i} className="border-b border-border/50 hover:bg-surface/40 align-top">
                {/* Action badge */}
                <td className="py-2.5 px-3 whitespace-nowrap">
                  {op.action === 'delete'
                    ? <span className="px-2 py-0.5 rounded text-xs font-bold bg-rose/15 text-rose">DELETE</span>
                    : <span className="px-2 py-0.5 rounded text-xs font-bold bg-accent/15 text-accent">UPDATE</span>
                  }
                </td>

                {/* Original entry summary */}
                <td className="py-2.5 px-3">
                  <p className="font-mono text-white">{fmt(orig?.amount) !== '—' ? `₹${Number(orig.amount).toLocaleString('en-IN')}` : '—'}</p>
                  <p className="text-muted mt-0.5">
                    {type === 'transactions'
                      ? `${orig?.type} · ${orig?.account} · ${orig?.date}`
                      : `${orig?.instrument || orig?.asset_class} · ${orig?.account} · ${orig?.date}`
                    }
                  </p>
                  {orig?.remark && <p className="text-muted/70 mt-0.5 truncate max-w-[180px]">{orig.remark}</p>}
                  {orig?.goal && <p className="text-muted/70 mt-0.5">Goal: {orig.goal}</p>}
                </td>

                {/* Changes (editable for updates) */}
                <td className="py-2 px-3 min-w-[200px]">
                  {op.action === 'delete' ? (
                    <span className="text-muted italic">Entry will be deleted</span>
                  ) : (
                    <div className="space-y-1.5">
                      {Object.entries(op.changes || {}).map(([field, val]) => (
                        <div key={field} className="flex items-center gap-2">
                          <span className="text-muted w-20 shrink-0 capitalize">{field.replace(/_/g, ' ')}:</span>
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
                          <span className="text-muted/50 text-xs shrink-0">(was: {fmt(orig?.[field])})</span>
                        </div>
                      ))}
                    </div>
                  )}
                </td>

                {/* Remove from list */}
                <td className="py-2.5 px-3">
                  <button onClick={() => remove(i)} className="p-1 rounded hover:bg-rose/10 text-muted hover:text-rose transition-colors" title="Remove this operation">
                    <X size={12} />
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

// ── AiDeletePanel ─────────────────────────────────────────────────────────────
export function AiDeletePanel({ persons, onDelete }) {
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
      const deletePrompt = `Delete (action: "delete") all matching transactions. ${prompt}`;
      const r = await api.post('/ai/edit', { prompt: deletePrompt, type: 'transactions', persons, today });
      const delOps = (r.data.operations || []).filter(op => op.action === 'delete');
      if (!delOps.length) {
        setError('No matching transactions found to delete. Try a more specific description.');
      } else {
        setOps(delOps);
      }
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to find matching transactions. Try again.');
    } finally {
      setParsing(false);
    }
  };

  const handleConfirm = async () => {
    if (!operations?.length) return;
    setApplying(true);
    try {
      await onDelete(operations);
      setDone(true);
      setOps(null);
      setPrompt('');
      setTimeout(() => { setDone(false); setOpen(false); }, 2000);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to delete transactions.');
    } finally {
      setApplying(false);
    }
  };

  const handleReset = () => { setOps(null); setError(''); setDone(false); };

  const fmt = v => v == null ? '—' : String(v);

  return (
    <div className="card border-rose/30 bg-gradient-to-br from-rose/5 to-transparent">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <div className="flex items-center gap-2">
          <Trash2 size={16} className="text-rose" />
          <span className="font-display font-semibold text-white text-sm">Delete with AI</span>
          <span className="text-xs text-muted">— describe what to delete, AI finds & confirms before removing</span>
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
                placeholder='e.g. "delete all Regular expenses from March 2024" or "remove the Swiggy entries last month"'
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleParse(); }}
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleParse}
                  disabled={parsing || !prompt.trim()}
                  className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg font-semibold bg-rose/80 hover:bg-rose text-white transition-colors disabled:opacity-50"
                >
                  {parsing
                    ? <><Loader2 size={14} className="animate-spin" />Finding…</>
                    : <><Trash2 size={14} />Find Transactions</>}
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
              <Check size={14} /> Transactions deleted successfully!
            </div>
          )}

          {operations && operations.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-white font-semibold">
                  <span className="text-rose">{operations.length}</span> transaction{operations.length !== 1 ? 's' : ''} will be deleted
                  <span className="text-muted font-normal"> — review below, then confirm</span>
                </p>
                <button onClick={handleReset} className="text-xs text-muted hover:text-white underline">← Change prompt</button>
              </div>
              <div className="overflow-x-auto rounded-xl border border-rose/30">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-rose/5">
                      {['Date', 'Type', 'Account', 'Amount', 'Remark'].map(h => (
                        <th key={h} className="text-left py-2.5 px-3 text-muted font-display uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {operations.map((op, i) => {
                      const o = op.original;
                      return (
                        <tr key={i} className="border-b border-border/50 hover:bg-rose/5">
                          <td className="py-2 px-3 font-mono text-soft">{o?.date}</td>
                          <td className="py-2 px-3 text-soft">{o?.type}</td>
                          <td className="py-2 px-3 text-soft">{o?.account}</td>
                          <td className="py-2 px-3 font-mono text-rose">₹{Number(o?.amount || 0).toLocaleString('en-IN')}</td>
                          <td className="py-2 px-3 text-muted max-w-xs truncate">{o?.remark || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-2 items-center">
                <button
                  onClick={handleConfirm}
                  disabled={applying}
                  className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg font-semibold bg-rose/80 hover:bg-rose text-white transition-colors disabled:opacity-50"
                >
                  {applying
                    ? <><Loader2 size={14} className="animate-spin" />Deleting…</>
                    : <><Trash2 size={14} />Delete {operations.length} transaction{operations.length !== 1 ? 's' : ''}</>}
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
export default function AiEntryPanel({ type, persons, onAdd, onEdit }) {
  const [open, setOpen]         = useState(false);
  const [prompt, setPrompt]     = useState('');
  const [parsing, setParsing]   = useState(false);
  const [entries, setEntries]   = useState(null);
  const [operations, setOps]    = useState(null);
  const [applying, setApplying] = useState(false);
  const [error, setError]       = useState('');
  const [done, setDone]         = useState(false);

  const placeholder =
    type === 'transactions'
      ? 'Describe or paste transactions — or say "delete all Regular for March" / "change remark of ₹50k income to Bonus"'
      : type === 'cashflow'
      ? 'Paste a monthly cashflow table (Month | Income | Other Income | Major | Non-Recurring | Regular | EMI | Trips)'
      : 'Add: "Bought Nifty 50 for ₹15k via Zerodha" — or edit: "Set goal to Retirement for all Zerodha entries"';

  const handleParse = async () => {
    if (!prompt.trim()) return;
    setParsing(true);
    setError('');
    setEntries(null);
    setOps(null);
    setDone(false);
    try {
      const today = new Date().toISOString().slice(0, 10);
      if (type !== 'cashflow' && isEditIntent(prompt)) {
        const r = await api.post('/ai/edit', { prompt, type, persons, today });
        setOps(r.data.operations);
      } else {
        const r = await api.post('/ai/parse', { prompt, type, persons, today });
        setEntries(r.data.entries);
      }
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

  const handleConfirmEdit = async () => {
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

  const handleReset = () => { setEntries(null); setOps(null); setError(''); setDone(false); };

  const isParsed  = !!(entries || operations);
  const itemCount = entries?.length || operations?.length || 0;
  const delCount  = operations?.filter(o => o.action === 'delete').length || 0;
  const updCount  = operations?.filter(o => o.action === 'update').length || 0;

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
          {!isParsed && (
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
              <Check size={14} /> {operations ? 'Changes applied successfully!' : 'Entries added successfully!'}
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

          {/* ── Edit/Delete: operations review table ── */}
          {operations && operations.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-white font-semibold">
                  {itemCount} operation{itemCount !== 1 ? 's' : ''} found
                  {updCount > 0 && <span className="text-accent font-normal"> · {updCount} update{updCount !== 1 ? 's' : ''}</span>}
                  {delCount > 0 && <span className="text-rose font-normal"> · {delCount} delete{delCount !== 1 ? 's' : ''}</span>}
                  <span className="text-muted font-normal"> — review below, then apply</span>
                </p>
                <button onClick={handleReset} className="text-xs text-muted hover:text-white underline">← Change prompt</button>
              </div>
              <OperationsTable operations={operations} setOperations={setOps} type={type} />
              <div className="flex gap-2 items-center">
                <button
                  onClick={handleConfirmEdit}
                  disabled={applying || operations.length === 0}
                  className={`flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50 ${
                    delCount > 0 && updCount === 0 ? 'bg-rose/80 hover:bg-rose text-white' : 'btn-primary'
                  }`}
                >
                  {applying
                    ? <><Loader2 size={14} className="animate-spin" />Applying…</>
                    : <><Check size={14} />Apply {itemCount} operation{itemCount !== 1 ? 's' : ''}</>}
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
