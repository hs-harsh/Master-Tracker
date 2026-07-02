import { useEffect, useMemo, useState } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Legend, ComposedChart, Line, CartesianGrid,
} from 'recharts';
import { PieChart as PieIcon, Target, Wallet, Loader2 } from 'lucide-react';
import api from '../lib/api';
import { fmt } from '../lib/utils';
import TradeFeedbackCard from '../components/TradeFeedbackCard';
import { useAuth } from '../hooks/useAuth';

const RISK_COLORS  = { Low: '#60a5fa', Medium: '#fbbf24', High: '#f97316' };
const ASSET_COLORS = { Equity: '#f97316', Debt: '#60a5fa', Gold: '#fbbf24', Cash: '#6b7280', 'Real Estate': '#a78bfa', Crypto: '#ec4899' };
const BROKER_COLORS = ['#2dd4bf', '#f0c040', '#60a5fa', '#a78bfa', '#fb7185', '#34d399', '#f97316', '#6b7280'];

const riskForAsset = asset => {
  switch (asset) {
    case 'Cash': case 'Debt': return 'Low';
    case 'Gold': case 'Real Estate': return 'Medium';
    default: return 'High';
  }
};

const TT = { background: '#1e2330', border: '1px solid #2a3040', borderRadius: 8, fontSize: 12, color: '#e5e7eb' };

export default function Portfolio() {
  const { personName, activePerson, dataVersion, token } = useAuth();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [goalFilter, setGoalFilter] = useState('');
  const [brokerFilter, setBrokerFilter] = useState('');
  const [fxRates, setFxRates] = useState({ INR: 1 });
  const [fxFetching, setFxFetching] = useState(false);

  const currentPerson = activePerson || personName;

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (currentPerson) params.set('account', currentPerson);
    api.get(`/investments?${params}`).then(r => setData(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [currentPerson, dataVersion]);

  const fetchFxRates = async () => {
    setFxFetching(true);
    try {
      const { data: rates } = await api.get('/investments/fx-rates');
      setFxRates({ INR: 1, ...rates });
    } catch (_) { /* non-critical */ } finally {
      setFxFetching(false);
    }
  };
  useEffect(() => { if (token) fetchFxRates(); }, [token]);

  const goals   = useMemo(() => Array.from(new Set(data.map(d => d.goal))).sort(), [data]);
  const brokers = useMemo(() => Array.from(new Set(data.map(d => d.broker || '').filter(Boolean))).sort(), [data]);

  const goalInvestments = useMemo(() => {
    let list = data;
    if (goalFilter)   list = list.filter(d => d.goal === goalFilter);
    if (brokerFilter) list = list.filter(d => (d.broker || '') === brokerFilter);
    return list;
  }, [data, goalFilter, brokerFilter]);

  // ── Aggregated positions with weighted avg price ──────────────────────────
  const aggregated = useMemo(() => {
    const map = {};
    goalInvestments.forEach(inv => {
      const key = `${inv.goal}|${inv.account}|${inv.asset_class}|${inv.instrument}|${inv.broker || ''}`;
      if (!map[key]) {
        map[key] = {
          goal: inv.goal, account: inv.account, asset_class: inv.asset_class,
          instrument: inv.instrument, broker: inv.broker || '—',
          ticker: inv.ticker || '', currency: inv.currency || 'INR',
          net: 0, buyQty: 0, sellQty: 0, weightedSum: 0,
        };
      }
      const e   = map[key];
      const amt = Number(inv.amount);
      const qty = inv.qty ? Number(inv.qty) : 0;
      const price = inv.avg_price ? Number(inv.avg_price) : 0;
      if (inv.side === 'SELL') { e.net -= amt; e.sellQty += qty; }
      else {
        e.net += amt; e.buyQty += qty;
        if (price > 0 && qty > 0) e.weightedSum += price * qty;
      }
      if (inv.ticker && !e.ticker) e.ticker = inv.ticker;
      if (inv.currency && inv.currency !== 'INR') e.currency = inv.currency;
    });
    return Object.values(map)
      .filter(r => r.net !== 0)
      .map(r => ({
        ...r,
        netQty:    Math.max(0, r.buyQty - r.sellQty),
        wavgPrice: r.buyQty > 0 && r.weightedSum > 0 ? r.weightedSum / r.buyQty : null,
      }))
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  }, [goalInvestments]);

  // ── Convert invested amounts to INR using live FX rate (per position's currency) ──
  const enriched = useMemo(() => aggregated.map(row => {
    const fx = fxRates[row.currency] || 1;
    return { ...row, netOriginal: row.net, net: row.net * fx, wavgPrice: row.wavgPrice ? row.wavgPrice * fx : null, fx };
  }), [aggregated, fxRates]);

  const totalNet = enriched.reduce((s, r) => s + r.net, 0);

  // ── Per-currency breakdown (invested amount in each original currency) ────
  const ccyBreakdown = useMemo(() => {
    const inv = {};
    enriched.forEach(r => {
      const ccy = r.currency || 'INR';
      inv[ccy] = (inv[ccy] || 0) + r.netOriginal;
    });
    return inv;
  }, [enriched]);

  // ── Chart buckets ─────────────────────────────────────────────────────────
  const riskBuckets = {}, assetBuckets = {}, brokerBuckets = {};
  goalInvestments.forEach(inv => {
    const s = inv.side === 'SELL' ? -Number(inv.amount) : Number(inv.amount);
    riskBuckets[riskForAsset(inv.asset_class)] = (riskBuckets[riskForAsset(inv.asset_class)] || 0) + s;
    assetBuckets[inv.asset_class]              = (assetBuckets[inv.asset_class] || 0) + s;
    brokerBuckets[inv.broker || '—']            = (brokerBuckets[inv.broker || '—'] || 0) + s;
  });

  const riskPie   = Object.entries(riskBuckets).map(([name, value]) => ({ name, value }));
  const brokerPie = Object.entries(brokerBuckets).filter(([, v]) => v !== 0).map(([name, value]) => ({ name, value }));

  const assetCompare = useMemo(() => {
    const inv = {};
    enriched.forEach(r => {
      inv[r.asset_class] = (inv[r.asset_class] || 0) + r.net;
    });
    return Object.keys(inv).map(name => ({
      name,
      Invested: +(inv[name] / 100000).toFixed(2),
    }));
  }, [enriched]);

  // Portfolio growth: cumulative invested over time
  const growthData = useMemo(() => {
    const sorted = [...data].sort((a, b) => new Date(a.date) - new Date(b.date));
    let cum = 0;
    return sorted.map(r => {
      cum += r.side === 'SELL' ? -Number(r.amount) : Number(r.amount);
      return { date: r.date?.slice(0, 7), value: +(cum / 100000).toFixed(2) };
    }).filter((r, i, arr) => i === arr.length - 1 || r.date !== arr[i + 1]?.date);
  }, [data]);

  const equityVal = Math.max(0, assetBuckets.Equity || 0) + Math.max(0, assetBuckets.Crypto || 0);
  const debtVal   = Math.max(0, assetBuckets.Debt || 0);
  const goldVal   = Math.max(0, assetBuckets.Gold || 0) + Math.max(0, assetBuckets['Real Estate'] || 0);
  const cashVal   = Math.max(0, assetBuckets.Cash || 0);
  const totalAbs  = equityVal + debtVal + goldVal + cashVal || 1;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-white">
              {currentPerson ? `${currentPerson}'s Portfolio` : 'Goal Portfolio'}
            </h1>
            <p className="text-muted text-sm mt-0.5">View by account and filter by goal</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-muted text-xs uppercase tracking-wider">Goal</label>
            <select value={goalFilter} onChange={e => setGoalFilter(e.target.value)} className="input py-2 text-sm min-w-[160px]">
              <option value="">All goals</option>
              {goals.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-muted text-xs uppercase tracking-wider">Broker</label>
            <select value={brokerFilter} onChange={e => setBrokerFilter(e.target.value)} className="input py-2 text-sm min-w-[140px]">
              <option value="">All brokers</option>
              {brokers.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="card flex flex-col">
          <div className="flex items-center gap-2 text-muted mb-1"><Wallet size={14} /><span className="stat-label text-xs">Net Invested</span></div>
          <span className="font-mono text-lg font-bold text-accent">{fmt(totalNet)}</span>
        </div>
        <div className="card flex flex-col">
          <div className="flex items-center gap-2 text-muted mb-1"><Target size={14} /><span className="stat-label text-xs">Positions</span></div>
          <span className="font-mono text-lg font-bold text-white">{enriched.length}</span>
        </div>
        <div className="card flex flex-col">
          <div className="flex items-center gap-2 text-muted mb-1"><PieIcon size={14} /><span className="stat-label text-xs">Equity</span></div>
          <span className="font-mono text-lg font-bold" style={{ color: ASSET_COLORS.Equity }}>{(equityVal / totalAbs * 100).toFixed(1)}%</span>
        </div>
        <div className="card flex flex-col">
          <div className="flex items-center gap-2 text-muted mb-1"><PieIcon size={14} /><span className="stat-label text-xs">Debt</span></div>
          <span className="font-mono text-lg font-bold" style={{ color: ASSET_COLORS.Debt }}>{(debtVal / totalAbs * 100).toFixed(1)}%</span>
        </div>
        <div className="card flex flex-col">
          <div className="flex items-center gap-2 text-muted mb-1"><PieIcon size={14} /><span className="stat-label text-xs">Gold/RE</span></div>
          <span className="font-mono text-lg font-bold" style={{ color: ASSET_COLORS.Gold }}>{(goldVal / totalAbs * 100).toFixed(1)}%</span>
        </div>
      </div>

      {/* ── Per-currency breakdown ──────────────────────────────────────── */}
      {Object.keys(ccyBreakdown).some(c => c !== 'INR') && (
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <p className="stat-label text-xs">Currency Breakdown</p>
            <div className="flex items-center gap-1.5">
              <span className="text-muted text-xs font-mono">
                {fxFetching
                  ? <span className="animate-pulse">Fetching…</span>
                  : <>{fxRates.USD ? `$1=₹${fxRates.USD.toFixed(1)}` : '$1=₹—'} · {fxRates.GBP ? `£1=₹${fxRates.GBP.toFixed(1)}` : '£1=₹—'}</>
                }
              </span>
              <button type="button" onClick={fetchFxRates} disabled={fxFetching}
                className="text-muted hover:text-accent transition-colors disabled:opacity-40" title="Refresh FX rates">
                <Loader2 size={11} className={fxFetching ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs font-mono">
            {['INR', 'USD', 'GBP'].filter(c => ccyBreakdown[c]).map(c => {
              const sym = c === 'INR' ? '₹' : c === 'USD' ? '$' : '£';
              const inv = ccyBreakdown[c] || 0;
              const invINR = inv * (fxRates[c] || 1);
              return (
                <div key={c} className="flex flex-col gap-0.5">
                  <span className="text-muted text-[10px] uppercase tracking-wider">{c}</span>
                  <span className="text-soft">
                    Invested: <span className="text-accent">{sym}{inv.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                    {c !== 'INR' && <span className="text-muted"> = ₹{invINR.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>}
                  </span>
                </div>
              );
            })}
            <div className="flex flex-col gap-0.5 border-l border-border pl-6">
              <span className="text-muted text-[10px] uppercase tracking-wider">Total (INR)</span>
              <span className="text-soft">Invested: <span className="text-accent font-bold">{fmt(totalNet)}</span></span>
            </div>
          </div>
        </div>
      )}

      <TradeFeedbackCard
        key={`portfolio-${goalFilter}-${enriched.filter(r => r.net > 0).length}`}
        defaultPortfolioContext={enriched.length > 0
          ? `Current: ${enriched.filter(r => r.net > 0).slice(0, 12).map(r => `${r.instrument} ₹${fmt(r.net)}`).join(', ')}${enriched.filter(r => r.net > 0).length > 12 ? '…' : ''}. Goal: ${goalFilter || 'Balanced'}`
          : ''}
        holdings={enriched}
      />

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Risk pie */}
        <div className="card">
          <p className="stat-label mb-3">Risk Mix</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={riskPie} cx="50%" cy="45%" innerRadius={45} outerRadius={70} dataKey="value" strokeWidth={0} labelLine={false}>
                {riskPie.map(d => <Cell key={d.name} fill={RISK_COLORS[d.name] || '#9ca3af'} />)}
              </Pie>
              <Legend layout="horizontal" align="center" verticalAlign="bottom" formatter={v => <span style={{ color: '#e5e7eb', fontSize: 12 }}>{v}</span>} iconType="circle" iconSize={8} wrapperStyle={{ paddingTop: 8 }} />
              <Tooltip contentStyle={TT} content={({ active, payload }) => active && payload?.[0] ? (
                <div style={{ padding: '6px 10px', ...TT }}><strong>{payload[0].name}</strong>: {fmt(payload[0].value)}</div>
              ) : null} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* By Asset Class */}
        <div className="card">
          <p className="stat-label mb-3">By Asset Class (₹L)</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={assetCompare} margin={{ top: 4, right: 4, bottom: 20, left: 0 }}>
              <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 9 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `${v}L`} />
              <Tooltip contentStyle={TT} content={({ active, payload }) => active && payload?.length ? (
                <div style={{ padding: '6px 10px', ...TT }}>
                  <div className="font-bold mb-1">{payload[0]?.payload?.name}</div>
                  {payload.map(p => <div key={p.name}><span style={{ color: p.color }}>{p.name}</span>: ₹{(p.value * 100000).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>)}
                </div>
              ) : null} />
              <Bar dataKey="Invested" fill="#60a5fa" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* By Broker */}
        <div className="card">
          <p className="stat-label mb-3">By Broker Account</p>
          {brokerPie.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={brokerPie} cx="50%" cy="45%" innerRadius={40} outerRadius={65} dataKey="value" strokeWidth={0}>
                  {brokerPie.map((d, i) => <Cell key={d.name} fill={BROKER_COLORS[i % BROKER_COLORS.length]} />)}
                </Pie>
                <Legend layout="horizontal" align="center" verticalAlign="bottom" formatter={v => <span style={{ color: '#e5e7eb', fontSize: 11 }}>{v}</span>} iconType="circle" iconSize={6} wrapperStyle={{ paddingTop: 6 }} />
                <Tooltip contentStyle={TT} content={({ active, payload }) => active && payload?.[0] ? (
                  <div style={{ padding: '6px 10px', ...TT }}><strong>{payload[0].name}</strong>: {fmt(payload[0].value)}</div>
                ) : null} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-muted text-sm">No broker data</div>
          )}
        </div>
      </div>

      {/* Portfolio growth chart */}
      {growthData.length > 1 && (
        <div className="card">
          <p className="stat-label mb-3">Portfolio Growth — Cumulative Invested (₹L)</p>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={growthData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a3040" />
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={TT} content={({ active, payload }) => active && payload?.[0] ? (
                <div style={{ padding: '6px 10px', ...TT }}>{payload[0].payload.date}: <strong>{payload[0].value} L</strong></div>
              ) : null} />
              <Line type="monotone" dataKey="value" stroke="#f0c040" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Holdings by Instrument — Equity and Non-Equity side by side */}
      {enriched.length > 0 && (() => {
        const equityRows = [...enriched].filter(r => r.asset_class === 'Equity' || r.asset_class === 'Crypto').sort((a, b) => b.net - a.net);
        const nonEquityRows = [...enriched].filter(r => r.asset_class !== 'Equity' && r.asset_class !== 'Crypto').sort((a, b) => b.net - a.net);

        const makeBarData = (rows) => rows.map(r => ({
          name: r.instrument.length > 14 ? r.instrument.slice(0, 13) + '…' : r.instrument,
          fullName: r.instrument,
          assetClass: r.asset_class,
          Invested: +(r.net / 100000).toFixed(2),
          wavgPrice: r.wavgPrice,
          broker: r.broker,
          color: ASSET_COLORS[r.asset_class] || '#9ca3af',
        }));

        const renderChart = (title, rows) => {
          if (rows.length === 0) return null;
          const barData = makeBarData(rows);
          const chartH = Math.max(rows.length * 52 + 80, 180);
          return (
            <div className="card">
              <p className="text-muted text-xs uppercase tracking-wider mb-3">{title}</p>
              <ResponsiveContainer width="100%" height={chartH}>
                <BarChart data={barData} margin={{ top: 4, right: 8, bottom: 60, left: 0 }}>
                  <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 9 }} tickLine={false} axisLine={false}
                    angle={-40} textAnchor="end" interval={0} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 9 }} tickLine={false} axisLine={false}
                    tickFormatter={v => `${v}L`} width={32} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div style={{ padding: '8px 12px', background: '#1a1a2e', border: '1px solid #2d2d44', borderRadius: 8, fontSize: 11 }}>
                          <div className="font-bold text-white mb-1">{d.fullName}</div>
                          <div style={{ color: d.color }} className="text-xs mb-1">{d.assetClass}</div>
                          {d.broker && <div className="text-muted text-xs">{d.broker}</div>}
                          {d.wavgPrice && <div className="text-soft text-xs">Avg: ₹{d.wavgPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>}
                          {payload.map(p => <div key={p.name} style={{ color: p.fill || p.color }} className="text-xs">{p.name}: ₹{(p.value * 100000).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>)}
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="Invested" radius={[3, 3, 0, 0]}>
                    {barData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          );
        };

        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {renderChart('Equity Holdings', equityRows)}
            {renderChart('Non-Equity Holdings (Debt, Gold, Cash, RE)', nonEquityRows)}
          </div>
        );
      })()}

      {/* Full holdings table */}
      <div className="card overflow-hidden">
        <p className="text-muted text-xs mb-3">All positions — net (BUY − SELL) & weighted avg price</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Goal', 'Instrument', 'Asset', 'W.Avg', 'Net Invested', 'Broker'].map(h => (
                  <th key={h} className="text-left py-3 px-4 text-muted font-display text-xs uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-8 text-center text-muted font-mono text-sm animate-pulse">Loading…</td></tr>
              ) : enriched.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-muted">{goalFilter || brokerFilter ? 'No positions for this filter' : 'No investments yet'}</td></tr>
              ) : (
                enriched.map((row, i) => (
                  <tr key={i} className="border-b border-border/40 hover:bg-surface/40 transition-colors">
                    <td className="py-3 px-4 text-xs text-soft">{row.goal}</td>
                    <td className="py-3 px-4 text-xs text-soft max-w-[160px] truncate">{row.instrument}</td>
                    <td className="py-3 px-4 text-xs"><span className="tag bg-card/60">{row.asset_class}</span></td>
                    <td className="py-3 px-4 font-mono text-xs text-soft">
                      {row.wavgPrice
                        ? `₹${row.wavgPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
                        : '—'}
                    </td>
                    <td className="py-3 px-4 font-mono text-soft">{row.net >= 0 ? '' : '−'}{fmt(Math.abs(row.net))}</td>
                    <td className="py-3 px-4 text-xs text-muted">{row.broker}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
