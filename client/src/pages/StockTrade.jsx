import { useCallback, useEffect, useRef, useState } from 'react';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, AreaChart, Area } from 'recharts';
import api from '../lib/api';
import { Loader2, Search, X, TrendingUp, FileText, Trash2, BarChart3 } from 'lucide-react';
import PriceChartCard from '../components/PriceChartCard';

const WATCHLIST_KEY = 'stockTradeWatchlist';

function loadWatchlist() {
  try {
    return JSON.parse(localStorage.getItem(WATCHLIST_KEY) || '[]');
  } catch { return []; }
}

function saveWatchlist(list) {
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list));
}

function buildStockPrompt(instrument, priceData) {
  const priceBlock = priceData
    ? `
REAL PRICE DATA (from Yahoo Finance — use these numbers exactly; do not invent prices):
- Current price: ${priceData.currentPrice}
- 52-week high: ${priceData.high52w}
- 52-week low: ${priceData.low52w}
- Dip from high: ${priceData.dipFromHighPct}%
- Last 21 session closes (oldest first): [${priceData.recentCloses?.slice(0, 21).join(', ')}]
Your screening.currentPrice, screening.high52wOrRecent, screening.dipFromHighPct MUST match the above. Your recentCloses array MUST be exactly the 21 numbers above.
`
    : '';

  return `You are an equity/technical analyst. Produce a CRITICAL DETAILED REPORT for the STOCK ${instrument.name} (${instrument.ticker}). Context: ${instrument.description}.${priceBlock}

Return ONLY valid JSON. No markdown, no code fences. Structure like a professional research note.

{
  "reportTitle": "Critical analysis: ${instrument.name}",
  "screening": {
    "currentPrice": number,
    "high52wOrRecent": number,
    "dipFromHighPct": number,
    "rating": "STRONG BUY" | "BUY" | "HOLD" | "AVOID",
    "riskLevel": "Low" | "Medium" | "High"
  },
  "pros": [ "bullet 1", "bullet 2", "bullet 3" ],
  "cons": [ "bullet 1", "bullet 2" ],
  "risks": [ "bullet 1", "bullet 2" ],
  "verdict": "2-3 sentence verdict and conviction level.",
  "recentCloses": [ 21 numbers, oldest first${priceData ? ' — use the 21 numbers provided above' : ', approximate recent sessions for chart'} ],
  "supportLevels": [ number, number ],
  "resistanceLevels": [ number, number ],
  "buyTheDipLevels": [ { "level": number, "label": "short" } ],
  "oneLakhAllocation": {
    "investTodayRupees": number,
    "waitForLevel": number,
    "addAmountRupees": number,
    "rationale": "One sentence: why this split based on dip from high."
  }
}

CRITICAL RULES for oneLakhAllocation (total budget ₹1,00,000):
- investTodayRupees = how much of the 1 Lakh to deploy TODAY (0 to 100000). Based on dip from high.
- waitForLevel = price at which to add remaining amount.
- addAmountRupees = typically 100000 - investTodayRupees.
- rationale = one sentence explaining the split.
All numbers as JSON numbers. recentCloses exactly 21 numbers. pros/cons/risks: 2-4 bullets each. Be specific and actionable.`;
}

function tryParseTradeResponse(raw) {
  const text = String(raw).trim();
  try { return JSON.parse(text); } catch (_) {}
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  try { return JSON.parse(cleaned); } catch (_) {}
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch (_) {}
  return null;
}

async function callClaude(prompt) {
  const res = await api.post('/chat', {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2800,
    messages: [{ role: 'user', content: prompt }],
  });
  const content = res.data.content || [];
  return content.map((c) => c.text || '').join('');
}

const RISK_COLOR = { Low: 'text-green-400', Medium: 'text-amber-400', High: 'text-rose' };
const RATING_COLOR = { 'STRONG BUY': 'text-green-400', 'BUY': 'text-teal-400', 'HOLD': 'text-amber-400', 'AVOID': 'text-rose' };

function toNum(x) {
  const n = Number(x);
  return typeof x === 'number' && !isNaN(x) ? x : !isNaN(n) ? n : null;
}

// ─── Search bar with autocomplete ─────────────────────────────────────────────
function StockSearchBar({ onAdd, watchlistIds }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const timerRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const doSearch = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); setOpen(false); return; }
    setSearching(true);
    try {
      const res = await api.get(`/stocks/search?q=${encodeURIComponent(q)}`);
      setResults(res.data || []);
      setOpen(true);
    } catch { setResults([]); }
    setSearching(false);
  }, []);

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(val), 300);
  };

  const handleSelect = (stock) => {
    onAdd(stock);
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative w-full max-w-lg">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        <input
          className="input pl-9 pr-10"
          placeholder="Search Indian or US stocks (e.g. Infosys, Apple, RELIANCE…)"
          value={query}
          onChange={handleChange}
          onFocus={() => results.length > 0 && setOpen(true)}
          autoComplete="off"
        />
        {searching && (
          <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted animate-spin" />
        )}
        {!searching && query && (
          <button
            type="button"
            onClick={() => { setQuery(''); setResults([]); setOpen(false); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-white"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-40 top-full mt-1 w-full bg-surface border border-border rounded-xl shadow-2xl overflow-hidden">
          {results.map((stock) => {
            const already = watchlistIds.has(stock.id);
            return (
              <button
                key={stock.id}
                type="button"
                disabled={already}
                onClick={() => handleSelect(stock)}
                className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-card transition-colors border-b border-border last:border-0 ${already ? 'opacity-40 cursor-default' : ''}`}
              >
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium truncate">{stock.name}</p>
                  <p className="text-muted text-xs">{stock.ticker}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded font-mono ${stock.market === 'IN' ? 'bg-teal/10 text-teal' : 'bg-blue-500/10 text-blue-400'}`}>
                    {stock.market === 'IN' ? 'India' : 'US'}
                  </span>
                  {already && <span className="text-xs text-muted">Added</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {open && query.length >= 2 && results.length === 0 && !searching && (
        <div className="absolute z-40 top-full mt-1 w-full bg-surface border border-border rounded-xl shadow-2xl px-4 py-3">
          <p className="text-muted text-sm">No Indian or US stocks found for "{query}"</p>
        </div>
      )}
    </div>
  );
}

// ─── Instrument card ──────────────────────────────────────────────────────────
function InstrumentCard({ instrument, result, loading, onAnalyze, onViewReport, onRemove }) {
  const hasResult = !!result;
  const parsed = result?.parsed;
  const alloc = parsed?.oneLakhAllocation;

  const chartData = parsed?.recentCloses?.length
    ? parsed.recentCloses.map((v, i) => ({ session: i + 1, close: toNum(v) ?? 0 })).filter((d) => d.close > 0)
    : [];
  const supportLevels = (parsed?.supportLevels || []).map(toNum).filter((n) => n != null);
  const resistanceLevels = (parsed?.resistanceLevels || []).map(toNum).filter((n) => n != null);
  const buyLevels = (parsed?.buyTheDipLevels || []).map((b) => toNum(b.level)).filter((n) => n != null);

  return (
    <div className="card overflow-hidden flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-display font-semibold text-white truncate">{instrument.name}</p>
            <span className={`text-xs px-1.5 py-0.5 rounded font-mono shrink-0 ${instrument.market === 'IN' ? 'bg-teal/10 text-teal' : 'bg-blue-500/10 text-blue-400'}`}>
              {instrument.market === 'IN' ? 'India' : 'US'}
            </span>
          </div>
          <p className="text-muted text-xs mt-0.5 truncate">{instrument.ticker}</p>
        </div>
        <div className="flex gap-1.5 shrink-0">
          {hasResult && parsed && (
            <button type="button" onClick={onViewReport} className="btn-ghost flex items-center gap-1 px-2 py-1.5 text-xs">
              <FileText size={12} /> Report
            </button>
          )}
          <button
            type="button"
            onClick={onAnalyze}
            disabled={!!loading}
            className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <TrendingUp size={12} />}
            {loading ? 'Analyzing…' : hasResult ? 'Refresh' : 'Analyze'}
          </button>
          <button
            type="button"
            onClick={onRemove}
            title="Remove from watchlist"
            className="p-1.5 rounded-lg text-muted hover:text-rose hover:bg-rose/5 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {hasResult && (
        <>
          {parsed ? (
            <div className="mt-4 space-y-3 text-sm">
              {chartData.length > 0 && (
                <div className="h-[140px] w-full -mx-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
                      <defs>
                        <linearGradient id={`fill-stock-${instrument.id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.5} />
                          <stop offset="100%" stopColor="#2dd4bf" stopOpacity={0.08} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="session" hide />
                      <YAxis domain={['auto', 'auto']} hide />
                      <Tooltip
                        contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, color: '#0f172a', padding: '10px 14px', boxShadow: '0 4px 12px rgba(0,0,0,0.25)' }}
                        labelStyle={{ color: '#0f172a', fontWeight: 600, marginBottom: 4 }}
                        itemStyle={{ color: '#0f172a' }}
                        formatter={(v) => [Number(v).toLocaleString('en-IN'), 'Close']}
                        labelFormatter={(l) => `Session ${l}`}
                      />
                      {supportLevels.map((l, i) => <ReferenceLine key={`s-${i}`} y={l} stroke="#10b981" strokeWidth={2} strokeDasharray="4 4" />)}
                      {resistanceLevels.map((l, i) => <ReferenceLine key={`r-${i}`} y={l} stroke="#f97316" strokeWidth={2} strokeDasharray="4 4" />)}
                      {buyLevels.map((l, i) => <ReferenceLine key={`b-${i}`} y={l} stroke="#f0c040" strokeWidth={2} />)}
                      <Area type="monotone" dataKey="close" stroke="#2dd4bf" strokeWidth={2.5} fill={`url(#fill-stock-${instrument.id})`} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              {alloc && (
                <div className="rounded-lg bg-accent/10 border border-accent/30 p-3">
                  <p className="text-xs text-muted uppercase tracking-wider mb-1.5">₹1 Lakh allocation</p>
                  <p className="text-white font-medium text-xs">Invest today: ₹{(alloc.investTodayRupees ?? 0).toLocaleString('en-IN')}</p>
                  <p className="text-soft text-xs mt-0.5">Wait for {(alloc.waitForLevel ?? '').toLocaleString?.('en-IN') ?? alloc.waitForLevel} → add ₹{(alloc.addAmountRupees ?? 0).toLocaleString('en-IN')}</p>
                </div>
              )}
              {parsed.verdict && <p className="text-soft text-xs leading-snug line-clamp-2">{parsed.verdict}</p>}
              <div className="flex flex-wrap items-center gap-2">
                {parsed.screening?.rating && (
                  <span className={`text-xs font-medium ${RATING_COLOR[parsed.screening.rating] || 'text-soft'}`}>{parsed.screening.rating}</span>
                )}
                {parsed.screening?.riskLevel && (
                  <span className={`text-xs font-medium ${RISK_COLOR[parsed.screening.riskLevel] || 'text-soft'}`}>Risk: {parsed.screening.riskLevel}</span>
                )}
              </div>
              <button type="button" onClick={onViewReport} className="text-accent hover:underline text-xs font-medium">
                View full report →
              </button>
            </div>
          ) : (
            <div className="mt-4">
              <p className="text-muted text-xs mb-2">Could not parse response:</p>
              <pre className="text-xs text-soft bg-surface rounded-lg p-3 overflow-auto max-h-32 whitespace-pre-wrap">{result.raw?.slice(0, 300)}</pre>
            </div>
          )}
        </>
      )}

      {!hasResult && !loading && (
        <p className="text-muted text-xs mt-3">Click Analyze for detailed report and ₹1 Lakh allocation.</p>
      )}
    </div>
  );
}

// ─── Report modal ─────────────────────────────────────────────────────────────
function ReportModal({ instrument, parsed, onClose }) {
  const screening = parsed?.screening || {};
  const alloc = parsed?.oneLakhAllocation || {};
  const supportLevels = (parsed?.supportLevels || []).map(toNum).filter((n) => n != null);
  const resistanceLevels = (parsed?.resistanceLevels || []).map(toNum).filter((n) => n != null);
  const buyLevels = (parsed?.buyTheDipLevels || []).map((b) => toNum(b.level)).filter((n) => n != null);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-start justify-center overflow-y-auto bg-black/70 p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-ink border border-border rounded-t-xl sm:rounded-xl shadow-xl max-w-2xl w-full sm:my-8 max-h-[95vh] sm:max-h-[calc(100vh-8rem)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-ink border-b border-border px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between shrink-0 safe-area-top">
          <div className="min-w-0 pr-8">
            <h2 className="font-display text-lg sm:text-xl font-bold text-white truncate">{parsed?.reportTitle || instrument.name}</h2>
            <p className="text-muted text-xs mt-0.5">{instrument.ticker}</p>
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:text-white p-1 shrink-0">
            <X size={20} />
          </button>
        </div>
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto min-h-0 flex-1">
          {screening && (screening.currentPrice != null || screening.rating) && (
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <p className="stat-label mb-0">Screening</p>
                <span className="text-muted text-xs">Prices: Yahoo Finance</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                {screening.currentPrice != null && (
                  <div><p className="text-muted text-xs">Price</p><p className="font-mono text-white">{Number(screening.currentPrice).toLocaleString('en-IN')}</p></div>
                )}
                {screening.high52wOrRecent != null && (
                  <div><p className="text-muted text-xs">High (52w)</p><p className="font-mono text-white">{Number(screening.high52wOrRecent).toLocaleString('en-IN')}</p></div>
                )}
                {screening.dipFromHighPct != null && (
                  <div><p className="text-muted text-xs">Dip from high</p><p className="font-mono text-amber-400">{Number(screening.dipFromHighPct).toFixed(1)}%</p></div>
                )}
                {screening.rating && (
                  <div><p className="text-muted text-xs">Rating</p><p className={`font-semibold ${RATING_COLOR[screening.rating] || 'text-white'}`}>{screening.rating}</p></div>
                )}
                {screening.riskLevel && (
                  <div><p className="text-muted text-xs">Risk</p><p className={RISK_COLOR[screening.riskLevel] || 'text-soft'}>{screening.riskLevel}</p></div>
                )}
              </div>
            </div>
          )}

          <div className="rounded-xl bg-accent/15 border-2 border-accent/40 p-5">
            <p className="stat-label text-accent mb-2">₹1 Lakh allocation</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-muted text-xs uppercase">Invest today</p>
                <p className="font-mono text-xl font-bold text-white">₹{(alloc.investTodayRupees ?? 0).toLocaleString('en-IN')}</p>
              </div>
              <div>
                <p className="text-muted text-xs uppercase">Wait for level</p>
                <p className="font-mono text-lg text-accent">
                  {alloc.waitForLevel != null ? (typeof alloc.waitForLevel === 'number' ? alloc.waitForLevel.toLocaleString('en-IN') : String(alloc.waitForLevel)) : '—'}
                </p>
              </div>
              <div>
                <p className="text-muted text-xs uppercase">Add at that level</p>
                <p className="font-mono text-lg text-white">₹{(alloc.addAmountRupees ?? 0).toLocaleString('en-IN')}</p>
              </div>
            </div>
            {alloc.rationale && <p className="text-soft text-sm mt-3 border-t border-border pt-3">{alloc.rationale}</p>}
          </div>

          {(parsed?.pros?.length || parsed?.cons?.length || parsed?.risks?.length) && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {parsed.pros?.length > 0 && (
                <div className="card">
                  <p className="text-xs text-green-400 font-semibold uppercase tracking-wider mb-2">Pros</p>
                  <ul className="space-y-1 text-sm text-soft">{parsed.pros.map((p, i) => <li key={i} className="flex gap-2"><span className="text-green-400 shrink-0">✓</span>{p}</li>)}</ul>
                </div>
              )}
              {parsed.cons?.length > 0 && (
                <div className="card">
                  <p className="text-xs text-rose font-semibold uppercase tracking-wider mb-2">Cons</p>
                  <ul className="space-y-1 text-sm text-soft">{parsed.cons.map((c, i) => <li key={i} className="flex gap-2"><span className="text-rose shrink-0">✗</span>{c}</li>)}</ul>
                </div>
              )}
              {parsed.risks?.length > 0 && (
                <div className="card">
                  <p className="text-xs text-amber-400 font-semibold uppercase tracking-wider mb-2">Risks</p>
                  <ul className="space-y-1 text-sm text-soft">{parsed.risks.map((r, i) => <li key={i} className="flex gap-2"><span className="text-amber-400 shrink-0">⚠</span>{r}</li>)}</ul>
                </div>
              )}
            </div>
          )}

          {parsed?.verdict && (
            <div className="card">
              <p className="stat-label mb-2">Verdict</p>
              <p className="text-soft text-sm leading-relaxed">{parsed.verdict}</p>
            </div>
          )}

          <PriceChartCard
            instrumentId={instrument.id}
            fallbackCloses={parsed?.recentCloses || []}
            supportLevels={supportLevels}
            resistanceLevels={resistanceLevels}
            buyLevels={buyLevels}
            title="Price chart"
          />

          {(supportLevels.length > 0 || resistanceLevels.length > 0 || buyLevels.length > 0) && (
            <div className="card">
              <p className="stat-label mb-3">Key levels</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-sm">
                {supportLevels.length > 0 && <div><p className="text-muted text-xs">Support</p><p className="font-mono text-green-400">{supportLevels.map((l) => l.toLocaleString('en-IN')).join(', ')}</p></div>}
                {resistanceLevels.length > 0 && <div><p className="text-muted text-xs">Resistance</p><p className="font-mono text-amber-400">{resistanceLevels.map((l) => l.toLocaleString('en-IN')).join(', ')}</p></div>}
                {buyLevels.length > 0 && <div><p className="text-muted text-xs">Buy the dip</p><p className="font-mono text-accent">{buyLevels.map((l) => l.toLocaleString('en-IN')).join(', ')}</p></div>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function StockTrade() {
  const [watchlist, setWatchlist] = useState(() => loadWatchlist());
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState(null);
  const [reportModal, setReportModal] = useState(null);

  const watchlistIds = new Set(watchlist.map((s) => s.id));

  const addToWatchlist = useCallback((stock) => {
    setWatchlist((prev) => {
      if (prev.find((s) => s.id === stock.id)) return prev;
      const next = [...prev, stock];
      saveWatchlist(next);
      return next;
    });
  }, []);

  const removeFromWatchlist = useCallback((id) => {
    setWatchlist((prev) => {
      const next = prev.filter((s) => s.id !== id);
      saveWatchlist(next);
      return next;
    });
    setResults((prev) => { const n = { ...prev }; delete n[id]; return n; });
  }, []);

  const clearWatchlist = useCallback(() => {
    setWatchlist([]);
    saveWatchlist([]);
    setResults({});
  }, []);

  const mergePriceData = useCallback((parsed, priceData) => {
    if (!parsed || !priceData) return parsed;
    return {
      ...parsed,
      screening: { ...parsed.screening, currentPrice: priceData.currentPrice, high52wOrRecent: priceData.high52w, dipFromHighPct: priceData.dipFromHighPct },
      recentCloses: Array.isArray(priceData.recentCloses) && priceData.recentCloses.length >= 21
        ? priceData.recentCloses.slice(0, 21)
        : parsed.recentCloses,
    };
  }, []);

  const analyzeOne = useCallback(async (instrument) => {
    setLoading(instrument.id);
    setError(null);
    try {
      let priceData = null;
      try { const res = await api.get(`/prices/${encodeURIComponent(instrument.id)}`); priceData = res.data; } catch (_) {}
      const raw = await callClaude(buildStockPrompt(instrument, priceData));
      let parsed = tryParseTradeResponse(raw);
      if (parsed && priceData) parsed = mergePriceData(parsed, priceData);
      setResults((prev) => ({ ...prev, [instrument.id]: { parsed, raw } }));
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setResults((prev) => ({ ...prev, [instrument.id]: { parsed: null, raw: String(err.message) } }));
    } finally {
      setLoading(null);
    }
  }, [mergePriceData]);

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-xl sm:text-2xl font-bold text-white truncate">Stock Trade</h1>
          <p className="text-muted text-xs sm:text-sm mt-0.5">
            Search Indian & US stocks, build your watchlist, and get AI analysis.
          </p>
        </div>
        {watchlist.length > 0 && (
          <button
            type="button"
            onClick={clearWatchlist}
            className="btn-ghost flex items-center gap-2 text-rose border-rose/30 hover:border-rose hover:bg-rose/5"
          >
            <Trash2 size={14} /> Clear watchlist
          </button>
        )}
      </div>

      {/* Search */}
      <div className="card">
        <p className="text-sm font-medium text-white mb-3 flex items-center gap-2">
          <Search size={14} className="text-accent" /> Add to watchlist
        </p>
        <StockSearchBar onAdd={addToWatchlist} watchlistIds={watchlistIds} />
        <p className="text-muted text-xs mt-2">
          Searches Indian (NSE/BSE) and US (NYSE/NASDAQ) equities via Yahoo Finance.
        </p>
      </div>

      {error && (
        <div className="card border-rose/40 bg-rose/5 text-rose text-sm">{error}</div>
      )}

      {/* Watchlist */}
      {watchlist.length === 0 ? (
        <div className="card text-center py-12">
          <BarChart3 size={36} className="text-muted mx-auto mb-3" />
          <p className="text-white font-medium">Your watchlist is empty</p>
          <p className="text-muted text-sm mt-1">Search for a stock above to add it here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="font-display font-semibold text-white text-lg flex items-center gap-2">
            <BarChart3 size={18} className="text-accent" />
            Watchlist <span className="text-muted text-sm font-normal">({watchlist.length})</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {watchlist.map((inst) => (
              <InstrumentCard
                key={inst.id}
                instrument={inst}
                result={results[inst.id]}
                loading={loading === inst.id}
                onAnalyze={() => analyzeOne(inst)}
                onViewReport={() => results[inst.id]?.parsed && setReportModal({ instrument: inst, parsed: results[inst.id].parsed })}
                onRemove={() => removeFromWatchlist(inst.id)}
              />
            ))}
          </div>
        </div>
      )}

      {reportModal && (
        <ReportModal
          instrument={reportModal.instrument}
          parsed={reportModal.parsed}
          onClose={() => setReportModal(null)}
        />
      )}
    </div>
  );
}
