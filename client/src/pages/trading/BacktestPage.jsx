import { useState, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import {
  TrendingUp, BarChart2, Plus, X, Trash2, Play, Sparkles,
  Loader2, AlertCircle, RefreshCw, ArrowRight, ArrowLeft, Check,
} from 'lucide-react';
import {
  ComposedChart, Area, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import api from '../../lib/api';

const SUB_TABS = [
  { to: '/live-trading/backtest',   label: 'Backtest',   icon: TrendingUp },
  { to: '/live-trading/post-trade', label: 'Post-Trade', icon: BarChart2  },
];

function todayStr() { return new Date().toISOString().slice(0, 10); }
function twoYearsAgo() {
  const d = new Date(); d.setFullYear(d.getFullYear() - 2);
  return d.toISOString().slice(0, 10);
}
function fmtPct(v) {
  if (v == null) return '—';
  return `${v >= 0 ? '+' : ''}${(+v).toFixed(1)}%`;
}
function fmtNum(v, d = 2) { return v == null ? '—' : (+v).toFixed(d); }
function fmtCurrency(v) { return v == null ? '—' : `₹${Math.round(v).toLocaleString('en-IN')}`; }

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

function InstrumentInput({ value, onChange }) {
  const [input, setInput] = useState('');
  const add = () => {
    const sym = input.trim().toUpperCase();
    if (!sym || value.includes(sym)) { setInput(''); return; }
    onChange([...value, sym]);
    setInput('');
  };
  return (
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
        className="bg-transparent text-white text-sm outline-none placeholder:text-muted/50 flex-1 min-w-[120px] px-1"
        placeholder="RELIANCE.NS, AAPL… (Enter to add)"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
        onBlur={add}
      />
    </div>
  );
}

export default function BacktestPage() {
  const [strategies, setStrategies]     = useState([]);
  const [loading, setLoading]           = useState(true);
  const [selectedId, setSelectedId]     = useState(null);
  const [step, setStep]                 = useState(1);
  const [showResults, setShowResults]   = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [saving, setSaving]             = useState(false);

  // Step 1
  const [form1, setForm1] = useState({
    name: '', instruments: [], frequency: '1d',
    date_from: twoYearsAgo(), date_to: todayStr(), capital: '10000',
  });
  // Step 2
  const [strategyPrompt, setStrategyPrompt] = useState('');
  const [aiInterpretation, setAiInterpretation] = useState(null);
  const [parsing2, setParsing2] = useState(false);
  // Step 3
  const [entryPrompt, setEntryPrompt]   = useState('');
  const [exitPrompt, setExitPrompt]     = useState('');
  const [stopLoss, setStopLoss]         = useState('3');
  const [takeProfit, setTakeProfit]     = useState('8');
  const [rules, setRules]               = useState(null);
  const [parsing3, setParsing3]         = useState(false);
  // OHLCV
  const [ohlcv, setOhlcv]               = useState(null);
  const [ohlcvLoading, setOhlcvLoading] = useState(false);
  const [ohlcvError, setOhlcvError]     = useState('');
  // Run
  const [running, setRunning]           = useState(false);
  const [runError, setRunError]         = useState('');

  const selected = strategies.find(s => s.id === selectedId) || null;

  const loadStrategies = useCallback(async () => {
    try {
      const { data } = await api.get('/backtest/strategies');
      setStrategies(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadStrategies(); }, [loadStrategies]);

  // Poll running strategies
  useEffect(() => {
    if (!strategies.some(s => s.status === 'running')) return;
    const t = setTimeout(() => loadStrategies(), 2500);
    return () => clearTimeout(t);
  }, [strategies, loadStrategies]);

  function populateForm(s) {
    setForm1({
      name: s.name || '', instruments: s.instruments || [],
      frequency: s.frequency || '1d',
      date_from: s.date_from || twoYearsAgo(),
      date_to: s.date_to || todayStr(),
      capital: String(s.capital || 10000),
    });
    setStrategyPrompt(s.strategy_prompt || '');
    setEntryPrompt(s.entry_prompt || '');
    setExitPrompt(s.exit_prompt || '');
    setRules(s.rules || null);
    setAiInterpretation(s.rules?.interpretation ? s.rules : null);
    setOhlcv(null); setRunError('');
  }

  function selectStrategy(s) {
    setSelectedId(s.id);
    populateForm(s);
    setStep(1);
    setShowResults(s.status === 'done');
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
      setStrategyPrompt(''); setEntryPrompt(''); setExitPrompt('');
      setRules(null); setAiInterpretation(null); setOhlcv(null); setRunError('');
      setStep(1); setShowResults(false);
    } finally { setSaving(false); }
  }

  async function deleteStrategy(id) {
    await api.delete(`/backtest/strategies/${id}`);
    setStrategies(prev => prev.filter(s => s.id !== id));
    if (selectedId === id) { setSelectedId(null); setShowResults(false); }
    setConfirmDelete(null);
  }

  async function fetchOhlcv() {
    const sym = form1.instruments[0];
    if (!sym) { setOhlcvError('Add at least one instrument first'); return; }
    setOhlcvLoading(true); setOhlcvError('');
    try {
      const { data } = await api.get('/backtest/ohlcv', {
        params: { symbol: sym, from: form1.date_from, to: form1.date_to, interval: form1.frequency },
      });
      setOhlcv(data);
    } catch (e) { setOhlcvError(e.response?.data?.error || 'Failed to fetch data'); }
    finally { setOhlcvLoading(false); }
  }

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

  async function parseStrategy() {
    setParsing2(true);
    try {
      const { data } = await api.post('/backtest/ai/parse-rules', {
        dataPrompt: form1.instruments.join(', '),
        strategyPrompt, entryPrompt: '', exitPrompt: '',
      });
      setRules(data.rules);
      setAiInterpretation(data.rules);
    } catch (e) { console.error(e); }
    finally { setParsing2(false); }
  }

  async function goStep3() {
    if (!selectedId) return;
    setSaving(true);
    try {
      const { data } = await api.patch(`/backtest/strategies/${selectedId}`, { strategy_prompt: strategyPrompt });
      setStrategies(prev => prev.map(s => s.id === data.id ? { ...s, ...data } : s));
      setStep(3);
    } finally { setSaving(false); }
  }

  async function parseRules() {
    setParsing3(true);
    try {
      const { data } = await api.post('/backtest/ai/parse-rules', {
        dataPrompt: form1.instruments.join(', '),
        strategyPrompt, entryPrompt, exitPrompt,
      });
      const r = {
        ...data.rules,
        stopLoss: parseFloat(stopLoss) / 100 || data.rules.stopLoss,
        takeProfit: parseFloat(takeProfit) / 100 || data.rules.takeProfit,
      };
      setRules(r); setAiInterpretation(r);
    } catch (e) { console.error(e); }
    finally { setParsing3(false); }
  }

  async function runBacktest() {
    if (!selectedId || !rules) return;
    setRunning(true); setRunError('');
    try {
      await api.patch(`/backtest/strategies/${selectedId}`, {
        entry_prompt: entryPrompt, exit_prompt: exitPrompt,
        rules: { ...rules, stopLoss: parseFloat(stopLoss)/100, takeProfit: parseFloat(takeProfit)/100 },
      });
      const { data } = await api.post(`/backtest/strategies/${selectedId}/run`);
      setStrategies(prev => prev.map(s => s.id === data.id ? data : s));
      setShowResults(true);
    } catch (e) {
      setRunError(e.response?.data?.error || 'Backtest failed');
    } finally { setRunning(false); }
  }

  async function reloadStrategy(id) {
    try {
      const { data } = await api.get(`/backtest/strategies/${id}`);
      setStrategies(prev => prev.map(s => s.id === data.id ? data : s));
      return data;
    } catch { return null; }
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
              onEdit={() => { setShowResults(false); setStep(3); }}
              onReload={reloadStrategy}
            />
          ) : (
            <WizardPanel
              step={step} setStep={setStep}
              form1={form1} setForm1={setForm1}
              strategyPrompt={strategyPrompt} setStrategyPrompt={setStrategyPrompt}
              entryPrompt={entryPrompt} setEntryPrompt={setEntryPrompt}
              exitPrompt={exitPrompt} setExitPrompt={setExitPrompt}
              stopLoss={stopLoss} setStopLoss={setStopLoss}
              takeProfit={takeProfit} setTakeProfit={setTakeProfit}
              rules={rules} aiInterpretation={aiInterpretation}
              ohlcv={ohlcv} ohlcvLoading={ohlcvLoading} ohlcvError={ohlcvError}
              parsing2={parsing2} parsing3={parsing3}
              saving={saving} running={running} runError={runError}
              onFetchOhlcv={fetchOhlcv}
              onParseStrategy={parseStrategy}
              onParseRules={parseRules}
              onGoStep2={goStep2}
              onGoStep3={goStep3}
              onRun={runBacktest}
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
  entryPrompt, setEntryPrompt, exitPrompt, setExitPrompt,
  stopLoss, setStopLoss, takeProfit, setTakeProfit,
  rules, aiInterpretation, ohlcv, ohlcvLoading, ohlcvError,
  parsing2, parsing3, saving, running, runError,
  onFetchOhlcv, onParseStrategy, onParseRules, onGoStep2, onGoStep3, onRun,
}) {
  const STEPS = ['Data Setup', 'Strategy', 'Entry / Exit'];
  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
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
            <label className="label">Instruments <span className="text-muted font-normal">(Enter to add)</span></label>
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
          <button onClick={onFetchOhlcv} disabled={ohlcvLoading || !form1.instruments.length}
            className="btn-ghost flex items-center gap-2 text-sm">
            {ohlcvLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Fetch & Preview Data
          </button>
          {ohlcvError && <p className="text-red-400 text-sm">{ohlcvError}</p>}
          {ohlcv && (
            <div className="space-y-2">
              <p className="text-xs text-muted font-mono">{ohlcv.symbol} — {ohlcv.rows.length.toLocaleString()} candles</p>
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
                    {ohlcv.rows.slice(-10).map((r, i) => (
                      <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02]">
                        <td className="px-3 py-1.5 font-mono text-muted">{r.date}</td>
                        <td className="px-3 py-1.5 font-mono text-soft">{r.open}</td>
                        <td className="px-3 py-1.5 font-mono text-emerald-400">{r.high}</td>
                        <td className="px-3 py-1.5 font-mono text-red-400">{r.low}</td>
                        <td className="px-3 py-1.5 font-mono text-white font-medium">{r.close}</td>
                        <td className="px-3 py-1.5 font-mono text-muted">{r.volume.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <div className="flex justify-end pt-2">
            <button onClick={onGoStep2} disabled={saving || !form1.instruments.length}
              className="btn-primary flex items-center gap-2">
              {saving && <Loader2 size={14} className="animate-spin" />}
              Next: Strategy <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2 ── */}
      {step === 2 && (
        <div className="space-y-5">
          <div className="space-y-1.5">
            <label className="label">Describe your core strategy idea</label>
            <textarea className="input min-h-[110px] resize-none" value={strategyPrompt}
              onChange={e => setStrategyPrompt(e.target.value)}
              placeholder="e.g. Buy when RSI drops below 30 and price is above the 50-day moving average. Mean reversion on trending stocks." />
          </div>
          <button onClick={onParseStrategy} disabled={parsing2 || !strategyPrompt.trim()}
            className="btn-ghost flex items-center gap-2 text-sm">
            {parsing2 ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} className="text-purple-400" />}
            Let AI Parse My Strategy
          </button>
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
          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(1)} className="btn-ghost flex items-center gap-2 text-sm">
              <ArrowLeft size={14} /> Back
            </button>
            <button onClick={onGoStep3} disabled={saving} className="btn-primary flex items-center gap-2">
              {saving && <Loader2 size={14} className="animate-spin" />}
              Next: Entry/Exit <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3 ── */}
      {step === 3 && (
        <div className="space-y-5">
          <div className="space-y-1.5">
            <label className="label">Entry Conditions <span className="text-muted font-normal text-xs">(when to BUY)</span></label>
            <textarea className="input min-h-[80px] resize-none" value={entryPrompt}
              onChange={e => setEntryPrompt(e.target.value)}
              placeholder="e.g. RSI crosses below 30 AND price is above SMA 50" />
          </div>
          <div className="space-y-1.5">
            <label className="label">Exit Conditions <span className="text-muted font-normal text-xs">(when to SELL)</span></label>
            <textarea className="input min-h-[80px] resize-none" value={exitPrompt}
              onChange={e => setExitPrompt(e.target.value)}
              placeholder="e.g. RSI crosses above 65 OR hold for max 10 days" />
          </div>
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
          <button onClick={onParseRules}
            disabled={parsing3 || (!entryPrompt.trim() && !exitPrompt.trim() && !strategyPrompt.trim())}
            className="btn-ghost flex items-center gap-2 text-sm">
            {parsing3 ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} className="text-purple-400" />}
            AI Parse Rules
          </button>
          {rules && (
            <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4 space-y-2 font-mono text-xs">
              <p className="text-[10px] text-muted uppercase tracking-wider mb-2">Parsed Rules Preview</p>
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
                  {rules.indicators.map(i => `${i.name.toUpperCase()}(${i.period})`).join(', ')}
                </span></p>
              )}
            </div>
          )}
          {runError && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-red-400 text-sm">{runError}</p>
            </div>
          )}
          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(2)} className="btn-ghost flex items-center gap-2 text-sm">
              <ArrowLeft size={14} /> Back
            </button>
            <button onClick={onRun} disabled={running || !rules} className="btn-primary flex items-center gap-2">
              {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              Run Backtest ({form1.capital ? `₹${parseInt(form1.capital).toLocaleString('en-IN')}` : '₹10,000'})
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Results ──────────────────────────────────────────────────────────────────
function ResultsPanel({ strategyId, strategies, onEdit, onReload }) {
  const [fullData, setFullData]   = useState(null);
  const [loading, setLoading]     = useState(true);
  const [tradeTab, setTradeTab]   = useState('trades');

  useEffect(() => {
    setLoading(true);
    onReload(strategyId).then(data => { setFullData(data); setLoading(false); });
  }, [strategyId]);

  if (loading) return <div className="flex items-center justify-center h-48"><Loader2 size={20} className="animate-spin text-muted" /></div>;
  if (!fullData?.results) return <div className="p-8 text-muted text-center">No results data</div>;

  const { stats: r, equityCurve, trades } = fullData.results;

  const chartData = equityCurve?.length > 200
    ? equityCurve.filter((_, i) => i % Math.ceil(equityCurve.length / 200) === 0)
    : equityCurve || [];

  const statCards = [
    { label: 'Total Return',  value: fmtPct(r.totalReturn),    color: r.totalReturn >= 0 ? 'text-emerald-400' : 'text-red-400' },
    { label: 'CAGR',          value: fmtPct(r.cagr),           color: r.cagr >= 0 ? 'text-emerald-400' : 'text-red-400' },
    { label: 'Max Drawdown',  value: fmtPct(r.maxDrawdown),    color: 'text-red-400' },
    { label: 'Sharpe Ratio',  value: fmtNum(r.sharpe),         color: 'text-white' },
    { label: 'Win Rate',      value: fmtPct(r.winRate),        color: r.winRate >= 50 ? 'text-emerald-400' : 'text-amber-400' },
    { label: 'Profit Factor', value: fmtNum(r.profitFactor),   color: r.profitFactor >= 1 ? 'text-emerald-400' : 'text-red-400' },
    { label: 'Total Trades',  value: r.totalTrades,            color: 'text-white' },
    { label: 'Final Capital', value: fmtCurrency(r.finalCapital), color: 'text-white' },
  ];

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-white font-display font-bold text-lg">{fullData.name}</h2>
          <p className="text-muted text-sm font-mono mt-0.5">
            {fullData.date_from} → {fullData.date_to} · {fullData.instruments?.join(', ')} · {fullData.frequency}
          </p>
        </div>
        <button onClick={onEdit} className="btn-ghost text-sm shrink-0">Edit Strategy</button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {statCards.map(({ label, value, color }) => (
          <div key={label} className="card p-3">
            <p className="text-[10px] text-muted uppercase tracking-wider font-mono">{label}</p>
            <p className={`text-lg font-display font-bold mt-0.5 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {chartData.length > 0 && (
        <div className="card p-4">
          <p className="text-xs text-muted uppercase tracking-wider font-mono mb-3">Equity Curve</p>
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

      <div className="card overflow-hidden">
        <div className="flex border-b border-white/8">
          {[['trades','Trade Log'], ['stats','Full Stats']].map(([key, label]) => (
            <button key={key} onClick={() => setTradeTab(key)}
              className={`px-4 py-3 text-xs font-mono transition-colors border-b-2 -mb-px ${
                tradeTab === key ? 'text-accent border-accent' : 'text-muted border-transparent hover:text-soft'
              }`}>{label}</button>
          ))}
        </div>

        {tradeTab === 'trades' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/8">
                  {['Symbol','Side','Entry Date','Entry ₹','Exit Date','Exit ₹','P&L','Return'].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 text-muted font-mono font-normal whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!trades?.length && <tr><td colSpan={8} className="px-3 py-8 text-center text-muted">No trades executed</td></tr>}
                {trades?.map((t, i) => (
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tradeTab === 'stats' && (
          <div className="p-4 grid grid-cols-2 gap-0">
            {[
              ['Total Return', fmtPct(r.totalReturn)],
              ['CAGR', fmtPct(r.cagr)],
              ['Sharpe Ratio', fmtNum(r.sharpe)],
              ['Max Drawdown', fmtPct(r.maxDrawdown)],
              ['Win Rate', fmtPct(r.winRate)],
              ['Profit Factor', fmtNum(r.profitFactor)],
              ['Total Trades', r.totalTrades],
              ['Avg Hold Days', fmtNum(r.avgTradeDays, 1)],
              ['Initial Capital', fmtCurrency(r.initialCapital)],
              ['Final Capital', fmtCurrency(r.finalCapital)],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between items-center py-2.5 px-1 border-b border-white/5">
                <span className="text-muted text-xs font-mono">{label}</span>
                <span className="text-soft text-xs font-mono font-medium">{value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
