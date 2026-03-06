import { useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from 'recharts';
import api from '../lib/api';
import { MessageSquare, Loader2, BarChart3, TrendingUp, Plus, X } from 'lucide-react';

const TRADE_INSTRUMENTS = [
  { id: 'nifty50', name: 'Nifty 50', ticker: 'NSE Nifty 50' },
  { id: 'niftybank', name: 'Nifty Bank', ticker: 'NSE Nifty Bank' },
  { id: 'niftyit', name: 'Nifty IT', ticker: 'NSE Nifty IT' },
  { id: 'niftypharma', name: 'Nifty Pharma', ticker: 'NSE Nifty Pharma' },
  { id: 'niftyauto', name: 'Nifty Auto', ticker: 'NSE Nifty Auto' },
  { id: 'niftymetal', name: 'Nifty Metal', ticker: 'NSE Nifty Metal' },
  { id: 'niftyfmcg', name: 'Nifty FMCG', ticker: 'NSE Nifty FMCG' },
  { id: 'niftyenergy', name: 'Nifty Energy', ticker: 'NSE Nifty Energy' },
  { id: 'gold', name: 'Gold', ticker: 'Gold (MCX / Spot)' },
  { id: 'silver', name: 'Silver', ticker: 'Silver (MCX / Spot)' },
  { id: 'nasdaq', name: 'NASDAQ-100', ticker: 'QQQ / NDX' },
  { id: 'sp500', name: 'S&P 500', ticker: 'SPY / SPX' },
  { id: 'russell1000', name: 'Russell 1000', ticker: 'IWB / RUI' },
];

const YEAR_OPTIONS = [3, 5, 10, 15, 20];

function buildPrompt(mode, portfolioContext, years, instrument, amount, holdingsForSell) {
  const ctx = (portfolioContext || '').trim();
  const base = `You are a portfolio advisor. Return ONLY valid JSON. No markdown, no code fences.

PORTFOLIO / GOAL CONTEXT:
${ctx || '(None provided)'}

YEARS TO KEEP GOAL PORTFOLIO: ${years} years`;

  if (mode === 'general') {
    return `${base}

MODE: General portfolio insight (no trade). Analyze current holdings only.

Return this JSON:
{
  "insight": "2-3 sentence overall assessment",
  "recommendation": "STRONG" | "GOOD" | "NEEDS_ATTENTION" | "REBALANCE",
  "riskReturnProjection": [
    { "years": 3, "expectedReturnPct": number, "riskPct": number },
    { "years": 5, "expectedReturnPct": number, "riskPct": number },
    { "years": 10, "expectedReturnPct": number, "riskPct": number },
    { "years": 15, "expectedReturnPct": number, "riskPct": number },
    { "years": 20, "expectedReturnPct": number, "riskPct": number }
  ],
  "allocationEvolution": [
    { "year": 3, "equityPct": number, "debtPct": number, "metalPct": number, "cashPct": number },
    { "year": 5, "equityPct": number, "debtPct": number, "metalPct": number, "cashPct": number },
    { "year": 10, "equityPct": number, "debtPct": number, "metalPct": number, "cashPct": number },
    { "year": 15, "equityPct": number, "debtPct": number, "metalPct": number, "cashPct": number },
    { "year": 20, "equityPct": number, "debtPct": number, "metalPct": number, "cashPct": number }
  ],
  "keyInsights": ["bullet 1", "bullet 2", "bullet 3"],
  "caveats": ["caveat 1"]
}

Use realistic CAGR and volatility based on current allocation.`;
  }

  if (mode === 'sell') {
    const holdingsStr = holdingsForSell?.length
      ? `CURRENT HOLDINGS (can sell):\n${holdingsForSell.map((h) => `- ${h.instrument}: ₹${h.net}`).join('\n')}`
      : 'No holdings data.';
    return `${base}

${holdingsStr}

MODE: SELL. User wants to sell ₹${amount} of ${instrument?.name || instrument}.

Return this JSON:
{
  "insight": "2-3 sentence: does selling make sense?",
  "recommendation": "GO_AHEAD" | "MODIFY_AMOUNT" | "AVOID" | "DEFER",
  "riskReturnProjection": [
    { "years": 3, "expectedReturnPct": number, "riskPct": number },
    { "years": 5, "expectedReturnPct": number, "riskPct": number },
    { "years": 10, "expectedReturnPct": number, "riskPct": number },
    { "years": 15, "expectedReturnPct": number, "riskPct": number },
    { "years": 20, "expectedReturnPct": number, "riskPct": number }
  ],
  "allocationEvolution": [
    { "year": 3, "equityPct": number, "debtPct": number, "metalPct": number, "cashPct": number },
    { "year": 5, "equityPct": number, "debtPct": number, "metalPct": number, "cashPct": number },
    { "year": 10, "equityPct": number, "debtPct": number, "metalPct": number, "cashPct": number },
    { "year": 15, "equityPct": number, "debtPct": number, "metalPct": number, "cashPct": number },
    { "year": 20, "equityPct": number, "debtPct": number, "metalPct": number, "cashPct": number }
  ],
  "keyInsights": ["bullet 1", "bullet 2"],
  "caveats": ["caveat 1"]
}

Show how risk/return changes after the sale over ${years}Y horizon.`;
  }

  // Buy mode
  return `${base}

MODE: BUY. User wants to invest ₹${amount} in ${instrument?.name} (${instrument?.ticker}).

Return this JSON:
{
  "insight": "2-3 sentence: does this trade make sense?",
  "recommendation": "GO_AHEAD" | "MODIFY_AMOUNT" | "AVOID" | "DEFER",
  "riskReturnProjection": [
    { "years": 3, "expectedReturnPct": number, "riskPct": number },
    { "years": 5, "expectedReturnPct": number, "riskPct": number },
    { "years": 10, "expectedReturnPct": number, "riskPct": number },
    { "years": 15, "expectedReturnPct": number, "riskPct": number },
    { "years": 20, "expectedReturnPct": number, "riskPct": number }
  ],
  "allocationEvolution": [
    { "year": 3, "equityPct": number, "debtPct": number, "metalPct": number, "cashPct": number },
    { "year": 5, "equityPct": number, "debtPct": number, "metalPct": number, "cashPct": number },
    { "year": 10, "equityPct": number, "debtPct": number, "metalPct": number, "cashPct": number },
    { "year": 15, "equityPct": number, "debtPct": number, "metalPct": number, "cashPct": number },
    { "year": 20, "equityPct": number, "debtPct": number, "metalPct": number, "cashPct": number }
  ],
  "keyInsights": ["bullet 1", "bullet 2"],
  "caveats": ["caveat 1"]
}

Show how risk/return changes after the buy over ${years}Y horizon.`;
}

function tryParseJson(raw) {
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

const RECOMMENDATION_COLOR = {
  GO_AHEAD: 'text-green-400',
  MODIFY_AMOUNT: 'text-amber-400',
  AVOID: 'text-rose',
  DEFER: 'text-amber-400',
  STRONG: 'text-green-400',
  GOOD: 'text-teal-400',
  NEEDS_ATTENTION: 'text-amber-400',
  REBALANCE: 'text-rose',
};

function RiskReturnChart({ data }) {
  if (!data?.length) return null;
  const chartData = data.map((d) => ({
    ...d,
    label: `${d.years}Y`,
    expectedReturnPct: Number(d.expectedReturnPct) ?? 0,
    riskPct: Number(d.riskPct) ?? 0,
  }));

  return (
    <div className="card">
      <p className="stat-label mb-3 flex items-center gap-2">
        <TrendingUp size={14} /> Risk vs return over horizon
      </p>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} width={36} tickFormatter={(v) => `${v}%`} />
            <Tooltip
              contentStyle={{ background: '#1e2330', border: '1px solid #2a3040', borderRadius: 8, fontSize: 12, color: '#e5e7eb' }}
              formatter={(v) => [`${v}%`, '']}
              labelFormatter={(l) => `Horizon: ${l}`}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => <span style={{ color: '#94a3b8' }}>{v}</span>} />
            <Line type="monotone" dataKey="expectedReturnPct" name="Expected return" stroke="#2dd4bf" strokeWidth={2} dot={{ fill: '#2dd4bf', r: 4 }} />
            <Line type="monotone" dataKey="riskPct" name="Risk (volatility)" stroke="#f97316" strokeWidth={2} dot={{ fill: '#f97316', r: 4 }} strokeDasharray="4 4" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const ALLOC_COLORS = { equityPct: '#2dd4bf', debtPct: '#a78bfa', metalPct: '#f0c040', cashPct: '#6b7280' };

function AllocationChart({ data }) {
  if (!data?.length) return null;
  const chartData = data.map((d) => ({
    ...d,
    label: `${d.year}Y`,
    equityPct: Number(d.equityPct) || 0,
    debtPct: Number(d.debtPct) || 0,
    metalPct: Number(d.metalPct) || 0,
    cashPct: Number(d.cashPct) || 0,
  }));

  return (
    <div className="card">
      <p className="stat-label mb-3 flex items-center gap-2">
        <BarChart3 size={14} /> Allocation evolution
      </p>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }} barCategoryGap="15%">
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} width={36} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
            <Tooltip
              contentStyle={{ background: '#1e2330', border: '1px solid #2a3040', borderRadius: 8, fontSize: 12, color: '#e5e7eb' }}
              formatter={(v) => [`${v}%`, '']}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => <span style={{ color: '#94a3b8' }}>{v}</span>} />
            <Bar dataKey="equityPct" name="Equity" stackId="a" fill={ALLOC_COLORS.equityPct} radius={[0, 0, 0, 0]} />
            <Bar dataKey="debtPct" name="Debt" stackId="a" fill={ALLOC_COLORS.debtPct} radius={[0, 0, 0, 0]} />
            <Bar dataKey="metalPct" name="Metal" stackId="a" fill={ALLOC_COLORS.metalPct} radius={[0, 0, 0, 0]} />
            <Bar dataKey="cashPct" name="Cash" stackId="a" fill={ALLOC_COLORS.cashPct} radius={[0, 0, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const defaultTradeRow = () => ({
  mode: 'buy',
  instrumentId: TRADE_INSTRUMENTS[0]?.id || '',
  sellInstrument: '',
  amount: '25000',
});

export default function TradeFeedbackCard({ defaultPortfolioContext = '', holdings = [] }) {
  const [activeTab, setActiveTab] = useState(0); // 0 = General, 1+ = Trade 1, 2, ...
  const [portfolioContext, setPortfolioContext] = useState(defaultPortfolioContext);
  const [years, setYears] = useState(10);
  const [tradeRows, setTradeRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [error, setError] = useState(null);

  const holdingsForSell = holdings.filter((h) => h.net > 0);
  const isGeneral = activeTab === 0;
  const currentRow = activeTab > 0 ? tradeRows[activeTab - 1] : null;

  const addRow = () => {
    setTradeRows((prev) => [...prev, defaultTradeRow()]);
    setActiveTab(tradeRows.length + 1);
  };

  const removeRow = (idx) => {
    setTradeRows((prev) => prev.filter((_, i) => i !== idx));
    setActiveTab(Math.max(0, activeTab - (activeTab > idx ? 1 : 0)));
  };

  const updateRow = (idx, field, value) => {
    setTradeRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isGeneral && currentRow) {
      const amt = parseInt(currentRow.amount, 10);
      if (isNaN(amt) || amt <= 0) return;
      if (currentRow.mode === 'sell' && !currentRow.sellInstrument) return;
    }
    setLoading(true);
    setError(null);
    setFeedback(null);
    try {
      const mode = isGeneral ? 'general' : currentRow.mode;
      const inst = isGeneral ? null : (currentRow.mode === 'sell'
        ? { name: currentRow.sellInstrument, ticker: currentRow.sellInstrument }
        : TRADE_INSTRUMENTS.find((i) => i.id === currentRow.instrumentId) || TRADE_INSTRUMENTS[0]);
      const amt = isGeneral ? 0 : parseInt(currentRow.amount, 10);
      const prompt = buildPrompt(mode, portfolioContext, years, inst, amt, holdingsForSell);
      const res = await api.post('/chat', {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2500,
        messages: [{ role: 'user', content: prompt }],
      });
      const text = (res.data.content || []).map((c) => c.text || '').join('');
      const parsed = tryParseJson(text);
      setFeedback(parsed || { raw: text });
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const isStructured = feedback && typeof feedback === 'object' && !feedback.raw;

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare size={18} className="text-accent" />
        <h2 className="font-display font-semibold text-white text-lg">Portfolio feedback</h2>
      </div>
      <p className="text-muted text-sm mb-4">
        0 rows = general insight. Add trade rows as tabs to get feedback on buy/sell.
      </p>

      {/* Tabs: General + Trade 1, Trade 2, ... + Add */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          type="button"
          onClick={() => setActiveTab(0)}
          className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 0 ? 'bg-accent text-ink' : 'bg-surface text-soft hover:text-white'
          }`}
        >
          General
        </button>
        {tradeRows.map((row, i) => (
          <div key={i} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveTab(i + 1)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === i + 1 ? 'bg-accent text-ink' : 'bg-surface text-soft hover:text-white'
              }`}
            >
              Trade {i + 1}
            </button>
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="p-1.5 rounded text-muted hover:text-rose hover:bg-rose/10"
              title="Remove"
            >
              <X size={14} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addRow}
          className="px-3 py-2 rounded-lg text-sm font-medium bg-surface text-soft hover:text-white flex items-center gap-1"
        >
          <Plus size={14} /> Add trade
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Years to keep goal portfolio</label>
          <select className="input w-auto" value={years} onChange={(e) => setYears(Number(e.target.value))}>
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>{y} years</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Portfolio / goal</label>
          <textarea
            className="input min-h-[72px] resize-y"
            placeholder="e.g. Current: 50% Nifty, 30% Gold, 20% US. Goal: Balanced."
            value={portfolioContext}
            onChange={(e) => setPortfolioContext(e.target.value)}
            rows={2}
          />
        </div>

        {isGeneral ? (
          <p className="text-muted text-sm">General insight: no trades. Analyze current holdings only.</p>
        ) : currentRow && (
          <div className="space-y-4 p-4 rounded-xl bg-surface/50 border border-border">
            <div>
              <label className="label">Mode</label>
              <div className="flex gap-2">
                {['buy', 'sell'].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => updateRow(activeTab - 1, 'mode', m)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium capitalize ${
                      currentRow.mode === m ? 'bg-accent text-ink' : 'bg-card text-soft hover:text-white'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            {currentRow.mode === 'buy' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Instrument</label>
                  <select
                    className="input"
                    value={currentRow.instrumentId}
                    onChange={(e) => updateRow(activeTab - 1, 'instrumentId', e.target.value)}
                  >
                    {TRADE_INSTRUMENTS.map((i) => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Amount (₹)</label>
                  <input
                    type="number"
                    className="input"
                    min={1}
                    value={currentRow.amount}
                    onChange={(e) => updateRow(activeTab - 1, 'amount', e.target.value)}
                  />
                </div>
              </div>
            )}
            {currentRow.mode === 'sell' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Sell from</label>
                  <select
                    className="input"
                    value={currentRow.sellInstrument}
                    onChange={(e) => updateRow(activeTab - 1, 'sellInstrument', e.target.value)}
                  >
                    <option value="">Select holding</option>
                    {holdingsForSell.map((h, i) => (
                      <option key={i} value={h.instrument}>{h.instrument} — ₹{h.net?.toLocaleString('en-IN')}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Amount (₹)</label>
                  <input
                    type="number"
                    className="input"
                    min={1}
                    value={currentRow.amount}
                    onChange={(e) => updateRow(activeTab - 1, 'amount', e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <button type="submit" disabled={loading} className="btn-primary flex items-center gap-2">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <MessageSquare size={16} />}
          {loading ? 'Analyzing…' : isGeneral ? 'Get insight' : 'Get feedback'}
        </button>
      </form>

      {error && (
        <div className="mt-4 p-3 rounded-lg bg-rose/10 border border-rose/30 text-rose text-sm">{error}</div>
      )}

      {feedback && !loading && (
        <div className="mt-4 space-y-4">
          {isStructured ? (
            <>
              <div className="p-4 rounded-xl bg-accent/5 border border-accent/20">
                <p className="text-soft text-sm leading-relaxed">{feedback.insight}</p>
                {feedback.recommendation && (
                  <p className={`mt-2 font-semibold ${RECOMMENDATION_COLOR[feedback.recommendation] || 'text-white'}`}>
                    {feedback.recommendation.replace(/_/g, ' ')}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <RiskReturnChart data={feedback.riskReturnProjection} />
                <AllocationChart data={feedback.allocationEvolution} />
              </div>
              {feedback.keyInsights?.length > 0 && (
                <div className="card">
                  <p className="stat-label mb-2">Key insights</p>
                  <ul className="space-y-1.5 text-sm text-soft">
                    {feedback.keyInsights.map((k, i) => (
                      <li key={i} className="flex gap-2"><span className="text-accent shrink-0">•</span>{k}</li>
                    ))}
                  </ul>
                </div>
              )}
              {feedback.caveats?.length > 0 && (
                <div className="card border-amber-400/30">
                  <p className="text-amber-400 text-xs font-semibold uppercase tracking-wider mb-2">Caveats</p>
                  <ul className="space-y-1 text-sm text-soft">
                    {feedback.caveats.map((c, i) => (
                      <li key={i} className="flex gap-2"><span className="text-amber-400 shrink-0">⚠</span>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="p-4 rounded-xl bg-accent/5 border border-accent/20">
              <div className="text-soft text-sm whitespace-pre-wrap">{feedback.raw}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
