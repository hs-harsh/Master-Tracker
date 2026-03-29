import { useState, useEffect, useCallback, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import {
  TrendingUp, BarChart2, Plus, X, Trash2, Play, Sparkles,
  Loader2, AlertCircle, RefreshCw, ArrowRight, ArrowLeft, Check,
  Download, Search, ChevronDown, ChevronRight, Wand2, MessageSquare,
  Lightbulb, Save, RotateCcw, Copy, Pencil,
} from 'lucide-react';
import {
  ComposedChart, Area, Bar, Line, Scatter, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import api from '../../lib/api';
import { SECTORS, NIFTY_INDICES } from '../../lib/indianStocks';

const SUB_TABS = [
  { to: '/live-trading/backtest',   label: 'Backtest',   icon: TrendingUp },
  { to: '/live-trading/post-trade', label: 'Post-Trade', icon: BarChart2  },
];

const AI_STEPS = [
  'Analyzing prompts…',
  'Identifying indicators…',
  'Structuring entry/exit rules…',
  'Reviewing risk parameters…',
  'Generating suggestions…',
];

const RUN_STEPS = [
  'Saving strategy…',
  'Validating Step 1 data & rules…',
  'Simulating each instrument…',
  'Calculating statistics…',
];

function todayStr() { return new Date().toISOString().slice(0, 10); }
function twoYearsAgo() {
  const d = new Date(); d.setFullYear(d.getFullYear() - 2);
  return d.toISOString().slice(0, 10);
}

/** Normalize API/DB date values for <input type="date" /> (YYYY-MM-DD). */
function formatDateForInput(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'string') {
    const d = v.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  }
  if (v instanceof Date && !Number.isNaN(+v)) return v.toISOString().slice(0, 10);
  return null;
}

function buildOhlcvMapFromMultiResponse(instruments, raw, rawErr) {
  const mapped = {};
  const mappedErr = {};
  (instruments || []).forEach((sym) => {
    const u = sym.trim().toUpperCase();
    if (raw[u]?.length) mapped[sym] = raw[u];
    if (rawErr[u]) mappedErr[sym] = rawErr[u];
  });
  return { mapped, mappedErr };
}
function fmtPct(v) {
  if (v == null) return '—';
  return `${v >= 0 ? '+' : ''}${(+v).toFixed(1)}%`;
}
function fmtNum(v, d = 2) { return v == null ? '—' : (+v).toFixed(d); }
function fmtCurrency(v) { return v == null ? '—' : `₹${Math.round(v).toLocaleString('en-IN')}`; }

function downloadCsv(rows, filename) {
  if (!rows?.length) return;
  const header = Object.keys(rows[0]).join(',');
  const body = rows.map(r => Object.values(r).join(',')).join('\n');
  const blob = new Blob([header + '\n' + body], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function StatusBadge({ status }) {
  const map = {
    draft:   'bg-white/8 text-muted',
    running: 'bg-amber-500/15 text-amber-400',
    done:    'bg-emerald-500/15 text-emerald-400',
    error:   'bg-red-500/15 text-red-400',
  };
  return (
    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${map[status] || map.draft}`}>
      {status === 'running' ? '⟳ running' : status}
    </span>
  );
}

// ─── Stock Picker Modal ───────────────────────────────────────────────────────
function StockPickerModal({ current, onConfirm, onClose }) {
  const [selected, setSelected] = useState(new Set(current));
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState({});

  const toggle = sym => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(sym)) n.delete(sym); else n.add(sym);
      return n;
    });
  };

  const toggleSector = (sector) => {
    const syms = SECTORS[sector].map(s => s.sym);
    const allIn = syms.every(s => selected.has(s));
    setSelected(prev => {
      const n = new Set(prev);
      if (allIn) syms.forEach(s => n.delete(s));
      else syms.forEach(s => n.add(s));
      return n;
    });
  };

  const selectIndex = (idx) => {
    setSelected(prev => {
      const n = new Set(prev);
      idx.symbols.forEach(s => n.add(s));
      return n;
    });
  };

  const query = search.toLowerCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#0d0f1a] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8 shrink-0">
          <div>
            <p className="text-white font-display font-bold">Stock Picker</p>
            <p className="text-muted text-xs mt-0.5">{selected.size} selected</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-white transition-colors p-1">
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-white/8 shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              className="input pl-8 py-2 text-sm"
              placeholder="Search stocks…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        {/* Index presets */}
        {!search && (
          <div className="px-4 py-3 border-b border-white/8 shrink-0">
            <p className="text-[10px] text-muted uppercase tracking-wider mb-2 font-mono">Index Presets</p>
            <div className="flex flex-wrap gap-1.5">
              {NIFTY_INDICES.map(idx => (
                <button key={idx.label} onClick={() => selectIndex(idx)}
                  className="px-2.5 py-1 rounded-lg text-xs font-mono bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 transition-colors">
                  {idx.label}
                </button>
              ))}
              <button onClick={() => setSelected(new Set())}
                className="px-2.5 py-1 rounded-lg text-xs font-mono bg-white/5 border border-white/10 text-muted hover:text-soft transition-colors">
                Clear all
              </button>
            </div>
          </div>
        )}

        {/* Sectors / search results */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {search ? (
            // Flat search results
            Object.entries(SECTORS).flatMap(([, stocks]) => stocks)
              .filter(s => s.label.toLowerCase().includes(query) || s.sym.toLowerCase().includes(query))
              .map(s => (
                <label key={s.sym} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/[0.04] cursor-pointer transition-colors">
                  <input type="checkbox" checked={selected.has(s.sym)} onChange={() => toggle(s.sym)}
                    className="accent-violet-500 w-3.5 h-3.5 shrink-0" />
                  <span className="text-sm text-soft flex-1">{s.label}</span>
                  <span className="text-xs font-mono text-muted">{s.sym}</span>
                </label>
              ))
          ) : (
            // Grouped by sector
            Object.entries(SECTORS).map(([sector, stocks]) => {
              const isOpen = expanded[sector] !== false; // default open
              const allIn = stocks.every(s => selected.has(s.sym));
              const someIn = stocks.some(s => selected.has(s.sym));
              return (
                <div key={sector} className="rounded-xl border border-white/8 overflow-hidden">
                  <div className="flex items-center gap-3 px-3 py-2.5 bg-white/[0.03] cursor-pointer hover:bg-white/[0.05] transition-colors"
                    onClick={() => setExpanded(p => ({ ...p, [sector]: !isOpen }))}>
                    <input type="checkbox" checked={allIn} ref={el => { if (el) el.indeterminate = !allIn && someIn; }}
                      onChange={() => toggleSector(sector)}
                      onClick={e => e.stopPropagation()}
                      className="accent-violet-500 w-3.5 h-3.5 shrink-0" />
                    <span className="text-sm text-soft font-medium flex-1">{sector}</span>
                    <span className="text-[10px] font-mono text-muted">{stocks.filter(s => selected.has(s.sym)).length}/{stocks.length}</span>
                    {isOpen ? <ChevronDown size={13} className="text-muted" /> : <ChevronRight size={13} className="text-muted" />}
                  </div>
                  {isOpen && (
                    <div className="divide-y divide-white/5">
                      {stocks.map(s => (
                        <label key={s.sym} className="flex items-center gap-3 px-4 py-2 hover:bg-white/[0.02] cursor-pointer transition-colors">
                          <input type="checkbox" checked={selected.has(s.sym)} onChange={() => toggle(s.sym)}
                            className="accent-violet-500 w-3.5 h-3.5 shrink-0" />
                          <span className="text-sm text-soft flex-1">{s.label}</span>
                          <span className="text-xs font-mono text-muted">{s.sym}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/8 flex items-center justify-between shrink-0">
          <p className="text-muted text-sm">{selected.size} stocks selected</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost text-sm px-4 py-2">Cancel</button>
            <button onClick={() => onConfirm([...selected])} className="btn-primary text-sm px-4 py-2">
              Add to Strategy
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Instrument Input with Picker ─────────────────────────────────────────────
function InstrumentInput({ value, onChange }) {
  const [input, setInput] = useState('');
  const [showPicker, setShowPicker] = useState(false);

  const add = () => {
    const sym = input.trim().toUpperCase();
    if (!sym || value.includes(sym)) { setInput(''); return; }
    onChange([...value, sym]);
    setInput('');
  };

  return (
    <>
      <div className="flex flex-wrap gap-1.5 p-2 rounded-xl border border-white/10 bg-surface min-h-[42px] items-center focus-within:border-accent/40 transition-colors">
        {value.map(sym => (
          <span key={sym} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/15 text-accent text-xs font-mono">
            {sym}
            <button type="button" onClick={() => onChange(value.filter(s => s !== sym))} className="hover:text-white transition-colors">
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          className="bg-transparent text-white text-sm outline-none placeholder:text-muted/50 flex-1 min-w-[80px] px-1"
          placeholder="RELIANCE.NS… (Enter)"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
          onBlur={add}
        />
        <button type="button" onClick={() => setShowPicker(true)}
          className="shrink-0 px-2 py-1 rounded-lg text-xs font-mono bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 transition-colors flex items-center gap-1">
          <Search size={11} /> Indian Stocks
        </button>
      </div>
      {showPicker && (
        <StockPickerModal
          current={value}
          onConfirm={syms => { onChange(syms); setShowPicker(false); }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </>
  );
}

// ─── Status Bars ──────────────────────────────────────────────────────────────
function AiStatusBar({ active, step, error }) {
  if (!active && !error) return null;
  if (error) return (
    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-300">
      <AlertCircle size={13} className="shrink-0" />
      <span>{error}</span>
    </div>
  );
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-sm text-purple-300">
      <Loader2 size={13} className="animate-spin shrink-0" />
      <span>{AI_STEPS[Math.min(step, AI_STEPS.length - 1)]}</span>
      <span className="ml-auto text-[10px] font-mono text-purple-400/60">{step + 1}/{AI_STEPS.length}</span>
    </div>
  );
}

function RunStatusBar({ active, step }) {
  if (!active) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-300">
        <Loader2 size={13} className="animate-spin shrink-0" />
        <span>{RUN_STEPS[Math.min(step, RUN_STEPS.length - 1)]}</span>
        <span className="ml-auto text-[10px] font-mono text-emerald-400/60">{step + 1}/{RUN_STEPS.length}</span>
      </div>
      {/* Mini step trail */}
      <div className="flex gap-1.5 px-1">
        {RUN_STEPS.map((label, i) => (
          <div key={i} className={`flex-1 flex flex-col items-center gap-0.5`}>
            <div className={`h-1 w-full rounded-full transition-all duration-500 ${
              i < step ? 'bg-emerald-500' : i === step ? 'bg-emerald-500/60' : 'bg-white/10'
            }`} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Draft key helper ─────────────────────────────────────────────────────────
const draftKey = id => `bt_draft_${id}`;

function loadDraft(id) {
  try { return JSON.parse(localStorage.getItem(draftKey(id)) || 'null'); }
  catch { return null; }
}
function saveDraft(id, state) {
  try { localStorage.setItem(draftKey(id), JSON.stringify(state)); } catch {}
}
function clearDraft(id) {
  try { localStorage.removeItem(draftKey(id)); } catch {}
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function BacktestPage() {
  const [strategies, setStrategies]       = useState([]);
  const [loading, setLoading]             = useState(true);
  const [selectedId, setSelectedId]       = useState(null);
  const [step, setStep]                   = useState(1);
  const [showResults, setShowResults]     = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [saving, setSaving]               = useState(false);
  const [hasDraft, setHasDraft]           = useState(false);

  // Step 1
  const [form1, setForm1] = useState({
    name: '', instruments: [], frequency: '1d',
    date_from: twoYearsAgo(), date_to: todayStr(), capital: '10000',
  });
  // Step 2
  const [strategyPrompt, setStrategyPrompt] = useState('');
  const [aiInterpretation, setAiInterpretation] = useState(null);
  const [aiSuggestions, setAiSuggestions]   = useState([]);
  const [aiQuestions, setAiQuestions]       = useState([]);
  const [stopLoss, setStopLoss]         = useState('3');
  const [takeProfit, setTakeProfit]     = useState('8');
  const [rules, setRules]               = useState(null);
  // AI state
  const [aiActive, setAiActive]         = useState(false);
  const [aiStep, setAiStep]             = useState(0);
  const [aiError, setAiError]           = useState('');
  const aiIntervalRef                   = useRef(null);
  // Run state
  const [runStep, setRunStep]           = useState(0);
  const runIntervalRef                  = useRef(null);
  // OHLCV multi
  const [ohlcvMap, setOhlcvMap]         = useState({});  // { SYM: rows[] }
  const [ohlcvTab, setOhlcvTab]         = useState('');
  const [ohlcvLoading, setOhlcvLoading] = useState(false);
  const [ohlcvErrors, setOhlcvErrors]   = useState({});
  // Run
  const [running, setRunning]           = useState(false);
  const [runError, setRunError]         = useState('');

  const selected = strategies.find(s => s.id === selectedId) || null;

  // ── Draft auto-save ──────────────────────────────────────────────────────────
  const draftState = useCallback(() => ({
    form1, strategyPrompt, stopLoss, takeProfit, rules,
  }), [form1, strategyPrompt, stopLoss, takeProfit, rules]);

  useEffect(() => {
    if (!selectedId) return;
    const id = setTimeout(() => {
      saveDraft(selectedId, draftState());
      setHasDraft(true);
    }, 800);
    return () => clearTimeout(id);
  }, [selectedId, draftState]);

  // ── Load strategies ──────────────────────────────────────────────────────────
  const loadStrategies = useCallback(async () => {
    try {
      const { data } = await api.get('/backtest/strategies');
      setStrategies(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadStrategies(); }, [loadStrategies]);

  // Poll running
  useEffect(() => {
    if (!strategies.some(s => s.status === 'running')) return;
    const t = setTimeout(() => loadStrategies(), 2500);
    return () => clearTimeout(t);
  }, [strategies, loadStrategies]);

  // ── AI step animation ────────────────────────────────────────────────────────
  function startAiAnim() {
    setAiActive(true); setAiStep(0); setAiError('');
    aiIntervalRef.current = setInterval(() => {
      setAiStep(s => (s < AI_STEPS.length - 1 ? s + 1 : s));
    }, 1200);
  }
  function stopAiAnim() {
    clearInterval(aiIntervalRef.current);
    setAiActive(false); setAiStep(0);
  }

  function startRunAnim() {
    setRunning(true); setRunStep(0); setRunError('');
    runIntervalRef.current = setInterval(() => {
      setRunStep(s => (s < RUN_STEPS.length - 1 ? s + 1 : s));
    }, 1800);
  }
  function stopRunAnim() {
    clearInterval(runIntervalRef.current);
    setRunning(false); setRunStep(0);
  }

  // ── Form population ──────────────────────────────────────────────────────────
  function populateForm(s, draft) {
    const d = draft || {};
    const f = d.form1 || {};
    const df = formatDateForInput(s.date_from);
    const dt = formatDateForInput(s.date_to);
    setForm1({
      name:        f.name        ?? (s.name || ''),
      instruments: f.instruments ?? (s.instruments || []),
      frequency:   f.frequency   ?? (s.frequency || '1d'),
      date_from:   f.date_from   ?? df ?? twoYearsAgo(),
      date_to:     f.date_to     ?? dt ?? todayStr(),
      capital:     f.capital     ?? String(s.capital ?? 10000),
    });
    setStrategyPrompt(d.strategyPrompt ?? (s.strategy_prompt || ''));
    setStopLoss(d.stopLoss ?? (s.rules?.stopLoss ? String(+(s.rules.stopLoss * 100).toFixed(1)) : '3'));
    setTakeProfit(d.takeProfit ?? (s.rules?.takeProfit ? String(+(s.rules.takeProfit * 100).toFixed(1)) : '8'));
    setRules(d.rules ?? s.rules ?? null);
    setAiInterpretation(d.rules?.interpretation ? d.rules : s.rules?.interpretation ? s.rules : null);
    setAiSuggestions([]); setAiQuestions([]);
    setOhlcvMap({}); setOhlcvTab(''); setOhlcvErrors({});
    setRunError('');
  }

  function selectStrategy(s) {
    setSelectedId(s.id);
    const draft = loadDraft(s.id);
    setHasDraft(!!draft);
    populateForm(s, draft);
    setStep(1);
    setShowResults(s.status === 'done' && !draft);
  }

  async function createNew() {
    setSaving(true);
    try {
      const { data } = await api.post('/backtest/strategies', {
        name: 'Untitled Strategy', instruments: [], frequency: '1d',
        date_from: twoYearsAgo(), date_to: todayStr(), capital: 10000,
      });
      setStrategies(prev => [data, ...prev]);
      setSelectedId(data.id);
      setForm1({ name: 'Untitled Strategy', instruments: [], frequency: '1d', date_from: twoYearsAgo(), date_to: todayStr(), capital: '10000' });
      setStrategyPrompt('');
      setRules(null); setAiInterpretation(null);
      setAiSuggestions([]); setAiQuestions([]);
      setOhlcvMap({}); setOhlcvTab(''); setRunError('');
      setStep(1); setShowResults(false); setHasDraft(false);
    } finally { setSaving(false); }
  }

  async function deleteStrategy(id) {
    await api.delete(`/backtest/strategies/${id}`);
    clearDraft(id);
    setStrategies(prev => prev.filter(s => s.id !== id));
    if (selectedId === id) { setSelectedId(null); setShowResults(false); setHasDraft(false); }
    setConfirmDelete(null);
  }

  function handleDiscard() {
    if (!selectedId || !selected) return;
    clearDraft(selectedId);
    setHasDraft(false);
    populateForm(selected, null);
  }

  function handleResetPrompts() {
    if (!selectedId) return;
    if (strategyPrompt.trim() || rules) {
      if (!confirm('Clear strategy text, AI suggestions, and parsed rules?')) return;
    }
    setStrategyPrompt('');
    setRules(null);
    setAiInterpretation(null);
    setAiSuggestions([]);
    setAiQuestions([]);
    setAiError('');
    setStopLoss('3');
    setTakeProfit('8');
    setRunError('');
    if (selectedId) {
      saveDraft(selectedId, {
        form1,
        strategyPrompt: '',
        stopLoss: '3',
        takeProfit: '8',
        rules: null,
      });
      setHasDraft(true);
    }
  }

  // ── OHLCV multi-fetch ────────────────────────────────────────────────────────
  async function fetchOhlcvAll() {
    if (!form1.instruments.length) return;
    setOhlcvLoading(true); setOhlcvErrors({});
    try {
      const { data } = await api.post('/backtest/ohlcv/multi', {
        symbols: form1.instruments,
        from: form1.date_from, to: form1.date_to, interval: form1.frequency,
      });
      const { mapped, mappedErr } = buildOhlcvMapFromMultiResponse(form1.instruments, data.data || {}, data.errors || {});
      setOhlcvMap(mapped);
      setOhlcvErrors(mappedErr);
      const first = form1.instruments.find((s) => mapped[s]?.length);
      if (first) setOhlcvTab(first);
    } catch (e) {
      setOhlcvErrors({ _: e.response?.data?.error || 'Failed to fetch data' });
    } finally { setOhlcvLoading(false); }
  }

  // ── Step navigation ──────────────────────────────────────────────────────────
  async function goStep2() {
    if (!selectedId) return;
    setSaving(true);
    try {
      const { data } = await api.patch(`/backtest/strategies/${selectedId}`, {
        name: form1.name || 'Untitled Strategy',
        instruments: form1.instruments, frequency: form1.frequency,
        date_from: form1.date_from, date_to: form1.date_to,
        capital: parseFloat(form1.capital) || 10000,
      });
      setStrategies(prev => prev.map(s => s.id === data.id ? { ...s, ...data } : s));
      setStep(2);
    } finally { setSaving(false); }
  }

  // ── AI calls ─────────────────────────────────────────────────────────────────
  async function callAI(letAiDecide = false) {
    startAiAnim();
    try {
      const { data } = await api.post('/backtest/ai/parse-rules', {
        dataPrompt: form1.instruments.join(', ') || 'Indian NSE stocks',
        strategyPrompt,
        entryPrompt: '',
        exitPrompt: '',
        letAiDecide,
      });
      if (!data.rules) throw new Error('No rules returned from AI');
      const slUser = parseFloat(stopLoss);
      const tpUser = parseFloat(takeProfit);
      const r = {
        ...data.rules,
        stopLoss:   (slUser > 0 ? slUser / 100 : null) ?? data.rules.stopLoss ?? 0.03,
        takeProfit: (tpUser > 0 ? tpUser / 100 : null) ?? data.rules.takeProfit ?? 0.08,
      };
      setRules(r);
      setAiInterpretation(r);
      setAiSuggestions(data.suggestions || []);
      setAiQuestions(data.questions || []);
      if (letAiDecide || data.enhancedStrategyPrompt) {
        if (data.enhancedStrategyPrompt) setStrategyPrompt(data.enhancedStrategyPrompt);
        if (r.stopLoss)   setStopLoss(String(+(r.stopLoss * 100).toFixed(1)));
        if (r.takeProfit) setTakeProfit(String(+(r.takeProfit * 100).toFixed(1)));
      }
    } catch (e) {
      console.error(e);
      setAiError(e.response?.data?.error || e.message || 'AI failed — try again');
    }
    finally { stopAiAnim(); }
  }

  // ── Run backtest (uses Step 1 ohlcvMap only — no refetch) ─────────────────────
  async function runBacktest() {
    if (!selectedId || !rules) return;
    const missing = form1.instruments.filter((s) => !ohlcvMap[s]?.length);
    if (!form1.instruments.length) {
      setRunError('Add instruments in Step 1 first.');
      return;
    }
    if (missing.length) {
      setRunError(`Fetch OHLCV in Step 1 for: ${missing.join(', ')} — then run again.`);
      return;
    }
    setRunError('');
    startRunAnim();
    try {
      await api.patch(`/backtest/strategies/${selectedId}`, {
        strategy_prompt: strategyPrompt,
        entry_prompt: '',
        exit_prompt: '',
        rules: { ...rules, stopLoss: parseFloat(stopLoss)/100, takeProfit: parseFloat(takeProfit)/100 },
      });
      const { data } = await api.post(`/backtest/strategies/${selectedId}/run`, {
        ohlcvData: ohlcvMap,
      });
      setStrategies(prev => prev.map(s => s.id === data.id ? data : s));
      clearDraft(selectedId);
      setHasDraft(false);
      setShowResults(true);
    } catch (e) {
      setRunError(e.response?.data?.error || 'Backtest failed');
    } finally { stopRunAnim(); }
  }

  async function reloadStrategy(id) {
    try {
      const { data } = await api.get(`/backtest/strategies/${id}`);
      setStrategies(prev => prev.map(s => s.id === data.id ? { ...s, ...data } : s));
      return data;
    } catch { return null; }
  }

  /** Leave results: reload strategy from server, restore form + OHLCV (fixes date range + prompts). */
  async function handleEditFromResults() {
    if (!selectedId) return;
    const row = await reloadStrategy(selectedId);
    if (!row) return;
    clearDraft(selectedId);
    setHasDraft(false);
    populateForm(row, null);
    setShowResults(false);
    setStep(1);
    setRunError('');

    const instruments = row.instruments || [];
    const from = formatDateForInput(row.date_from);
    const to = formatDateForInput(row.date_to);
    const frequency = row.frequency || '1d';
    if (instruments.length && from && to) {
      setOhlcvLoading(true);
      setOhlcvErrors({});
      try {
        const { data } = await api.post('/backtest/ohlcv/multi', {
          symbols: instruments,
          from,
          to,
          interval: frequency,
        });
        const { mapped, mappedErr } = buildOhlcvMapFromMultiResponse(
          instruments,
          data.data || {},
          data.errors || {}
        );
        setOhlcvMap(mapped);
        setOhlcvErrors(mappedErr);
        const first = instruments.find((s) => mapped[s]?.length);
        if (first) setOhlcvTab(first);
      } catch (e) {
        setOhlcvErrors({ _: e.response?.data?.error || 'Failed to refresh OHLCV' });
        setOhlcvMap({});
      } finally {
        setOhlcvLoading(false);
      }
    } else {
      setOhlcvMap({});
      setOhlcvTab('');
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sub-tabs */}
      <div className="flex items-center gap-1 px-4 pt-4 pb-0 shrink-0">
        {SUB_TABS.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to}
            className={({ isActive }) =>
              `flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-body transition-all border-b-2 ${
                isActive ? 'text-accent border-accent bg-accent/5' : 'text-muted border-transparent hover:text-soft'
              }`}>
            <Icon size={15} />{label}
          </NavLink>
        ))}
      </div>
      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} className="shrink-0" />

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <div className="w-56 shrink-0 flex flex-col border-r border-white/5 overflow-hidden">
          <div className="p-3 border-b border-white/5 shrink-0">
            <button onClick={createNew} disabled={saving}
              className="btn-primary w-full justify-center flex gap-2 text-sm py-2">
              <Plus size={14} /> New Strategy
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-muted" /></div>
            ) : strategies.length === 0 ? (
              <p className="text-muted text-xs text-center py-8">No strategies yet</p>
            ) : strategies.map(s => (
              <div key={s.id} onClick={() => selectStrategy(s)}
                className={`group relative p-2.5 rounded-xl cursor-pointer transition-all ${
                  selectedId === s.id
                    ? 'bg-accent/8 border border-accent/20'
                    : 'hover:bg-white/[0.04] border border-transparent'
                }`}>
                <div className="flex items-start justify-between gap-1">
                  <p className="text-xs font-medium text-white truncate flex-1">{s.name}</p>
                  <button onClick={e => { e.stopPropagation(); setConfirmDelete(s.id); }}
                    className="opacity-0 group-hover:opacity-100 text-muted hover:text-red-400 transition-all p-0.5 shrink-0">
                    <Trash2 size={11} />
                  </button>
                </div>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <StatusBadge status={s.status} />
                  {s.status === 'done' && s.stats?.totalReturn != null && (
                    <span className={`text-[10px] font-mono ${s.stats.totalReturn >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {fmtPct(s.stats.totalReturn)}
                    </span>
                  )}
                  {loadDraft(s.id) && (
                    <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-amber-500/15 text-amber-400">draft</span>
                  )}
                </div>
                {s.instruments?.length > 0 && (
                  <p className="text-[10px] text-muted mt-1 truncate font-mono">{s.instruments.join(', ')}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right panel */}
        <div className="flex-1 overflow-y-auto">
          {!selectedId ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-4">
                <TrendingUp size={24} className="text-accent" />
              </div>
              <p className="text-soft font-display font-bold mb-1">No strategy selected</p>
              <p className="text-muted text-sm">Create a new strategy or select one from the list</p>
            </div>
          ) : showResults && selected?.status === 'done' ? (
            <ResultsPanel
              strategyId={selectedId}
              strategies={strategies}
              onEdit={handleEditFromResults}
              onReload={reloadStrategy}
            />
          ) : (
            <WizardPanel
              step={step} setStep={setStep}
              form1={form1} setForm1={setForm1}
              strategyPrompt={strategyPrompt} setStrategyPrompt={setStrategyPrompt}
              stopLoss={stopLoss} setStopLoss={setStopLoss}
              takeProfit={takeProfit} setTakeProfit={setTakeProfit}
              rules={rules}
              aiInterpretation={aiInterpretation}
              aiSuggestions={aiSuggestions}
              aiQuestions={aiQuestions}
              aiActive={aiActive} aiStep={aiStep} aiError={aiError}
              ohlcvMap={ohlcvMap} ohlcvTab={ohlcvTab} setOhlcvTab={setOhlcvTab}
              ohlcvLoading={ohlcvLoading} ohlcvErrors={ohlcvErrors}
              saving={saving} running={running} runStep={runStep} runError={runError}
              hasDraft={hasDraft}
              onFetchOhlcv={fetchOhlcvAll}
              onCallAI={callAI}
              onGoStep2={goStep2}
              onRun={runBacktest}
              canRun={form1.instruments.length > 0 && form1.instruments.every((s) => !!ohlcvMap[s]?.length)}
              onDiscard={handleDiscard}
              onResetPrompts={handleResetPrompts}
            />
          )}
        </div>
      </div>

      {/* Delete modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="card p-6 max-w-sm w-full mx-4 space-y-4">
            <p className="text-white font-display font-bold">Delete strategy?</p>
            <p className="text-muted text-sm">This permanently deletes the strategy and all results.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="btn-ghost flex-1 justify-center flex">Cancel</button>
              <button onClick={() => deleteStrategy(confirmDelete)}
                className="flex-1 justify-center flex px-4 py-2 rounded-xl text-sm font-medium bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Wizard ───────────────────────────────────────────────────────────────────
function WizardPanel({
  step, setStep, form1, setForm1,
  strategyPrompt, setStrategyPrompt,
  stopLoss, setStopLoss, takeProfit, setTakeProfit,
  rules, aiInterpretation, aiSuggestions, aiQuestions,
  aiActive, aiStep, aiError,
  ohlcvMap, ohlcvTab, setOhlcvTab, ohlcvLoading, ohlcvErrors,
  saving, running, runStep, runError, hasDraft,
  onFetchOhlcv, onCallAI, onGoStep2, onRun, onDiscard,
  onResetPrompts,
  canRun,
}) {
  const STEPS = ['Data Setup', 'Strategy'];
  const ohlcvSymbols = Object.keys(ohlcvMap);

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
        <p className="text-sm font-display font-semibold text-white flex items-center gap-2">
          <Lightbulb size={16} className="text-accent shrink-0" />
          How strategy creation works
        </p>
        <ol className="text-xs text-soft space-y-2.5 list-decimal pl-4 leading-relaxed marker:text-muted">
          <li>
            <span className="text-white font-medium">Data setup</span>
            {' — '}Give the strategy a name, add tickers, choose date range, bar size (e.g. 1d), and starting capital. Tap{' '}
            <strong className="text-soft">Fetch &amp; Preview Data</strong> for every symbol. The simulator only uses this OHLCV (nothing is re-downloaded at run time).
          </li>
          <li>
            <span className="text-white font-medium">Strategy</span>
            {' — '}Write your full idea in one place: when to buy, when to sell, indicators, risk. Use{' '}
            <strong className="text-soft">Let AI Decide</strong> for a complete draft, or <strong className="text-soft">AI Parse Strategy</strong> to turn your text into rules. Adjust stop loss / take profit, check the parsed rules, then <strong className="text-soft">Run Backtest</strong>.
          </li>
          <li>
            <span className="text-white font-medium">Results</span>
            {' — '}Review combined and per-symbol stats, trades, and price charts with entries/exits. <strong className="text-soft">Edit Strategy</strong> returns you here to change prompts and re-run.
          </li>
        </ol>
      </div>

      {/* Draft banner */}
      {hasDraft && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <Save size={13} className="text-amber-400 shrink-0" />
          <span className="text-amber-300 text-xs flex-1">Unsaved draft — auto-saved locally</span>
          <button onClick={onDiscard} className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors">
            <RotateCcw size={11} /> Discard
          </button>
        </div>
      )}

      {/* Stepper */}
      <div className="flex items-start">
        {STEPS.map((label, i) => {
          const n = i + 1; const active = step === n; const done = step > n;
          return (
            <div key={n} className="flex items-center flex-1">
              <div className="flex flex-col items-center gap-1 shrink-0">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                  done ? 'bg-accent border-accent text-ink' : active ? 'border-accent text-accent bg-accent/10' : 'border-white/15 text-muted'
                }`}>
                  {done ? <Check size={13} /> : n}
                </div>
                <span className={`text-[10px] font-mono whitespace-nowrap ${active ? 'text-accent' : done ? 'text-soft' : 'text-muted'}`}>{label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-px mx-2 mb-3.5 ${step > n ? 'bg-accent/50' : 'bg-white/10'}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* ── Step 1 ── */}
      {step === 1 && (
        <div className="space-y-5">
          <div className="space-y-1.5">
            <label className="label">Strategy Name</label>
            <input className="input" value={form1.name}
              onChange={e => setForm1(f => ({ ...f, name: e.target.value }))} placeholder="My RSI Strategy" />
          </div>
          <div className="space-y-1.5">
            <label className="label">Instruments</label>
            <InstrumentInput value={form1.instruments} onChange={v => setForm1(f => ({ ...f, instruments: v }))} />
          </div>
          <div className="space-y-1.5">
            <label className="label">Frequency</label>
            <div className="flex flex-wrap gap-1.5">
              {['1m','5m','15m','30m','1h','1d','1wk'].map(f => (
                <button key={f} type="button" onClick={() => setForm1(p => ({ ...p, frequency: f }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
                    form1.frequency === f
                      ? 'bg-accent/20 border border-accent/40 text-accent'
                      : 'bg-white/5 border border-white/10 text-muted hover:text-soft'
                  }`}>{f}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="label">From</label>
              <input type="date" className="input" value={form1.date_from}
                onChange={e => setForm1(f => ({ ...f, date_from: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="label">To</label>
              <input type="date" className="input" value={form1.date_to}
                onChange={e => setForm1(f => ({ ...f, date_to: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="label">Starting Capital (₹)</label>
            <input type="number" className="input" value={form1.capital}
              onChange={e => setForm1(f => ({ ...f, capital: e.target.value }))} placeholder="10000" />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onFetchOhlcv} disabled={ohlcvLoading || !form1.instruments.length}
              className="btn-ghost flex items-center gap-2 text-sm">
              {ohlcvLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Fetch & Preview Data
            </button>
            {ohlcvSymbols.length > 0 && (
              <span className="text-xs text-emerald-400 font-mono">
                {ohlcvSymbols.length} symbol{ohlcvSymbols.length > 1 ? 's' : ''} loaded
              </span>
            )}
          </div>
          {Object.keys(ohlcvErrors).length > 0 && (
            <div className="space-y-1">
              {Object.entries(ohlcvErrors).map(([sym, err]) => (
                <p key={sym} className="text-red-400 text-xs font-mono">{sym === '_' ? err : `${sym}: ${err}`}</p>
              ))}
            </div>
          )}

          {/* Multi-symbol OHLCV tabs */}
          {ohlcvSymbols.length > 0 && (
            <div className="space-y-2">
              {/* Tab bar */}
              <div className="flex items-center gap-1 flex-wrap">
                {ohlcvSymbols.map(sym => (
                  <button key={sym} onClick={() => setOhlcvTab(sym)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-all ${
                      ohlcvTab === sym
                        ? 'bg-accent/20 border border-accent/40 text-accent'
                        : 'bg-white/5 border border-white/10 text-muted hover:text-soft'
                    }`}>{sym}</button>
                ))}
              </div>

              {ohlcvTab && ohlcvMap[ohlcvTab] && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted font-mono">
                      {ohlcvTab} — {ohlcvMap[ohlcvTab].length.toLocaleString()} candles
                    </p>
                    <button onClick={() => downloadCsv(ohlcvMap[ohlcvTab], `${ohlcvTab}.csv`)}
                      className="flex items-center gap-1.5 text-xs text-muted hover:text-soft transition-colors font-mono px-2 py-1 rounded-lg hover:bg-white/5">
                      <Download size={12} /> CSV
                    </button>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-white/8">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-white/8">
                          {['Date','Open','High','Low','Close','Volume'].map(h => (
                            <th key={h} className="text-left px-3 py-2 text-muted font-mono font-normal">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {ohlcvMap[ohlcvTab].slice(-10).map((r, i) => (
                          <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02]">
                            <td className="px-3 py-1.5 font-mono text-muted">{r.date}</td>
                            <td className="px-3 py-1.5 font-mono text-soft">{r.open}</td>
                            <td className="px-3 py-1.5 font-mono text-emerald-400">{r.high}</td>
                            <td className="px-3 py-1.5 font-mono text-red-400">{r.low}</td>
                            <td className="px-3 py-1.5 font-mono text-white font-medium">{r.close}</td>
                            <td className="px-3 py-1.5 font-mono text-muted">{(r.volume||0).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button onClick={onGoStep2} disabled={saving}
              className="btn-primary flex items-center gap-2">
              {saving && <Loader2 size={14} className="animate-spin" />}
              Next: Strategy <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Strategy ── */}
      {step === 2 && (
        <div className="space-y-5">
          <div className={`rounded-xl border px-4 py-3 text-xs ${Object.keys(ohlcvMap).length >= form1.instruments.length && form1.instruments.every(s => ohlcvMap[s]?.length)
            ? 'border-emerald-500/25 bg-emerald-500/5 text-emerald-200/90'
            : 'border-amber-500/25 bg-amber-500/8 text-amber-200/90'}`}>
            <p className="font-medium text-white/90 mb-1">Uses Step 1 data only</p>
            <p className="text-muted leading-relaxed">
              The backtest runs on the OHLCV you fetched in Data Setup — it does not download prices again.
              If parsed rules reference fields that are not on that dataset, Run will ask Claude once whether they can be computed from OHLCV (and add indicators or fix names when possible — uses your key from Settings).
              {!form1.instruments.every(s => ohlcvMap[s]?.length) && (
                <> Go back to Step 1 and click <strong className="text-soft">Fetch &amp; Preview Data</strong> for every instrument.</>
              )}
            </p>
          </div>

          {/* Let AI Decide — prominent at top */}
          <div className="flex items-center gap-3 p-4 rounded-xl bg-violet-500/8 border border-violet-500/20">
            <Wand2 size={16} className="text-violet-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-violet-200 font-medium">Let AI build your strategy</p>
              <p className="text-xs text-violet-400/70 mt-0.5">AI will fill all fields — you can edit before running</p>
            </div>
            <button onClick={() => onCallAI(true)} disabled={aiActive}
              className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-500/20 border border-violet-500/40 text-violet-200 text-sm font-medium hover:bg-violet-500/30 transition-colors disabled:opacity-50">
              {aiActive ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
              Let AI Decide
            </button>
          </div>

          <AiStatusBar active={aiActive} step={aiStep} error={aiError} />

          {/* Strategy prompt */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <label className="label mb-0">Strategy description</label>
              <button
                type="button"
                onClick={onResetPrompts}
                className="flex items-center gap-1.5 text-xs text-muted hover:text-soft px-2.5 py-1.5 rounded-lg border border-white/10 hover:bg-white/[0.04] transition-colors shrink-0"
              >
                <RotateCcw size={12} /> Reset prompts
              </button>
            </div>
            <p className="text-[11px] text-muted -mt-0.5">Include entries, exits, indicators, and risk in this one box — AI will infer structured rules.</p>
            <textarea className="input min-h-[120px] resize-none" value={strategyPrompt}
              onChange={e => setStrategyPrompt(e.target.value)}
              placeholder="Example: Go long when RSI(14) is below 30 and close is above the 50-day SMA. Exit when RSI rises above 65 or stop −3% / target +8%." />
          </div>

          {/* Risk params */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="label">Stop Loss (%)</label>
              <input type="number" className="input" value={stopLoss}
                onChange={e => setStopLoss(e.target.value)} placeholder="3" />
            </div>
            <div className="space-y-1.5">
              <label className="label">Take Profit (%)</label>
              <input type="number" className="input" value={takeProfit}
                onChange={e => setTakeProfit(e.target.value)} placeholder="8" />
            </div>
          </div>

          {/* AI Parse button */}
          <button onClick={() => onCallAI(false)}
            disabled={aiActive || !strategyPrompt.trim()}
            className="btn-ghost flex items-center gap-2 text-sm">
            <Sparkles size={14} className="text-purple-400" />
            AI Parse Strategy
          </button>

          {/* AI interpretation */}
          {aiInterpretation?.interpretation && (
            <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles size={13} className="text-purple-400" />
                <span className="text-xs text-purple-300 font-semibold uppercase tracking-wider">AI Interpretation</span>
              </div>
              <p className="text-sm text-soft">{aiInterpretation.interpretation}</p>
              {aiInterpretation.indicators?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {aiInterpretation.indicators.map((ind, i) => (
                    <span key={i} className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-white/8 text-soft border border-white/10">
                      {ind.name.toUpperCase()}({ind.period})
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Suggestions */}
          {aiSuggestions.length > 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Lightbulb size={13} className="text-amber-400" />
                <span className="text-xs text-amber-300 font-semibold uppercase tracking-wider">Suggestions</span>
              </div>
              {aiSuggestions.map((s, i) => (
                <p key={i} className="text-sm text-soft flex gap-2"><span className="text-amber-400 shrink-0">•</span>{s}</p>
              ))}
            </div>
          )}

          {/* Questions */}
          {aiQuestions.length > 0 && (
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <MessageSquare size={13} className="text-blue-400" />
                <span className="text-xs text-blue-300 font-semibold uppercase tracking-wider">AI needs more info</span>
              </div>
              {aiQuestions.map((q, i) => (
                <p key={i} className="text-sm text-soft flex gap-2"><span className="text-blue-400 shrink-0">?</span>{q}</p>
              ))}
            </div>
          )}

          {/* Parsed rules preview */}
          {rules && (
            <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4 space-y-2 font-mono text-xs">
              <p className="text-[10px] text-muted uppercase tracking-wider mb-2">Parsed Rules</p>
              {rules.interpretation && (
                <p className="text-soft italic text-xs mb-2">{rules.interpretation}</p>
              )}
              <p className="text-muted">ENTRY: <span className="text-emerald-400">
                {rules.entry?.long?.map(r => `${r.left} ${r.op} ${r.right}`).join(' AND ') || '—'}
              </span></p>
              <p className="text-muted">EXIT: <span className="text-red-400">
                {rules.exit?.long?.map(r => `${r.left} ${r.op} ${r.right}`).join(' OR ') || '—'}
              </span></p>
              <p className="text-muted">
                STOP: <span className="text-amber-400">{rules.stopLoss ? `-${(rules.stopLoss*100).toFixed(1)}%` : '—'}</span>
                {'  '}TARGET: <span className="text-emerald-400">{rules.takeProfit ? `+${(rules.takeProfit*100).toFixed(1)}%` : '—'}</span>
              </p>
              {rules.indicators?.length > 0 && (
                <p className="text-muted">INDICATORS: <span className="text-soft">
                  {rules.indicators.map(ind => `${ind.name.toUpperCase()}(${ind.period})`).join(', ')}
                </span></p>
              )}
            </div>
          )}

          {/* Run status */}
          <RunStatusBar active={running} step={runStep} />

          {runError && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-red-400 text-sm">{runError}</p>
            </div>
          )}

          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(1)} disabled={running} className="btn-ghost flex items-center gap-2 text-sm disabled:opacity-40">
              <ArrowLeft size={14} /> Back
            </button>
            <button onClick={onRun} disabled={running || !rules || !canRun}
              className="btn-primary flex items-center gap-2 disabled:opacity-50"
              title={!canRun ? 'Fetch Step 1 data for all instruments first' : ''}>
              {running
                ? <><Loader2 size={14} className="animate-spin" /> Running…</>
                : <><Play size={14} /> Run Backtest ({form1.capital ? `₹${parseInt(form1.capital).toLocaleString('en-IN')}` : '₹10,000'})</>
              }
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Results ──────────────────────────────────────────────────────────────────
function thinSeries(arr, maxPts = 450) {
  if (!arr?.length || arr.length <= maxPts) return arr || [];
  const step = Math.ceil(arr.length / maxPts);
  return arr.filter((_, i) => i % step === 0);
}

function ResultsPanel({ strategyId, strategies, onEdit, onReload }) {
  const [fullData, setFullData] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [tradeTab, setTradeTab] = useState('trades');
  const [instTab, setInstTab]   = useState('all');
  const [rulesCopied, setRulesCopied] = useState(false);

  useEffect(() => {
    setLoading(true);
    setInstTab('all');
    onReload(strategyId).then(data => { setFullData(data); setLoading(false); });
  }, [strategyId]);

  if (loading) return <div className="flex items-center justify-center h-48"><Loader2 size={20} className="animate-spin text-muted" /></div>;
  if (!fullData?.results) return <div className="p-8 text-muted text-center">No results data</div>;

  const { stats: r, equityCurve, trades, bySymbol } = fullData.results;
  const symKeys = bySymbol && typeof bySymbol === 'object' ? Object.keys(bySymbol) : [];
  const activeSym = instTab !== 'all' && bySymbol?.[instTab] ? instTab : null;
  const rView = activeSym ? bySymbol[instTab].stats : r;
  const tradesView = activeSym ? (bySymbol[instTab].trades || []) : (trades || []);

  const chartData = equityCurve?.length > 200
    ? equityCurve.filter((_, i) => i % Math.ceil(equityCurve.length / 200) === 0)
    : equityCurve || [];

  const priceSeriesRaw = activeSym ? (bySymbol[instTab].priceSeries || []) : [];
  const priceChartData = thinSeries(priceSeriesRaw).map((p) => ({
    ...p,
    entryMark: p.entry ? p.close : null,
    exitMark: p.exit ? p.close : null,
  }));

  const rulesJson = fullData.rules != null ? JSON.stringify(fullData.rules, null, 2) : '';
  async function copyRulesJson() {
    if (!rulesJson) return;
    try {
      await navigator.clipboard.writeText(rulesJson);
      setRulesCopied(true);
      setTimeout(() => setRulesCopied(false), 2000);
    } catch { /* ignore */ }
  }

  const statCards = [
    { label: 'Total Return',  value: fmtPct(rView.totalReturn),    color: rView.totalReturn >= 0 ? 'text-emerald-400' : 'text-red-400' },
    { label: 'CAGR',          value: fmtPct(rView.cagr),           color: rView.cagr >= 0 ? 'text-emerald-400' : 'text-red-400' },
    { label: 'Max Drawdown',  value: fmtPct(rView.maxDrawdown),    color: 'text-red-400' },
    { label: 'Sharpe Ratio',  value: fmtNum(rView.sharpe),         color: 'text-white' },
    { label: 'Win Rate',      value: fmtPct(rView.winRate),        color: rView.winRate >= 50 ? 'text-emerald-400' : 'text-amber-400' },
    { label: 'Profit Factor', value: fmtNum(rView.profitFactor),   color: rView.profitFactor >= 1 ? 'text-emerald-400' : 'text-red-400' },
    { label: 'Total Trades',  value: rView.totalTrades,            color: 'text-white' },
    { label: 'Final Capital', value: fmtCurrency(rView.finalCapital), color: 'text-white' },
  ];

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-white font-display font-bold text-lg">{fullData.name}</h2>
          <p className="text-muted text-sm font-mono mt-0.5">
            {formatDateForInput(fullData.date_from) || fullData.date_from} → {formatDateForInput(fullData.date_to) || fullData.date_to} · {fullData.instruments?.join(', ')} · {fullData.frequency}
          </p>
          <p className="text-[11px] text-muted mt-1">
            Capital is split equally across instruments; each sleeve is backtested independently on the same Step 1 OHLCV.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button onClick={() => downloadCsv(trades, `${fullData.name}_trades.csv`)}
            className="btn-ghost text-sm flex items-center gap-1.5 shrink-0">
            <Download size={13} /> Trades CSV
          </button>
          <button
            type="button"
            onClick={() => { void onEdit(); }}
            className="btn-primary text-sm shrink-0 flex items-center gap-1.5">
            <Pencil size={13} /> Edit strategy
          </button>
        </div>
      </div>

      {(fullData.strategy_prompt || rulesJson) && (
        <div className="card p-4 space-y-3 border border-violet-500/15 bg-violet-500/[0.03]">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-violet-200 uppercase tracking-wider font-mono">AI implementation</p>
              <p className="text-[11px] text-muted mt-0.5">Structured rules JSON the simulator runs (indicators, entry/exit, risk).</p>
            </div>
            {rulesJson && (
              <button
                type="button"
                onClick={() => void copyRulesJson()}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-white/10 text-soft hover:bg-white/[0.06] transition-colors shrink-0"
              >
                {rulesCopied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                {rulesCopied ? 'Copied' : 'Copy JSON'}
              </button>
            )}
          </div>
          {fullData.strategy_prompt ? (
            <div className="rounded-lg bg-black/30 border border-white/8 p-3">
              <p className="text-[10px] text-muted uppercase tracking-wider font-mono mb-1">Saved strategy text</p>
              <p className="text-xs text-soft whitespace-pre-wrap leading-relaxed">{fullData.strategy_prompt}</p>
            </div>
          ) : null}
          {rulesJson ? (
            <pre className="text-[11px] font-mono text-emerald-200/90 bg-black/40 border border-white/8 rounded-lg p-3 overflow-x-auto max-h-[min(420px,50vh)] overflow-y-auto leading-relaxed">
              {rulesJson}
            </pre>
          ) : (
            <p className="text-xs text-muted">No rules JSON stored for this run.</p>
          )}
        </div>
      )}

      {symKeys.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[10px] text-muted font-mono uppercase tracking-wider mr-1">Report</span>
          <button
            type="button"
            onClick={() => setInstTab('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
              instTab === 'all' ? 'bg-accent/20 border border-accent/40 text-accent' : 'bg-white/5 border border-white/10 text-muted hover:text-soft'
            }`}
          >
            Combined
          </button>
          {symKeys.map((sym) => (
            <button
              key={sym}
              type="button"
              onClick={() => setInstTab(sym)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all max-w-[200px] truncate ${
                instTab === sym ? 'bg-violet-500/20 border border-violet-400/40 text-violet-200' : 'bg-white/5 border border-white/10 text-muted hover:text-soft'
              }`}
            >
              {sym}
            </button>
          ))}
        </div>
      )}

      {activeSym && (
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 px-4 py-3 text-sm text-violet-100/90">
          <span className="text-muted text-xs font-mono uppercase tracking-wider">Allocated to this instrument</span>
          <p className="text-white font-display font-bold text-lg mt-0.5">
            {fmtCurrency(bySymbol[instTab].allocatedCapital)}
          </p>
          <p className="text-xs text-muted mt-1">From total initial {fmtCurrency(r.initialCapital)} · {symKeys.length} sleeve{symKeys.length !== 1 ? 's' : ''}</p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {statCards.map(({ label, value, color }) => (
          <div key={`${instTab}-${label}`} className="card p-3">
            <p className="text-[10px] text-muted uppercase tracking-wider font-mono">{label}</p>
            <p className={`text-lg font-display font-bold mt-0.5 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {instTab === 'all' && chartData.length > 0 && (
        <div className="card p-4">
          <p className="text-xs text-muted uppercase tracking-wider font-mono mb-3">Combined equity (sum of sleeves)</p>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false}
                tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} width={48} />
              <Tooltip
                contentStyle={{ background: '#0d0f1a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10 }}
                labelStyle={{ color: '#9ca3af', fontSize: 11 }}
                formatter={(v, name) => [name === 'equity' ? fmtCurrency(v) : `${(+v).toFixed(1)}%`, name === 'equity' ? 'Equity' : 'Drawdown']}
              />
              <Area type="monotone" dataKey="equity" stroke="#34d399" strokeWidth={1.5} fill="url(#eqGrad)" dot={false} />
              <Bar dataKey="drawdown" fill="#f87171" opacity={0.4} radius={[2,2,0,0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {activeSym && priceChartData.length > 0 && (
        <div className="card p-4">
          <p className="text-xs text-muted uppercase tracking-wider font-mono mb-1">{instTab} — price & signals</p>
          <p className="text-[10px] text-muted mb-3">Green = entry day close · Red = exit day close</p>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={priceChartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 9 }} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} domain={['auto', 'auto']} width={52} />
              <Tooltip
                contentStyle={{ background: '#0d0f1a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10 }}
                labelStyle={{ color: '#9ca3af', fontSize: 11 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="close" name="Close" stroke="#60a5fa" dot={false} strokeWidth={1.5} connectNulls />
              <Scatter dataKey="entryMark" name="Entry" fill="#34d399" />
              <Scatter dataKey="exitMark" name="Exit" fill="#f87171" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="flex border-b border-white/8">
          {[['trades','Trade Log'], ['stats','Full Stats']].map(([key, label]) => (
            <button key={key} type="button" onClick={() => setTradeTab(key)}
              className={`px-4 py-3 text-xs font-mono transition-colors border-b-2 -mb-px ${
                tradeTab === key ? 'text-accent border-accent' : 'text-muted border-transparent hover:text-soft'
              }`}>{label}{activeSym ? ` (${instTab})` : ''}</button>
          ))}
        </div>

        {tradeTab === 'trades' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/8">
                  {['Symbol','Side','Entry Date','Entry ₹','Exit Date','Exit ₹','P&L','Return','Exit Reason'].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 text-muted font-mono font-normal whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!tradesView?.length && <tr><td colSpan={9} className="px-3 py-8 text-center text-muted">No trades executed</td></tr>}
                {tradesView?.map((t, i) => (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="px-3 py-2 font-mono text-white">{t.symbol}</td>
                    <td className="px-3 py-2 font-mono"><span className={t.side === 'long' ? 'text-emerald-400' : 'text-red-400'}>{t.side}</span></td>
                    <td className="px-3 py-2 font-mono text-muted">{t.entryDate}</td>
                    <td className="px-3 py-2 font-mono text-soft">{t.entryPrice?.toFixed(2)}</td>
                    <td className="px-3 py-2 font-mono text-muted">{t.exitDate || '—'}</td>
                    <td className="px-3 py-2 font-mono text-soft">{t.exitPrice?.toFixed(2) || '—'}</td>
                    <td className={`px-3 py-2 font-mono font-medium ${(t.pnl||0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {(t.pnl||0) >= 0 ? '+' : ''}₹{Math.round(t.pnl||0)}
                    </td>
                    <td className={`px-3 py-2 font-mono ${(t.pnlPct||0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {(t.pnlPct||0) >= 0 ? '+' : ''}{(t.pnlPct||0).toFixed(2)}%
                    </td>
                    <td className="px-3 py-2 font-mono text-muted text-[10px]">{t.exitReason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tradeTab === 'stats' && (
          <div className="p-4 grid grid-cols-2 gap-0">
            {[
              ['Initial Capital',  fmtCurrency(rView.initialCapital)],
              ['Final Capital',    fmtCurrency(rView.finalCapital)],
              ['Total Return',     fmtPct(rView.totalReturn)],
              ['CAGR',             fmtPct(rView.cagr)],
              ['Max Drawdown',     fmtPct(rView.maxDrawdown)],
              ['Sharpe Ratio',     fmtNum(rView.sharpe)],
              ['Win Rate',         fmtPct(rView.winRate)],
              ['Profit Factor',    fmtNum(rView.profitFactor)],
              ['Total Trades',     rView.totalTrades],
              ['Avg Hold Days',    rView.avgTradeDays],
              ['Gross Profit',     fmtCurrency(rView.grossProfit)],
              ['Gross Loss',       fmtCurrency(rView.grossLoss)],
            ].map(([k, v]) => (
              <div key={`${instTab}-${k}`} className="flex justify-between items-center px-3 py-2.5 border-b border-white/5 last:border-0">
                <span className="text-xs text-muted font-mono">{k}</span>
                <span className="text-xs text-soft font-mono font-medium">{v}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
