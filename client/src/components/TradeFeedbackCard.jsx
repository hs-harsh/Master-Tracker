import { useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, PieChart, Pie, Cell,
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

const NO_TRADE_SCHEMA = `{
  "insight": "2-4 sentence assessment of current portfolio",
  "riskReturnProjection": [
    { "years": 3, "expectedReturnPct": number, "riskPct": number },
    { "years": 5, "expectedReturnPct": number, "riskPct": number },
    { "years": 10, "expectedReturnPct": number, "riskPct": number },
    { "years": 15, "expectedReturnPct": number, "riskPct": number },
    { "years": 20, "expectedReturnPct": number, "riskPct": number }
  ],
  "byRiskLevel": {
    "high": {
      "targetRiskSplit": "e.g. 70% equity, 20% debt, 10% cash",
      "targetAllocation": { "equityPct": number, "debtPct": number, "metalPct": number, "cashPct": number },
      "riskReturnChange": "1-2 sentences: how risk/return would change from current",
      "expectedReturnPct": number,
      "riskPct": number
    },
    "medium": { "targetRiskSplit": "...", "targetAllocation": {...}, "riskReturnChange": "...", "expectedReturnPct": number, "riskPct": number },
    "low": { "targetRiskSplit": "...", "targetAllocation": {...}, "riskReturnChange": "...", "expectedReturnPct": number, "riskPct": number }
  },
  "keyInsights": ["bullet 1", "bullet 2"],
  "caveats": ["caveat 1"]
}`;

const TRADE_SCHEMA = `{
  "insight": "2-4 sentence assessment of proposed trades",
  "byRiskLevel": {
    "high": {
      "allocationBefore": { "equityPct": number, "debtPct": number, "metalPct": number, "cashPct": number },
      "allocationAfter": { "equityPct": number, "debtPct": number, "metalPct": number, "cashPct": number },
      "riskReturnProfile": "1-2 sentences: changed risk-return after trades",
      "expectedReturnPct": number,
      "riskPct": number,
      "optimalAmount": "1-2 sentences: recommended amount for each trade"
    },
    "medium": { "allocationBefore": {...}, "allocationAfter": {...}, "riskReturnProfile": "...", "expectedReturnPct": number, "riskPct": number, "optimalAmount": "..." },
    "low": { "allocationBefore": {...}, "allocationAfter": {...}, "riskReturnProfile": "...", "expectedReturnPct": number, "riskPct": number, "optimalAmount": "..." }
  },
  "keyInsights": ["bullet 1", "bullet 2"],
  "caveats": ["caveat 1"]
}`;

function buildPrompt(portfolioContext, years, trades, holdings) {
  const ctx = (portfolioContext || '').trim();
  const holdingsStr = holdings?.length
    ? `CURRENT HOLDINGS:\n${holdings.map((h) => `- ${h.instrument}: ₹${h.net?.toLocaleString('en-IN')}`).join('\n')}`
    : 'No holdings data.';

  const base = `You are a portfolio advisor. Return ONLY valid JSON. No markdown, no code fences.

PORTFOLIO CONTEXT (derived from holdings):
${ctx || '(None provided)'}

YEARS HORIZON: ${years} years

${holdingsStr}`;

  if (!trades?.length) {
    return `${base}

MODE: General insight (no trades). For each risk level (high, medium, low), provide:
1. targetRiskSplit: ideal risk split (equity/debt/cash %) they should target
2. targetAllocation: numeric { equityPct, debtPct, metalPct, cashPct } summing to 100
3. riskReturnChange: how risk and return would change from current
4. expectedReturnPct, riskPct: projected return % and volatility % at target allocation

Return this JSON:
${NO_TRADE_SCHEMA}

Use realistic CAGR and volatility for current allocation.`;
  }

  const tradesStr = trades.map((t, i) => {
    const inst = t.mode === 'sell'
      ? t.sellInstrument
      : (TRADE_INSTRUMENTS.find((x) => x.id === t.instrumentId)?.name || t.instrumentId);
    return `${i + 1}. ${t.mode.toUpperCase()}: ₹${t.amount} in ${inst}`;
  }).join('\n');

  return `${base}

PROPOSED TRADES (apply all together):
${tradesStr}

MODE: Trade feedback. For each risk level (high, medium, low), provide:
1. allocationBefore: current asset allocation (equityPct, debtPct, metalPct, cashPct)
2. allocationAfter: allocation after applying the proposed trades
3. riskReturnProfile: how risk-return changes after trades
4. expectedReturnPct, riskPct: projected return % and volatility % after trades
5. optimalAmount: recommendation for optimal amount for each trade

Return this JSON:
${TRADE_SCHEMA}`;
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
const ALLOC_KEYS = ['equityPct', 'debtPct', 'metalPct', 'cashPct'];
const ALLOC_LABELS = { equityPct: 'Equity', debtPct: 'Debt', metalPct: 'Metal', cashPct: 'Cash' };

function MiniAllocationPie({ alloc, title }) {
  if (!alloc) return null;
  const data = ALLOC_KEYS
    .map((k) => ({ name: ALLOC_LABELS[k], value: Number(alloc[k]) || 0, key: k }))
    .filter((d) => d.value > 0);
  if (data.length === 0) return null;
  return (
    <div>
      {title && <p className="text-xs text-muted mb-1">{title}</p>}
      <ResponsiveContainer width="100%" height={80}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={20}
            outerRadius={35}
            paddingAngle={1}
            dataKey="value"
          >
            {data.map((d) => (
              <Cell key={d.name} fill={ALLOC_COLORS[d.key] || '#6b7280'} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: '#1e2330', border: '1px solid #2a3040', borderRadius: 6, fontSize: 11 }}
            formatter={(v) => [`${v}%`, '']}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

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
  const [years, setYears] = useState(10);
  const [tradeRows, setTradeRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [error, setError] = useState(null);

  const holdingsForSell = holdings.filter((h) => h.net > 0);
  const allHoldings = holdings.filter((h) => h.net !== 0);

  const addRow = () => {
    setTradeRows((prev) => [...prev, defaultTradeRow()]);
  };

  const removeRow = (idx) => {
    setTradeRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateRow = (idx, field, value) => {
    setTradeRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validTrades = tradeRows.filter((r) => {
      const amt = parseInt(r.amount, 10);
      if (isNaN(amt) || amt <= 0) return false;
      if (r.mode === 'sell' && !r.sellInstrument) return false;
      return true;
    });
    setLoading(true);
    setError(null);
    setFeedback(null);
    try {
      const prompt = buildPrompt(defaultPortfolioContext, years, validTrades, allHoldings);
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

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="label text-sm">Years</label>
          <select className="input w-auto py-2" value={years} onChange={(e) => setYears(Number(e.target.value))}>
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>{y}Y</option>
            ))}
          </select>
        </div>

        {/* Trades form */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label">Trades</label>
            <button
              type="button"
              onClick={addRow}
              className="btn-ghost text-sm flex items-center gap-1.5 text-accent hover:text-accent/80"
            >
              <Plus size={14} /> Add row
            </button>
          </div>
          {tradeRows.length === 0 ? (
            <p className="text-muted text-sm py-3 px-4 rounded-lg bg-surface/50 border border-border">
              No trades. Add rows or get insight for general analysis.
            </p>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface/60 border-b border-border">
                    <th className="text-left py-2.5 px-3 text-muted font-display text-xs uppercase tracking-wider w-24">Type</th>
                    <th className="text-left py-2.5 px-3 text-muted font-display text-xs uppercase tracking-wider">Instrument</th>
                    <th className="text-left py-2.5 px-3 text-muted font-display text-xs uppercase tracking-wider w-28">Amount (₹)</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {tradeRows.map((row, i) => (
                    <tr key={i} className="border-b border-border/40 last:border-0 hover:bg-surface/30">
                      <td className="py-2 px-3">
                        <div className="flex gap-1">
                          {['buy', 'sell'].map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => updateRow(i, 'mode', m)}
                              className={`px-2 py-1 rounded text-xs font-medium capitalize ${
                                row.mode === m ? 'bg-accent text-ink' : 'bg-card text-soft hover:text-white'
                              }`}
                            >
                              {m}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        {row.mode === 'buy' ? (
                          <select
                            className="input py-1.5 text-sm min-w-[140px]"
                            value={row.instrumentId}
                            onChange={(e) => updateRow(i, 'instrumentId', e.target.value)}
                          >
                            {TRADE_INSTRUMENTS.map((inst) => (
                              <option key={inst.id} value={inst.id}>{inst.name}</option>
                            ))}
                          </select>
                        ) : (
                          <select
                            className="input py-1.5 text-sm min-w-[140px]"
                            value={row.sellInstrument}
                            onChange={(e) => updateRow(i, 'sellInstrument', e.target.value)}
                          >
                            <option value="">Select holding</option>
                            {holdingsForSell.map((h, hi) => (
                              <option key={hi} value={h.instrument}>{h.instrument} — ₹{h.net?.toLocaleString('en-IN')}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="number"
                          className="input py-1.5 text-sm w-24"
                          min={1}
                          placeholder="Amount"
                          value={row.amount}
                          onChange={(e) => updateRow(i, 'amount', e.target.value)}
                        />
                      </td>
                      <td className="py-2 px-2">
                        <button
                          type="button"
                          onClick={() => removeRow(i)}
                          className="p-1.5 rounded text-muted hover:text-rose hover:bg-rose/10"
                          title="Remove row"
                        >
                          <X size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <button type="submit" disabled={loading} className="btn-primary flex items-center gap-2">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <MessageSquare size={16} />}
          {loading ? 'Analyzing…' : 'Get insight'}
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
              </div>
              {feedback.byRiskLevel && (
                <div className="card">
                  <p className="stat-label mb-3">By risk profile</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {['high', 'medium', 'low'].map((k) => {
                      const r = feedback.byRiskLevel[k];
                      if (!r) return null;
                      const isTradeMode = r.allocationBefore != null && r.allocationAfter != null;
                      return (
                        <div key={k} className="p-4 rounded-xl bg-surface/50 border border-border space-y-3">
                          <p className="text-xs font-semibold text-white uppercase tracking-wider capitalize">{k} risk</p>
                          {isTradeMode ? (
                            <>
                              <div className="grid grid-cols-2 gap-2">
                                <MiniAllocationPie alloc={r.allocationBefore} title="Before" />
                                <MiniAllocationPie alloc={r.allocationAfter} title="After" />
                              </div>
                              {(r.expectedReturnPct != null || r.riskPct != null) && (
                                <div className="flex gap-3 text-xs">
                                  {r.expectedReturnPct != null && <span className="text-accent">Return: {Number(r.expectedReturnPct).toFixed(1)}%</span>}
                                  {r.riskPct != null && <span className="text-amber-400">Risk: {Number(r.riskPct).toFixed(1)}%</span>}
                                </div>
                              )}
                              {r.riskReturnProfile && <p className="text-sm text-soft">{r.riskReturnProfile}</p>}
                              {r.optimalAmount && <p className="text-sm text-accent font-medium">{r.optimalAmount}</p>}
                            </>
                          ) : (
                            <>
                              <MiniAllocationPie alloc={r.targetAllocation} title="Target allocation" />
                              {(r.expectedReturnPct != null || r.riskPct != null) && (
                                <div className="flex gap-3 text-xs">
                                  {r.expectedReturnPct != null && <span className="text-accent">Return: {Number(r.expectedReturnPct).toFixed(1)}%</span>}
                                  {r.riskPct != null && <span className="text-amber-400">Risk: {Number(r.riskPct).toFixed(1)}%</span>}
                                </div>
                              )}
                              {r.targetRiskSplit && <p className="text-sm text-soft"><span className="text-muted">Target:</span> {r.targetRiskSplit}</p>}
                              {r.riskReturnChange && <p className="text-sm text-soft"><span className="text-muted">Change:</span> {r.riskReturnChange}</p>}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {feedback.riskReturnProjection?.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <RiskReturnChart data={feedback.riskReturnProjection} />
                  {feedback.allocationEvolution?.length > 0 && <AllocationChart data={feedback.allocationEvolution} />}
                </div>
              )}
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
