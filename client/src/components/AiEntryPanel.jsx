import { useState } from 'react';
import { Sparkles, Loader2, Check, X, Pencil, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import api from '../lib/api';

const TX_TYPES = ['Income', 'Other Income', 'Major', 'Non-Recurring', 'Regular', 'EMI', 'Trips'];
const INV_CLASSES = ['Equity', 'Debt', 'Gold', 'Cash', 'Real Estate', 'Crypto'];
const INV_SIDES = ['BUY', 'SELL'];

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

// ── Transaction confirmation table ────────────────────────────────────────────
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

// ── Investment confirmation table ─────────────────────────────────────────────
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

// ── Main AiEntryPanel ─────────────────────────────────────────────────────────
export default function AiEntryPanel({ type, persons, onAdd }) {
  const [open, setOpen]         = useState(false);
  const [prompt, setPrompt]     = useState('');
  const [parsing, setParsing]   = useState(false);
  const [entries, setEntries]   = useState(null);  // null = not parsed yet
  const [adding, setAdding]     = useState(false);
  const [error, setError]       = useState('');
  const [done, setDone]         = useState(false);

  const placeholder = type === 'transactions'
    ? 'e.g. "Spent 1200 on groceries and 800 on fuel today, also paid 45000 EMI on 1st March"'
    : 'e.g. "Bought 50 units of Nifty 50 index fund for 15000 via Zerodha on 5th March, goal: retirement"';

  const handleParse = async () => {
    if (!prompt.trim()) return;
    setParsing(true);
    setError('');
    setEntries(null);
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

  const handleAdd = async () => {
    if (!entries?.length) return;
    setAdding(true);
    try {
      await onAdd(entries);
      setDone(true);
      setEntries(null);
      setPrompt('');
      setTimeout(() => { setDone(false); setOpen(false); }, 2000);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to add entries.');
    } finally {
      setAdding(false);
    }
  };

  const handleReset = () => {
    setEntries(null);
    setError('');
    setDone(false);
  };

  return (
    <div className="card border-accent/30 bg-gradient-to-br from-accent/5 to-transparent">
      {/* Header toggle */}
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

          {/* Confirmation table */}
          {entries && entries.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-white font-semibold">
                  {entries.length} entr{entries.length === 1 ? 'y' : 'ies'} parsed —
                  <span className="text-muted font-normal"> review and edit below, then confirm</span>
                </p>
                <button onClick={handleReset} className="text-xs text-muted hover:text-white underline">
                  ← Change prompt
                </button>
              </div>

              {type === 'transactions'
                ? <TxConfirmTable entries={entries} setEntries={setEntries} persons={persons} />
                : <InvConfirmTable entries={entries} setEntries={setEntries} persons={persons} />
              }

              <div className="flex gap-2 items-center">
                <button
                  onClick={handleAdd}
                  disabled={adding || entries.length === 0}
                  className="btn-primary flex items-center gap-1.5 text-sm disabled:opacity-50"
                >
                  {adding
                    ? <><Loader2 size={14} className="animate-spin" />Adding…</>
                    : <><Check size={14} />Confirm &amp; Add {entries.length} entr{entries.length === 1 ? 'y' : 'ies'}</>
                  }
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
