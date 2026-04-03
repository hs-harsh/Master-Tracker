import { useEffect, useMemo, useState } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Legend, ComposedChart, Line, CartesianGrid,
} from 'recharts';
import { PieChart as PieIcon, Target, Wallet, TrendingUp, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
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
  const { personName, activePerson, dataVersion } = useAuth();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [goalFilter, setGoalFilter] = useState('');
  const [brokerFilter, setBrokerFilter] = useState('');
  const [marketPrices, setMarketPrices] = useState({});
  const [fetchingPrices, setFetchingPrices] = useState(false);
  const [expandedAsset, setExpandedAsset] = useState(null);

  const currentPerson = activePerson || personName;

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (currentPerson) params.set('account', currentPerson);
    api.get(`/investments?${params}`).then(r => setData(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [currentPerson, dataVersion]);

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
          ticker: inv.ticker || '', net: 0,
          buyQty: 0, sellQty: 0, weightedSum: 0,
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

  // ── Enrich with live market prices ───────────────────────────────────────
  const enriched = useMemo(() => aggregated.map(row => {
    const mkt = marketPrices[row.instrument];
    if (mkt?.price && row.netQty > 0) {
      const mktValue  = mkt.price * row.netQty;
      const returnAmt = mktValue - row.net;
      const returnPct = row.net > 0 ? (returnAmt / row.net * 100) : 0;
      return { ...row, mktPrice: mkt.price, mktValue, returnAmt, returnPct };
    }
    return { ...row, mktValue: null, returnAmt: null, returnPct: null };
  }), [aggregated, marketPrices]);

  const totalNet       = goalInvestments.reduce((s, inv) => s + (inv.side === 'SELL' ? -Number(inv.amount) : Number(inv.amount)), 0);
  const pricedCount    = enriched.filter(r => r.mktValue !== null).length;
  const hasMktData     = pricedCount > 0;
  const allPriced      = pricedCount === enriched.length && enriched.length > 0;
  // Only sum market value for positions that have live prices; leave unpriced positions out of the total
  const pricedInvested = enriched.filter(r => r.mktValue !== null).reduce((s, r) => s + r.net, 0);
  const totalMktValue  = enriched.filter(r => r.mktValue !== null).reduce((s, r) => s + r.mktValue, 0);
  const totalReturn    = hasMktData ? totalMktValue - pricedInvested : null;
  const totalReturnPct = totalReturn !== null && pricedInvested > 0 ? (totalReturn / pricedInvested * 100) : null;

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
    const inv = {}, mkt = {}, pricedQty = {}, totalQty = {};
    enriched.forEach(r => {
      inv[r.asset_class]      = (inv[r.asset_class] || 0) + r.net;
      totalQty[r.asset_class] = (totalQty[r.asset_class] || 0) + 1;
      if (r.mktValue !== null) {
        mkt[r.asset_class]      = (mkt[r.asset_class] || 0) + r.mktValue;
        pricedQty[r.asset_class] = (pricedQty[r.asset_class] || 0) + 1;
      }
    });
    return Object.keys(inv).map(name => ({
      name,
      Invested:    +(inv[name] / 100000).toFixed(2),
      // Only show MarketValue bar for this asset class if at least one position is priced
      ...(pricedQty[name] ? { MarketValue: +(mkt[name] / 100000).toFixed(2) } : {}),
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

  // Per-asset-class holdings
  const byAssetClass = useMemo(() => {
    const map = {};
    enriched.forEach(r => { if (!map[r.asset_class]) map[r.asset_class] = []; map[r.asset_class].push(r); });
    return map;
  }, [enriched]);

  const equityVal = Math.max(0, assetBuckets.Equity || 0) + Math.max(0, assetBuckets.Crypto || 0);
  const debtVal   = Math.max(0, assetBuckets.Debt || 0);
  const goldVal   = Math.max(0, assetBuckets.Gold || 0) + Math.max(0, assetBuckets['Real Estate'] || 0);
  const cashVal   = Math.max(0, assetBuckets.Cash || 0);
  const totalAbs  = equityVal + debtVal + goldVal + cashVal || 1;

  const handleFetchPrices = async () => {
    const instruments = Array.from(
      new Map(enriched.map(r => [r.instrument, { instrument: r.instrument, ticker: r.ticker }])).values()
    );
    if (!instruments.length) return;
    setFetchingPrices(true);
    try {
      const { data: prices } = await api.post('/investments/fetch-prices', { instruments });
      setMarketPrices(prices);
    } catch (err) {
      alert('Failed to fetch prices: ' + (err.response?.data?.error || err.message));
    } finally {
      setFetchingPrices(false);
    }
  };

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
          <button
            onClick={handleFetchPrices}
            disabled={fetchingPrices || loading}
            className="btn-ghost flex items-center gap-2 text-sm"
          >
            {fetchingPrices ? <Loader2 size={14} className="animate-spin" /> : <TrendingUp size={14} />}
            Refresh Market Values
          </button>
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
        {hasMktData && (
          <div className="card flex flex-col">
            <div className="flex items-center gap-2 text-muted mb-1">
              <TrendingUp size={14} />
              <span className="stat-label text-xs">Market Value</span>
              {!allPriced && <span className="text-[10px] text-muted">({pricedCount}/{enriched.length})</span>}
            </div>
            <span className="font-mono text-lg font-bold text-white">{fmt(totalMktValue)}</span>
            {totalReturnPct !== null && (
              <span className={`text-xs font-mono ${totalReturn >= 0 ? 'text-teal' : 'text-rose'}`}>
                {totalReturn >= 0 ? '+' : ''}{fmt(totalReturn)} ({totalReturnPct.toFixed(1)}%)
              </span>
            )}
          </div>
        )}
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

        {/* Invested vs Market Value */}
        <div className="card">
          <p className="stat-label mb-3">{hasMktData ? 'Invested vs Market Value (₹L)' : 'By Asset Class (₹L)'}</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={assetCompare} margin={{ top: 4, right: 4, bottom: 20, left: 0 }}>
              <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 9 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={TT} content={({ active, payload }) => active && payload?.length ? (
                <div style={{ padding: '6px 10px', ...TT }}>
                  <div className="font-bold mb-1">{payload[0]?.payload?.name}</div>
                  {payload.map(p => <div key={p.name}><span style={{ color: p.color }}>{p.name}</span>: {p.value.toFixed(2)} L</div>)}
                </div>
              ) : null} />
              <Bar dataKey="Invested" fill="#60a5fa" radius={[3, 3, 0, 0]} />
              {hasMktData && <Bar dataKey="MarketValue" fill="#2dd4bf" radius={[3, 3, 0, 0]} />}
              {hasMktData && <Legend iconType="circle" iconSize={8} formatter={v => <span style={{ color: '#e5e7eb', fontSize: 11 }}>{v}</span>} />}
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

      {/* Per asset-class expandable breakup */}
      <div className="space-y-2">
        <p className="text-muted text-xs uppercase tracking-wider">Holdings by Asset Class</p>
        {Object.entries(byAssetClass).map(([assetClass, rows]) => {
          const assetInvested = rows.reduce((s, r) => s + r.net, 0);
          const assetMktVal   = rows.reduce((s, r) => s + (r.mktValue || r.net), 0);
          const assetReturn   = hasMktData ? assetMktVal - assetInvested : null;
          const assetRetPct   = assetReturn !== null && assetInvested > 0 ? (assetReturn / assetInvested * 100) : null;
          const isOpen        = expandedAsset === assetClass;
          return (
            <div key={assetClass} className="card overflow-hidden">
              <button
                className="w-full flex items-center justify-between p-0 text-left"
                onClick={() => setExpandedAsset(isOpen ? null : assetClass)}
              >
                <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: ASSET_COLORS[assetClass] || '#9ca3af' }} />
                  <span className="font-medium text-white text-sm">{assetClass}</span>
                  <span className="text-muted text-xs">{rows.length} position{rows.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="font-mono text-sm text-soft">{fmt(assetInvested)}</div>
                    {assetRetPct !== null && (
                      <div className={`text-xs font-mono ${assetReturn >= 0 ? 'text-teal' : 'text-rose'}`}>
                        {assetReturn >= 0 ? '+' : ''}{fmt(assetReturn)} ({assetRetPct.toFixed(1)}%)
                      </div>
                    )}
                  </div>
                  {isOpen ? <ChevronUp size={14} className="text-muted" /> : <ChevronDown size={14} className="text-muted" />}
                </div>
              </button>

              {isOpen && (
                <div className="mt-3 pt-3 border-t border-border/50 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted">
                        <th className="text-left py-1.5 px-2">Instrument</th>
                        <th className="text-left py-1.5 px-2">Broker</th>
                        <th className="text-right py-1.5 px-2">Qty</th>
                        <th className="text-right py-1.5 px-2">W.Avg Price</th>
                        <th className="text-right py-1.5 px-2">Invested</th>
                        {hasMktData && <th className="text-right py-1.5 px-2">Mkt Price</th>}
                        {hasMktData && <th className="text-right py-1.5 px-2">Mkt Value</th>}
                        {hasMktData && <th className="text-right py-1.5 px-2">Return</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => (
                        <tr key={i} className="border-t border-border/30">
                          <td className="py-2 px-2 text-soft max-w-[160px]">
                            <div className="truncate">{row.instrument}</div>
                            {row.goal && <div className="text-muted text-[10px]">{row.goal}</div>}
                          </td>
                          <td className="py-2 px-2 text-muted">{row.broker}</td>
                          <td className="py-2 px-2 text-right font-mono text-soft">
                            {row.netQty > 0 ? row.netQty.toLocaleString('en-IN', { maximumFractionDigits: 3 }) : '—'}
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-soft">
                            {row.wavgPrice ? `₹${row.wavgPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-soft">{fmt(row.net)}</td>
                          {hasMktData && <td className="py-2 px-2 text-right font-mono text-soft">{row.mktPrice ? `₹${row.mktPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}</td>}
                          {hasMktData && <td className="py-2 px-2 text-right font-mono text-soft">{row.mktValue ? fmt(row.mktValue) : '—'}</td>}
                          {hasMktData && (
                            <td className="py-2 px-2 text-right font-mono">
                              {row.returnPct !== null ? (
                                <span className={row.returnPct >= 0 ? 'text-teal' : 'text-rose'}>
                                  {row.returnPct >= 0 ? '+' : ''}{row.returnPct.toFixed(1)}%
                                </span>
                              ) : '—'}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Full holdings table */}
      <div className="card overflow-hidden">
        <p className="text-muted text-xs mb-3">All positions — net (BUY − SELL), weighted avg price & returns</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Goal', 'Instrument', 'Asset', 'Qty', 'W.Avg', 'Net Invested',
                  ...(hasMktData ? ['Mkt Value', 'Return'] : []),
                  'Broker'].map(h => (
                  <th key={h} className="text-left py-3 px-4 text-muted font-display text-xs uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="py-8 text-center text-muted font-mono text-sm animate-pulse">Loading…</td></tr>
              ) : enriched.length === 0 ? (
                <tr><td colSpan={9} className="py-8 text-center text-muted">{goalFilter || brokerFilter ? 'No positions for this filter' : 'No investments yet'}</td></tr>
              ) : (
                enriched.map((row, i) => (
                  <tr key={i} className="border-b border-border/40 hover:bg-surface/40 transition-colors">
                    <td className="py-3 px-4 text-xs text-soft">{row.goal}</td>
                    <td className="py-3 px-4 text-xs text-soft max-w-[160px] truncate">{row.instrument}</td>
                    <td className="py-3 px-4 text-xs"><span className="tag bg-card/60">{row.asset_class}</span></td>
                    <td className="py-3 px-4 font-mono text-xs text-soft">
                      {row.netQty > 0 ? row.netQty.toLocaleString('en-IN', { maximumFractionDigits: 3 }) : '—'}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-soft">
                      {row.wavgPrice ? `₹${row.wavgPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}
                    </td>
                    <td className="py-3 px-4 font-mono text-soft">{row.net >= 0 ? '' : '−'}{fmt(Math.abs(row.net))}</td>
                    {hasMktData && <td className="py-3 px-4 font-mono text-soft">{row.mktValue ? fmt(row.mktValue) : '—'}</td>}
                    {hasMktData && (
                      <td className="py-3 px-4 font-mono text-xs">
                        {row.returnPct !== null ? (
                          <span className={row.returnPct >= 0 ? 'text-teal' : 'text-rose'}>
                            {row.returnPct >= 0 ? '+' : ''}{row.returnPct.toFixed(1)}%
                          </span>
                        ) : '—'}
                      </td>
                    )}
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
