import { useCallback, useState } from 'react';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, AreaChart, Area } from 'recharts';
import api from '../lib/api';
import { Loader2, RefreshCw, BarChart3, FileText, X, TrendingUp } from 'lucide-react';

const STOCK_GROUPS = [
  {
    label: 'Exchanges & Infra',
    instruments: [
      { id: 'bse', name: 'BSE', ticker: 'NSE: BSE', description: 'BSE Ltd — stock exchange' },
      { id: 'cdsl', name: 'CDSL', ticker: 'NSE: CDSL', description: 'Central Depository Services — depository' },
      { id: 'mcx', name: 'MCX', ticker: 'NSE: MCX', description: 'Multi Commodity Exchange — commodity exchange' },
    ],
  },
  {
    label: 'PSU & Industrials',
    instruments: [
      { id: 'sjvn', name: 'SJVN', ticker: 'NSE: SJVN', description: 'SJVN Ltd — hydro power PSU' },
      { id: 'rites', name: 'RITES', ticker: 'NSE: RITES', description: 'RITES Ltd — engineering & consultancy PSU' },
      { id: 'irctc', name: 'IRCTC', ticker: 'NSE: IRCTC', description: 'Indian Railway Catering — railways PSU' },
    ],
  },
  {
    label: 'Growth & Diversified',
    instruments: [
      { id: 'vguard', name: 'V-Guard', ticker: 'NSE: VGUARD', description: 'V-Guard Industries — electricals & consumer' },
      { id: 'polycab', name: 'Polycab', ticker: 'NSE: POLYCAB', description: 'Polycab India — cables & wires' },
      { id: 'tatapower', name: 'Tata Power', ticker: 'NSE: TATAPOWER', description: 'Tata Power — power generation & distribution' },
    ],
  },
];

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
  "recentCloses": [ 21 numbers, oldest first${priceData ? ' — use the 21 numbers provided above' : ', approximate recent sessions for chart' } ],
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
- investTodayRupees = how much of the 1 Lakh to deploy TODAY (0 to 100000). Base this on how far price has already dipped from high: bigger dip = deploy more today; small dip = deploy less and keep more for lower levels.
- waitForLevel = price/level at which to ADD the remaining amount (number). Should be a meaningful support or buy-the-dip level below current.
- addAmountRupees = amount to add when price hits waitForLevel (typically 100000 - investTodayRupees).
- rationale = one sentence explaining the split.
All numbers as JSON numbers. recentCloses exactly 21 numbers. pros/cons/risks: 2-4 bullets each. Be specific and actionable for this stock.`;
}

function tryParseTradeResponse(raw) {
  const text = String(raw).trim();
  try {
    return JSON.parse(text);
  } catch (_) {}
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (_) {}
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (_) {}
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

function InstrumentCard({ instrument, result, loading, onAnalyze, onViewReport }) {
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
        <div className="min-w-0">
          <p className="font-display font-semibold text-white truncate">{instrument.name}</p>
          <p className="text-muted text-xs mt-0.5 truncate">{instrument.ticker}</p>
        </div>
        <div className="flex gap-1.5 shrink-0">
          {hasResult && parsed && (
            <button
              type="button"
              onClick={onViewReport}
              className="btn-ghost flex items-center gap-1 px-2 py-1.5 text-xs"
            >
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
                        contentStyle={{
                          background: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderRadius: 8,
                          fontSize: 12,
                          color: '#0f172a',
                          padding: '10px 14px',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                        }}
                        labelStyle={{ color: '#0f172a', fontWeight: 600, marginBottom: 4 }}
                        itemStyle={{ color: '#0f172a' }}
                        formatter={(v) => [Number(v).toLocaleString('en-IN'), 'Close']}
                        labelFormatter={(l) => `Session ${l}`}
                      />
                      {supportLevels.map((l, i) => (
                        <ReferenceLine key={`s-${i}`} y={l} stroke="#10b981" strokeWidth={2} strokeDasharray="4 4" />
                      ))}
                      {resistanceLevels.map((l, i) => (
                        <ReferenceLine key={`r-${i}`} y={l} stroke="#f97316" strokeWidth={2} strokeDasharray="4 4" />
                      ))}
                      {buyLevels.map((l, i) => (
                        <ReferenceLine key={`b-${i}`} y={l} stroke="#f0c040" strokeWidth={2} />
                      ))}
                      <Area type="monotone" dataKey="close" stroke="#2dd4bf" strokeWidth={2.5} fill={`url(#fill-stock-${instrument.id})`} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              {alloc && (
                <div className="rounded-lg bg-accent/10 border border-accent/30 p-3">
                  <p className="text-xs text-muted uppercase tracking-wider mb-1.5">₹1 Lakh allocation</p>
                  <p className="text-white font-medium text-xs">Invest today: ₹{(alloc.investTodayRupees ?? 0).toLocaleString('en-IN')}</p>
                  <p className="text-soft text-xs mt-0.5">Wait for level {(alloc.waitForLevel ?? '').toLocaleString('en-IN')} → add ₹{(alloc.addAmountRupees ?? 0).toLocaleString('en-IN')}</p>
                </div>
              )}
              {parsed.verdict && (
                <p className="text-soft text-xs leading-snug line-clamp-2">{parsed.verdict}</p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {parsed.screening?.rating && (
                  <span className={`text-xs font-medium ${RATING_COLOR[parsed.screening.rating] || 'text-soft'}`}>
                    {parsed.screening.rating}
                  </span>
                )}
                {parsed.screening?.riskLevel && (
                  <span className={`text-xs font-medium ${RISK_COLOR[parsed.screening.riskLevel] || 'text-soft'}`}>
                    Risk: {parsed.screening.riskLevel}
                  </span>
                )}
              </div>
              <button type="button" onClick={onViewReport} className="text-accent hover:underline text-xs font-medium">
                View full report →
              </button>
            </div>
          ) : (
            <div className="mt-4">
              <p className="text-muted text-xs mb-2">Could not parse response:</p>
              <pre className="text-xs text-soft bg-surface rounded-lg p-3 overflow-auto max-h-32 whitespace-pre-wrap">
                {result.raw?.slice(0, 300)}
              </pre>
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

function ReportModal({ instrument, parsed, onClose }) {
  const screening = parsed?.screening || {};
  const alloc = parsed?.oneLakhAllocation || {};
  const chartData = parsed?.recentCloses?.length
    ? parsed.recentCloses.map((v, i) => ({ session: i + 1, close: toNum(v) ?? 0 })).filter((d) => d.close > 0)
    : [];
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
          <h2 className="font-display text-lg sm:text-xl font-bold text-white truncate pr-8">{parsed?.reportTitle || instrument.name}</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-white p-1">
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
                  <div>
                    <p className="text-muted text-xs">Price</p>
                    <p className="font-mono text-white">{Number(screening.currentPrice).toLocaleString('en-IN')}</p>
                  </div>
                )}
                {screening.high52wOrRecent != null && (
                  <div>
                    <p className="text-muted text-xs">High (52w/recent)</p>
                    <p className="font-mono text-white">{Number(screening.high52wOrRecent).toLocaleString('en-IN')}</p>
                  </div>
                )}
                {screening.dipFromHighPct != null && (
                  <div>
                    <p className="text-muted text-xs">Dip from high</p>
                    <p className="font-mono text-amber-400">{Number(screening.dipFromHighPct).toFixed(1)}%</p>
                  </div>
                )}
                {screening.rating && (
                  <div>
                    <p className="text-muted text-xs">Rating</p>
                    <p className={`font-semibold ${RATING_COLOR[screening.rating] || 'text-white'}`}>{screening.rating}</p>
                  </div>
                )}
                {screening.riskLevel && (
                  <div>
                    <p className="text-muted text-xs">Risk</p>
                    <p className={RISK_COLOR[screening.riskLevel] || 'text-soft'}>{screening.riskLevel}</p>
                  </div>
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
                <p className="text-muted text-xs uppercase">Wait for level (add more)</p>
                <p className="font-mono text-lg text-accent">
                  {alloc.waitForLevel != null
                    ? (typeof alloc.waitForLevel === 'number' ? alloc.waitForLevel.toLocaleString('en-IN') : String(alloc.waitForLevel))
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-muted text-xs uppercase">Add amount at that level</p>
                <p className="font-mono text-lg text-white">₹{(alloc.addAmountRupees ?? 0).toLocaleString('en-IN')}</p>
              </div>
            </div>
            {alloc.rationale && (
              <p className="text-soft text-sm mt-3 border-t border-border pt-3">{alloc.rationale}</p>
            )}
          </div>

          {(parsed?.pros?.length || parsed?.cons?.length || parsed?.risks?.length) && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {parsed.pros?.length > 0 && (
                <div className="card">
                  <p className="text-xs text-green-400 font-semibold uppercase tracking-wider mb-2">Pros</p>
                  <ul className="space-y-1 text-sm text-soft">
                    {parsed.pros.map((p, i) => (
                      <li key={i} className="flex gap-2"><span className="text-green-400 shrink-0">✓</span>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
              {parsed.cons?.length > 0 && (
                <div className="card">
                  <p className="text-xs text-rose font-semibold uppercase tracking-wider mb-2">Cons</p>
                  <ul className="space-y-1 text-sm text-soft">
                    {parsed.cons.map((c, i) => (
                      <li key={i} className="flex gap-2"><span className="text-rose shrink-0">✗</span>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
              {parsed.risks?.length > 0 && (
                <div className="card">
                  <p className="text-xs text-amber-400 font-semibold uppercase tracking-wider mb-2">Risks</p>
                  <ul className="space-y-1 text-sm text-soft">
                    {parsed.risks.map((r, i) => (
                      <li key={i} className="flex gap-2"><span className="text-amber-400 shrink-0">⚠</span>{r}</li>
                    ))}
                  </ul>
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

          {chartData.length > 0 && (
            <div className="card">
              <p className="stat-label mb-3">Price (last 21 sessions)</p>
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 12, right: 12, left: 12, bottom: 8 }}>
                    <defs>
                      <linearGradient id={`fill-modal-stock-${instrument.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#2dd4bf" stopOpacity={0.08} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="session" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => v.toLocaleString('en-IN')} />
                    <Tooltip
                      contentStyle={{
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: 8,
                        fontSize: 13,
                        color: '#0f172a',
                        padding: '12px 16px',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                      }}
                      labelStyle={{ color: '#0f172a', fontWeight: 600 }}
                      itemStyle={{ color: '#0f172a' }}
                      formatter={(v) => [Number(v).toLocaleString('en-IN'), 'Close']}
                      labelFormatter={(l) => `Session ${l}`}
                    />
                    {supportLevels.map((l, i) => <ReferenceLine key={i} y={l} stroke="#10b981" strokeWidth={2} strokeDasharray="4 4" />)}
                    {resistanceLevels.map((l, i) => <ReferenceLine key={i} y={l} stroke="#f97316" strokeWidth={2} strokeDasharray="4 4" />)}
                    {buyLevels.map((l, i) => <ReferenceLine key={i} y={l} stroke="#f0c040" strokeWidth={2} />)}
                    <Area type="monotone" dataKey="close" stroke="#2dd4bf" strokeWidth={2.5} fill={`url(#fill-modal-stock-${instrument.id})`} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {(supportLevels.length > 0 || resistanceLevels.length > 0 || buyLevels.length > 0) && (
            <div className="card">
              <p className="stat-label mb-3">Key levels</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-sm">
                {supportLevels.length > 0 && (
                  <div>
                    <p className="text-muted text-xs">Support</p>
                    <p className="font-mono text-green-400">{supportLevels.map((l) => l.toLocaleString('en-IN')).join(', ')}</p>
                  </div>
                )}
                {resistanceLevels.length > 0 && (
                  <div>
                    <p className="text-muted text-xs">Resistance</p>
                    <p className="font-mono text-amber-400">{resistanceLevels.map((l) => l.toLocaleString('en-IN')).join(', ')}</p>
                  </div>
                )}
                {buyLevels.length > 0 && (
                  <div>
                    <p className="text-muted text-xs">Buy the dip</p>
                    <p className="font-mono text-accent">{buyLevels.map((l) => l.toLocaleString('en-IN')).join(', ')}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function StockTrade() {
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState(null);
  const [reportModal, setReportModal] = useState(null);

  const mergePriceData = useCallback((parsed, priceData) => {
    if (!parsed || !priceData) return parsed;
    return {
      ...parsed,
      screening: {
        ...parsed.screening,
        currentPrice: priceData.currentPrice,
        high52wOrRecent: priceData.high52w,
        dipFromHighPct: priceData.dipFromHighPct,
      },
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
      try {
        const res = await api.get(`/prices/${instrument.id}`);
        priceData = res.data;
      } catch (_) {}
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

  const analyzeAll = useCallback(async () => {
    setLoading('all');
    setError(null);
    const flat = STOCK_GROUPS.flatMap((g) => g.instruments);
    for (const inst of flat) {
      try {
        let priceData = null;
        try {
          const res = await api.get(`/prices/${inst.id}`);
          priceData = res.data;
        } catch (_) {}
        const raw = await callClaude(buildStockPrompt(inst, priceData));
        let parsed = tryParseTradeResponse(raw);
        if (parsed && priceData) parsed = mergePriceData(parsed, priceData);
        setResults((prev) => ({ ...prev, [inst.id]: { parsed, raw } }));
      } catch (err) {
        setResults((prev) => ({ ...prev, [inst.id]: { parsed: null, raw: String(err.message) } }));
      }
    }
    setLoading(null);
  }, [mergePriceData]);

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-xl sm:text-2xl font-bold text-white truncate">Stock Trade</h1>
          <p className="text-muted text-xs sm:text-sm mt-0.5">
            AI analysis for individual stocks (BSE, CDSL, MCX, SJVN, RITES, V-Guard, and more). Uses Claude. Set API key in Settings.
          </p>
        </div>
        <button
          type="button"
          onClick={analyzeAll}
          disabled={!!loading}
          className="btn-primary flex items-center gap-2"
        >
          {loading === 'all' ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          {loading === 'all' ? 'Analyzing all…' : 'Analyze all'}
        </button>
      </div>

      {error && (
        <div className="card border-rose/40 bg-rose/5 text-rose text-sm">
          {error}
        </div>
      )}

      {STOCK_GROUPS.map((group) => (
        <div key={group.label} className="space-y-3">
          <h2 className="font-display font-semibold text-white text-lg flex items-center gap-2">
            <BarChart3 size={18} className="text-accent" />
            {group.label}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {group.instruments.map((inst) => (
              <InstrumentCard
                key={inst.id}
                instrument={inst}
                result={results[inst.id]}
                loading={loading === inst.id || loading === 'all'}
                onAnalyze={() => analyzeOne(inst)}
                onViewReport={() => results[inst.id]?.parsed && setReportModal({ instrument: inst, parsed: results[inst.id].parsed })}
              />
            ))}
          </div>
        </div>
      ))}

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
