import { useCallback, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, AreaChart, Area } from 'recharts';
import api from '../lib/api';
import { TrendingUp, Loader2, RefreshCw, BarChart3 } from 'lucide-react';

const INSTRUMENT_GROUPS = [
  {
    label: 'Indian indices',
    instruments: [
      { id: 'nifty50', name: 'Nifty 50', ticker: 'NSE Nifty 50', description: 'Broad Indian equity index' },
      { id: 'niftybank', name: 'Nifty Bank', ticker: 'NSE Nifty Bank', description: 'Banking sector index' },
      { id: 'niftyit', name: 'Nifty IT', ticker: 'NSE Nifty IT', description: 'IT sector index' },
      { id: 'niftypharma', name: 'Nifty Pharma', ticker: 'NSE Nifty Pharma', description: 'Pharmaceutical sector' },
      { id: 'niftyauto', name: 'Nifty Auto', ticker: 'NSE Nifty Auto', description: 'Automobile sector' },
      { id: 'niftymetal', name: 'Nifty Metal', ticker: 'NSE Nifty Metal', description: 'Metals & mining' },
      { id: 'niftyfmcg', name: 'Nifty FMCG', ticker: 'NSE Nifty FMCG', description: 'FMCG sector' },
      { id: 'niftyenergy', name: 'Nifty Energy', ticker: 'NSE Nifty Energy', description: 'Energy sector' },
    ],
  },
  {
    label: 'Metals',
    instruments: [
      { id: 'gold', name: 'Gold', ticker: 'Gold (MCX / Spot)', description: 'Gold commodity' },
      { id: 'silver', name: 'Silver', ticker: 'Silver (MCX / Spot)', description: 'Silver commodity' },
    ],
  },
  {
    label: 'US indices / ETFs',
    instruments: [
      { id: 'nasdaq', name: 'NASDAQ-100', ticker: 'QQQ / NDX', description: 'Nasdaq 100 index' },
      { id: 'sp500', name: 'S&P 500', ticker: 'SPY / SPX', description: 'S&P 500 index' },
      { id: 'russell1000', name: 'Russell 1000', ticker: 'IWB / RUI', description: 'Russell 1000 index' },
    ],
  },
];

const TRADE_PROMPT = (instrument) => `You are a technical analyst. For ${instrument.name} (${instrument.ticker}), return ONLY valid JSON. No markdown, no code fences.

Context: ${instrument.description}. Use realistic approximate levels and recent price structure for this instrument.

Required JSON (use numbers only for numeric fields):
{
  "summary": "One short sentence: trend and key level.",
  "recentCloses": [ number, number, ... ],
  "supportLevels": [ number, number ],
  "resistanceLevels": [ number, number ],
  "buyTheDipLevels": [ { "level": number, "label": "short label" } ],
  "riskLevel": "Low" | "Medium" | "High",
  "tradeIdea": "One sentence: Buy at X, target Y, stop Z."
}

Rules:
- recentCloses: exactly 21 numbers = last 21 sessions (oldest first). Use realistic approximate closes for recent weeks so we can plot a price chart.
- supportLevels, resistanceLevels: 1-3 numbers each. Key S/R only.
- buyTheDipLevels: 1-2 entries, level must be number.
- riskLevel: exactly one of Low, Medium, High.
- summary and tradeIdea: one sentence each, minimal text.
- All numbers as JSON numbers, not strings. No trailing commas.`;

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
    max_tokens: 1200,
    messages: [{ role: 'user', content: prompt }],
  });
  const content = res.data.content || [];
  return content.map((c) => c.text || '').join('');
}

const RISK_COLOR = { Low: 'text-green-400', Medium: 'text-amber-400', High: 'text-rose' };

export default function Trade() {
  const [results, setResults] = useState({}); // id -> { parsed, raw }
  const [loading, setLoading] = useState(null); // id or 'all'
  const [error, setError] = useState(null);

  const analyzeOne = useCallback(async (instrument) => {
    setLoading(instrument.id);
    setError(null);
    try {
      const raw = await callClaude(TRADE_PROMPT(instrument));
      const parsed = tryParseTradeResponse(raw);
      setResults((prev) => ({ ...prev, [instrument.id]: { parsed, raw } }));
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setResults((prev) => ({ ...prev, [instrument.id]: { parsed: null, raw: String(err.message) } }));
    } finally {
      setLoading(null);
    }
  }, []);

  const analyzeAll = useCallback(async () => {
    setLoading('all');
    setError(null);
    const flat = INSTRUMENT_GROUPS.flatMap((g) => g.instruments);
    for (const inst of flat) {
      try {
        const raw = await callClaude(TRADE_PROMPT(inst));
        const parsed = tryParseTradeResponse(raw);
        setResults((prev) => ({ ...prev, [inst.id]: { parsed, raw } }));
      } catch (err) {
        setResults((prev) => ({ ...prev, [inst.id]: { parsed: null, raw: String(err.message) } }));
      }
    }
    setLoading(null);
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Trade</h1>
          <p className="text-muted text-sm mt-0.5">
            Technical analysis and buy-the-dip ideas for indices and metals. Uses AI (Claude). Set API key in Settings.
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

      {INSTRUMENT_GROUPS.map((group) => (
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
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function toNum(x) {
  const n = Number(x);
  return typeof x === 'number' && !isNaN(x) ? x : !isNaN(n) ? n : null;
}

function InstrumentCard({ instrument, result, loading, onAnalyze }) {
  const hasResult = !!result;
  const parsed = result?.parsed;

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
        <button
          type="button"
          onClick={onAnalyze}
          disabled={!!loading}
          className="btn-primary shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <TrendingUp size={12} />}
          {loading ? 'Analyzing…' : hasResult ? 'Refresh' : 'Analyze'}
        </button>
      </div>

      {hasResult && (
        <>
          {parsed ? (
            <div className="mt-4 space-y-3 text-sm">
              {chartData.length > 0 && (
                <div className="h-[140px] w-full -mx-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                      <defs>
                        <linearGradient id={`fill-${instrument.id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="session" hide />
                      <YAxis domain={['auto', 'auto']} hide />
                      <Tooltip
                        contentStyle={{ background: '#1e2330', border: '1px solid #2a3040', borderRadius: 8, fontSize: 11 }}
                        formatter={(v) => [Number(v).toLocaleString('en-IN'), 'Close']}
                        labelFormatter={(l) => `Session ${l}`}
                      />
                      {supportLevels.map((l, i) => (
                        <ReferenceLine key={`s-${i}`} y={l} stroke="#34d399" strokeDasharray="2 2" strokeOpacity={0.8} />
                      ))}
                      {resistanceLevels.map((l, i) => (
                        <ReferenceLine key={`r-${i}`} y={l} stroke="#f97316" strokeDasharray="2 2" strokeOpacity={0.8} />
                      ))}
                      {buyLevels.map((l, i) => (
                        <ReferenceLine key={`b-${i}`} y={l} stroke="var(--accent)" strokeWidth={1.5} strokeOpacity={1} />
                      ))}
                      <Area type="monotone" dataKey="close" stroke="var(--accent)" strokeWidth={1.5} fill={`url(#fill-${instrument.id})`} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              {parsed.summary && (
                <p className="text-soft text-xs leading-snug line-clamp-2">{parsed.summary}</p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {parsed.riskLevel && (
                  <span className={`text-xs font-medium ${RISK_COLOR[parsed.riskLevel] || 'text-soft'}`}>
                    Risk: {parsed.riskLevel}
                  </span>
                )}
                {buyLevels.length > 0 && (
                  <span className="text-xs text-muted">
                    Buy zone: {buyLevels.map((l) => l.toLocaleString('en-IN')).join(', ')}
                  </span>
                )}
              </div>
              {parsed.tradeIdea && (
                <p className="text-accent text-xs font-medium leading-snug">{parsed.tradeIdea}</p>
              )}
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
        <p className="text-muted text-xs mt-3">Click Analyze for chart and levels.</p>
      )}
    </div>
  );
}
