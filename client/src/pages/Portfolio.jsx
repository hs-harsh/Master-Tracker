import { useEffect, useMemo, useState } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Legend, ComposedChart, Line, CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { PieChart as PieIcon, Target, Wallet, TrendingUp, Loader2, CheckCircle2, XCircle, Edit3, Check, X } from 'lucide-react';
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
  const { personName, activePerson, persons, dataVersion, token } = useAuth();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [goalFilter, setGoalFilter] = useState('');
  const [brokerFilter, setBrokerFilter] = useState('');
  const [marketPrices, setMarketPrices] = useState({});
  const [fxRates, setFxRates] = useState({ INR: 1 });
  const [fxFetching, setFxFetching] = useState(false);
  const [mktAsOf, setMktAsOf] = useState(null); // YYYY-MM-DD from last saved refresh (DB)
  // Price fetch panel state
  const [showPricePanel, setShowPricePanel] = useState(false);
  const [fetchStatus, setFetchStatus] = useState('idle'); // idle | fetching | done
  const [priceStatus, setPriceStatus] = useState({}); // {instrument: {status, price, symbol, name, error}}
  const [priceEdits, setPriceEdits] = useState({});    // user overrides keyed by instrument
  const [editingInst, setEditingInst] = useState(null);

  const currentPerson = activePerson || personName;
  // Same key used for GET/PUT market cache — align with profile list (not JWT-only) to avoid wrong bucket after relogin.
  const mktCacheAccount = useMemo(() => {
    if (persons?.length > 0) return activePerson || persons[0] || '';
    return currentPerson || '';
  }, [persons, activePerson, currentPerson]);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (currentPerson) params.set('account', currentPerson);
    api.get(`/investments?${params}`).then(r => setData(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [currentPerson, dataVersion]);

  useEffect(() => {
    if (!token) {
      setMarketPrices({});
      setMktAsOf(null);
      return;
    }
    if (!persons?.length) return;

    let cancelled = false;
    const primary = activePerson || persons[0] || '';
    const tryKeys = [...new Set([primary, '', personName].filter(k => k != null && k !== undefined))];

    (async () => {
      try {
        let loaded = null;
        let loadedKey = null;
        for (const acc of tryKeys) {
          if (cancelled) return;
          const { data } = await api.get(
            `/investments/market-cache?account=${encodeURIComponent(acc)}`
          );
          const p = data?.prices;
          if (p && typeof p === 'object' && Object.keys(p).length) {
            loaded = data;
            loadedKey = acc;
            break;
          }
        }
        if (cancelled) return;
        if (loaded && loadedKey != null && loadedKey !== primary) {
          try {
            await api.put('/investments/market-cache', {
              account: primary,
              asOf: loaded.asOf || new Date().toISOString().slice(0, 10),
              prices: loaded.prices,
            });
          } catch (_) { /* migrate best-effort */ }
        }
        const p = loaded?.prices;
        if (p && typeof p === 'object' && Object.keys(p).length) {
          setMarketPrices(p);
          setMktAsOf(loaded.asOf || null);
        } else {
          setMarketPrices({});
          setMktAsOf(null);
        }
      } catch {
        if (!cancelled) { /* keep last UI state */ }
      }
    })();

    return () => { cancelled = true; };
  }, [token, persons, activePerson, personName, dataVersion]);

  // Auto-fetch FX rates on load (separate from full market price refresh)
  const fetchFxRates = async () => {
    setFxFetching(true);
    try {
      const { data: res } = await api.post('/investments/fetch-prices', { instruments: [] });
      if (res.__fxRates && typeof res.__fxRates === 'object') {
        setFxRates({ INR: 1, ...res.__fxRates });
      }
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

  // ── Enrich with live market prices (all monetary values converted to INR) ──
  const enriched = useMemo(() => aggregated.map(row => {
    const fx = fxRates[row.currency] || 1;        // e.g. 84.5 for USD
    const netOriginal = row.net;                   // invested amount in original currency
    const netINR = row.net * fx;                   // invested amount in INR
    const wavgINR = row.wavgPrice ? row.wavgPrice * fx : null;
    const mkt = marketPrices[row.instrument];
    if (mkt?.price) {
      // Market price is in the instrument's native currency — apply same FX rate
      const mktPriceINR = mkt.price * fx;
      let effectiveQty = row.netQty > 0
        ? row.netQty
        : (row.wavgPrice > 0 ? row.net / row.wavgPrice : 0);
      let estimatedWavg = wavgINR;
      let qtyEstimated = false;
      if (effectiveQty <= 0 && row.net > 0 && mkt.price > 0) {
        effectiveQty = row.net / mkt.price;
        estimatedWavg = mktPriceINR;
        qtyEstimated = true;
      }
      if (effectiveQty > 0) {
        const mktValue    = mktPriceINR * effectiveQty;   // INR
        const mktValueOrig = mkt.price * effectiveQty;    // original currency
        const returnAmt   = mktValue - netINR;
        const returnPct   = netINR > 0 ? (returnAmt / netINR * 100) : 0;
        return { ...row, net: netINR, netOriginal, wavgPrice: wavgINR, mktPrice: mktPriceINR, mktValue, mktValueOrig, returnAmt, returnPct, effectiveQty, estimatedWavg, qtyEstimated, fx };
      }
      return { ...row, net: netINR, netOriginal, wavgPrice: wavgINR, mktPrice: mktPriceINR, mktValue: null, mktValueOrig: null, returnAmt: null, returnPct: null, effectiveQty: 0, estimatedWavg: null, qtyEstimated: false, fx };
    }
    return { ...row, net: netINR, netOriginal, wavgPrice: wavgINR, mktPrice: null, mktValue: null, mktValueOrig: null, returnAmt: null, returnPct: null, effectiveQty: 0, estimatedWavg: null, qtyEstimated: false, fx };
  }), [aggregated, marketPrices, fxRates]);

  // totalNet uses enriched (which has INR-converted net values)
  const totalNet       = enriched.reduce((s, r) => s + r.net, 0);
  const pricedCount    = enriched.filter(r => r.mktValue !== null).length;
  const hasMktData     = pricedCount > 0;
  const allPriced      = pricedCount === enriched.length && enriched.length > 0;
  // Only sum market value for positions that have live prices; leave unpriced positions out of the total
  const pricedInvested = enriched.filter(r => r.mktValue !== null).reduce((s, r) => s + r.net, 0);
  const totalMktValue  = enriched.filter(r => r.mktValue !== null).reduce((s, r) => s + r.mktValue, 0);
  const totalReturn    = hasMktData ? totalMktValue - pricedInvested : null;
  const totalReturnPct = totalReturn !== null && pricedInvested > 0 ? (totalReturn / pricedInvested * 100) : null;

  // ── Per-currency breakdown (invested & market value in each currency) ────
  const ccyBreakdown = useMemo(() => {
    const inv = {}, mkt = {};
    enriched.forEach(r => {
      const ccy = r.currency || 'INR';
      inv[ccy] = (inv[ccy] || 0) + r.netOriginal;
      if (r.mktValueOrig != null) mkt[ccy] = (mkt[ccy] || 0) + r.mktValueOrig;
    });
    return { inv, mkt };
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

  // Per-instrument return chart data (only positions with market data, sorted by return%)
  const returnChartData = useMemo(() =>
    enriched
      .filter(r => r.returnPct !== null)
      .map(r => ({
        name: r.instrument.length > 20 ? r.instrument.slice(0, 18) + '…' : r.instrument,
        fullName: r.instrument,
        returnPct: +r.returnPct.toFixed(1),
        returnAmt: r.returnAmt,
        invested: r.net,
        mktValue: r.mktValue,
        asset_class: r.asset_class,
      }))
      .sort((a, b) => b.returnPct - a.returnPct),
    [enriched]
  );


  const equityVal = Math.max(0, assetBuckets.Equity || 0) + Math.max(0, assetBuckets.Crypto || 0);
  const debtVal   = Math.max(0, assetBuckets.Debt || 0);
  const goldVal   = Math.max(0, assetBuckets.Gold || 0) + Math.max(0, assetBuckets['Real Estate'] || 0);
  const cashVal   = Math.max(0, assetBuckets.Cash || 0);
  const totalAbs  = equityVal + debtVal + goldVal + cashVal || 1;

  const instrumentList = useMemo(() =>
    Array.from(new Map(enriched.map(r => [r.instrument, { instrument: r.instrument, ticker: r.ticker, asset_class: r.asset_class }])).values()),
    [enriched]
  );

  const handleFetchPrices = async () => {
    if (!instrumentList.length) return;
    const init = {};
    instrumentList.forEach(({ instrument }) => { init[instrument] = { status: 'loading' }; });
    setPriceStatus(init);
    setPriceEdits({});
    setEditingInst(null);
    setShowPricePanel(true);
    setFetchStatus('fetching');
    try {
      const { data: prices } = await api.post('/investments/fetch-prices', { instruments: instrumentList });
      // Extract FX rates from response (special key __fxRates)
      if (prices.__fxRates && typeof prices.__fxRates === 'object') {
        setFxRates({ INR: 1, ...prices.__fxRates });
      }
      const next = {};
      instrumentList.forEach(({ instrument }) => {
        const info = prices[instrument];
        if (info?.price) {
          next[instrument] = { status: 'ok', price: info.price, currency: info.currency || 'INR', symbol: info.symbol, name: info.name, source: info.source };
        } else if (info?.needsManualPrice) {
          next[instrument] = { status: 'manual', symbol: info.symbol || instrument };
        } else {
          next[instrument] = { status: 'error', symbol: info?.symbol || instrument, error: info?.error || 'Not found' };
        }
      });
      setPriceStatus(next);
      setFetchStatus('done');
    } catch (err) {
      const errStatus = {};
      instrumentList.forEach(({ instrument }) => { errStatus[instrument] = { status: 'error', error: err.message }; });
      setPriceStatus(errStatus);
      setFetchStatus('done');
    }
  };

  const handleApplyPrices = async () => {
    const confirmed = {};
    Object.entries(priceStatus).forEach(([instrument, info]) => {
      const override = priceEdits[instrument];
      const finalPrice = override ? Number(override) : info.price;
      if (finalPrice > 0) {
        confirmed[instrument] = { price: finalPrice, symbol: info.symbol, name: info.name };
      }
    });
    setMarketPrices(confirmed);
    setShowPricePanel(false);
    const asOf = new Date().toISOString().slice(0, 10);
    try {
      const { data } = await api.put('/investments/market-cache', {
        account: mktCacheAccount,
        asOf,
        prices: confirmed,
      });
      if (!Object.keys(confirmed).length) setMktAsOf(null);
      else setMktAsOf(data?.asOf || asOf);
    } catch (e) {
      console.error(e);
    }
  };

  const appliedCount = Object.values(priceStatus).filter(s => s.status === 'ok' || (s.status === 'manual' && priceEdits[Object.keys(priceStatus).find(k => priceStatus[k] === s)])).length;

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
          <div className="flex flex-col items-end gap-1">
            {mktAsOf && Object.keys(marketPrices).length > 0 && (
              <p className="text-muted text-xs max-w-[220px] text-right leading-snug">
                Market values as of{' '}
                <time dateTime={mktAsOf}>
                  {new Date(`${mktAsOf}T12:00:00`).toLocaleDateString('en-IN', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })}
                </time>
              </p>
            )}
            <button
              type="button"
              onClick={handleFetchPrices}
              disabled={fetchStatus === 'fetching' || loading}
              className="btn-ghost flex items-center gap-2 text-sm"
            >
              {fetchStatus === 'fetching' ? <Loader2 size={14} className="animate-spin" /> : <TrendingUp size={14} />}
              Refresh Market Values
            </button>
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

      {/* ── Price fetch status panel ────────────────────────────────────── */}
      {showPricePanel && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {fetchStatus === 'fetching'
                ? <><Loader2 size={14} className="animate-spin text-accent" /><span className="text-sm font-medium text-white">Fetching prices for {instrumentList.length} instrument{instrumentList.length !== 1 ? 's' : ''}…</span></>
                : <><CheckCircle2 size={14} className="text-teal" /><span className="text-sm font-medium text-white">Price lookup complete — verify &amp; apply</span></>
              }
            </div>
            <button onClick={() => setShowPricePanel(false)} className="text-muted hover:text-white"><X size={15} /></button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="text-left py-2 px-2">Instrument</th>
                  <th className="text-left py-2 px-2">Symbol found</th>
                  <th className="text-right py-2 px-2">Price</th>
                  <th className="text-center py-2 px-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {instrumentList.map(({ instrument }) => {
                  const s = priceStatus[instrument];
                  const isEditing = editingInst === instrument;
                  return (
                    <tr key={instrument} className="border-b border-border/30">
                      <td className="py-2 px-2 text-soft max-w-[160px] truncate">{instrument}</td>
                      <td className="py-2 px-2 text-muted font-mono text-[10px]">
                        {s?.status === 'loading' ? <span className="animate-pulse">—</span> : (s?.symbol || '—')}
                      </td>
                      <td className="py-2 px-2 text-right">
                        {s?.status === 'loading' && <span className="animate-pulse text-muted">…</span>}
                        {(s?.status === 'ok' || s?.status === 'error' || s?.status === 'manual') && (
                          isEditing ? (
                            <div className="flex items-center justify-end gap-1">
                              <input
                                type="number"
                                step="0.01"
                                className="input py-0.5 px-1.5 w-24 text-right text-xs"
                                value={priceEdits[instrument] ?? (s.price || '')}
                                onChange={e => setPriceEdits(p => ({ ...p, [instrument]: e.target.value }))}
                                placeholder="Enter price"
                                autoFocus
                              />
                              <button onClick={() => setEditingInst(null)} className="text-teal hover:text-white"><Check size={12} /></button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              {priceEdits[instrument] || s.price ? (
                                <span className="font-mono text-accent">
                                  {s.currency === 'USD' ? '$' : s.currency === 'GBP' ? '£' : '₹'}{Number(priceEdits[instrument] ?? s.price).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                </span>
                              ) : (
                                <span className="text-muted text-[10px]">{s.error || 'not found — click to enter'}</span>
                              )}
                              <button onClick={() => setEditingInst(instrument)} className="text-muted hover:text-accent" title="Edit price"><Edit3 size={10} /></button>
                            </div>
                          )
                        )}
                      </td>
                      <td className="py-2 px-2 text-center">
                        {s?.status === 'loading' && <span className="text-muted animate-pulse">●</span>}
                        {s?.status === 'ok'     && !priceEdits[instrument] && <CheckCircle2 size={13} className="text-teal mx-auto" />}
                        {s?.status === 'ok'     && priceEdits[instrument]  && <Edit3 size={13} className="text-accent mx-auto" />}
                        {s?.status === 'manual' && !priceEdits[instrument] && <XCircle size={13} className="text-amber-400 mx-auto" />}
                        {s?.status === 'manual' && priceEdits[instrument]  && <CheckCircle2 size={13} className="text-teal mx-auto" />}
                        {s?.status === 'error'  && !priceEdits[instrument] && <XCircle size={13} className="text-rose mx-auto" />}
                        {s?.status === 'error'  && priceEdits[instrument]  && <CheckCircle2 size={13} className="text-teal mx-auto" />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {fetchStatus === 'done' && (
            <div className="flex items-center gap-3 pt-1">
              <button onClick={handleApplyPrices} className="btn-primary text-sm flex items-center gap-2">
                <Check size={13} /> Apply {Object.entries(priceStatus).filter(([inst, s]) => s.status === 'ok' || ((s.status === 'manual' || s.status === 'error') && priceEdits[inst])).length} Prices
              </button>
              <button onClick={() => setShowPricePanel(false)} className="btn-ghost text-sm">Dismiss</button>
              <span className="text-muted text-xs ml-auto">
                {Object.values(priceStatus).filter(s => s.status === 'error').length > 0 &&
                  `${Object.values(priceStatus).filter(s => s.status === 'error').length} not found — add Yahoo ticker in Investments tab`}
              </span>
            </div>
          )}
        </div>
      )}

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

      {/* ── Per-currency breakdown ──────────────────────────────────────── */}
      {Object.keys(ccyBreakdown.inv).some(c => c !== 'INR') && (
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
            {['INR', 'USD', 'GBP'].filter(c => ccyBreakdown.inv[c]).map(c => {
              const sym = c === 'INR' ? '₹' : c === 'USD' ? '$' : '£';
              const inv = ccyBreakdown.inv[c] || 0;
              const mktOrig = ccyBreakdown.mkt[c];
              const invINR = inv * (fxRates[c] || 1);
              const mktINR = mktOrig != null ? mktOrig * (fxRates[c] || 1) : null;
              return (
                <div key={c} className="flex flex-col gap-0.5">
                  <span className="text-muted text-[10px] uppercase tracking-wider">{c}</span>
                  <span className="text-soft">
                    Invested: <span className="text-accent">{sym}{inv.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                    {c !== 'INR' && <span className="text-muted"> = ₹{invINR.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>}
                  </span>
                  {mktINR != null && (
                    <span className="text-soft">
                      Market: <span className={mktINR >= invINR ? 'text-teal' : 'text-rose'}>{sym}{mktOrig.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                      {c !== 'INR' && <span className="text-muted"> = ₹{mktINR.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>}
                    </span>
                  )}
                </div>
              );
            })}
            <div className="flex flex-col gap-0.5 border-l border-border pl-6">
              <span className="text-muted text-[10px] uppercase tracking-wider">Total (INR)</span>
              <span className="text-soft">Invested: <span className="text-accent font-bold">{fmt(totalNet)}</span></span>
              {hasMktData && <span className="text-soft">Market: <span className={`font-bold ${totalReturn != null && totalReturn >= 0 ? 'text-teal' : 'text-rose'}`}>{fmt(totalMktValue)}</span></span>}
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

        {/* Invested vs Market Value — vertical bars by asset class */}
        <div className="card">
          <p className="stat-label mb-3">{hasMktData ? 'Invested vs Market Value (₹L)' : 'By Asset Class (₹L)'}</p>
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

      {/* Return % per instrument (when market data available) */}
      {returnChartData.length > 0 && (
        <div className="card">
          <p className="stat-label mb-3">Return % by Instrument</p>
          <ResponsiveContainer width="100%" height={Math.max(160, returnChartData.length * 36)}>
            <BarChart
              data={returnChartData}
              layout="vertical"
              margin={{ top: 4, right: 70, bottom: 4, left: 8 }}
            >
              <XAxis
                type="number"
                tick={{ fill: '#6b7280', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => `${v > 0 ? '+' : ''}${v}%`}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={130}
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <ReferenceLine x={0} stroke="#374151" strokeWidth={1} />
              <Tooltip
                contentStyle={TT}
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const d = payload[0].payload;
                  return (
                    <div style={{ padding: '8px 12px', ...TT }}>
                      <div className="font-bold text-white mb-1">{d.fullName}</div>
                      <div className="space-y-0.5">
                        <div>Return: <span className={d.returnPct >= 0 ? 'text-teal' : 'text-rose'}>{d.returnPct >= 0 ? '+' : ''}{d.returnPct}%</span></div>
                        <div className="text-muted">Invested: ₹{d.invested?.toLocaleString('en-IN')}</div>
                        <div className="text-muted">Market: ₹{d.mktValue?.toLocaleString('en-IN')}</div>
                        <div>P&amp;L: <span className={d.returnAmt >= 0 ? 'text-teal' : 'text-rose'}>{d.returnAmt >= 0 ? '+' : ''}₹{Math.abs(d.returnAmt)?.toLocaleString('en-IN')}</span></div>
                      </div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="returnPct" radius={[0, 3, 3, 0]} minPointSize={2}>
                {returnChartData.map((d, i) => (
                  <Cell key={i} fill={d.returnPct >= 0 ? '#2dd4bf' : '#fb7185'} />
                ))}
              </Bar>
            </BarChart>
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
          ...(r.mktValue !== null ? { 'Mkt Value': +(r.mktValue / 100000).toFixed(2) } : {}),
          returnPct: r.returnPct,
          wavgPrice: r.wavgPrice || r.estimatedWavg,
          mktPrice: r.mktPrice,
          netQty: r.effectiveQty || r.netQty,
          broker: r.broker,
          color: ASSET_COLORS[r.asset_class] || '#9ca3af',
        }));

        const renderChart = (title, rows) => {
          if (rows.length === 0) return null;
          const barData = makeBarData(rows);
          const hasMkt = barData.some(d => d['Mkt Value'] !== undefined);
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
                          {d.netQty > 0 && <div className="text-soft text-xs">Qty: {Number(d.netQty).toLocaleString('en-IN', { maximumFractionDigits: 3 })}</div>}
                          {d.wavgPrice && <div className="text-soft text-xs">Avg: ₹{d.wavgPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>}
                          {d.mktPrice && <div className="text-soft text-xs">Mkt Price: ₹{d.mktPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>}
                          {payload.map(p => <div key={p.name} style={{ color: p.fill || p.color }} className="text-xs">{p.name}: ₹{(p.value * 100000).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>)}
                          {d.returnPct !== null && d.returnPct !== undefined && (
                            <div className={`text-xs font-mono mt-0.5 ${d.returnPct >= 0 ? 'text-teal' : 'text-rose'}`}>
                              Return: {d.returnPct >= 0 ? '+' : ''}{d.returnPct.toFixed(1)}%
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="Invested" radius={[3, 3, 0, 0]}>
                    {barData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Bar>
                  {hasMkt && <Bar dataKey="Mkt Value" fill="#2dd4bf" radius={[3, 3, 0, 0]} />}
                  {hasMkt && <Legend iconType="circle" iconSize={8} formatter={v => <span style={{ color: '#e5e7eb', fontSize: 11 }}>{v}</span>} />}
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
        <p className="text-muted text-xs mb-3">All positions — net (BUY − SELL), weighted avg price & returns</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Goal', 'Instrument', 'Asset', 'Qty', 'W.Avg', 'Net Invested', 'Mkt Price', 'Mkt Value', 'Return', 'Broker'].map(h => (
                  <th key={h} className="text-left py-3 px-4 text-muted font-display text-xs uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="py-8 text-center text-muted font-mono text-sm animate-pulse">Loading…</td></tr>
              ) : enriched.length === 0 ? (
                <tr><td colSpan={10} className="py-8 text-center text-muted">{goalFilter || brokerFilter ? 'No positions for this filter' : 'No investments yet'}</td></tr>
              ) : (
                enriched.map((row, i) => (
                  <tr key={i} className="border-b border-border/40 hover:bg-surface/40 transition-colors">
                    <td className="py-3 px-4 text-xs text-soft">{row.goal}</td>
                    <td className="py-3 px-4 text-xs text-soft max-w-[160px] truncate">{row.instrument}</td>
                    <td className="py-3 px-4 text-xs"><span className="tag bg-card/60">{row.asset_class}</span></td>
                    <td className="py-3 px-4 font-mono text-xs text-soft">
                      {row.effectiveQty > 0
                        ? <span>{row.effectiveQty.toLocaleString('en-IN', { maximumFractionDigits: 3 })}{row.qtyEstimated && <span className="text-amber-400 ml-0.5" title="Estimated from invested ÷ mkt price">~</span>}</span>
                        : '—'}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-soft">
                      {(row.wavgPrice || row.estimatedWavg)
                        ? <span>₹{(row.wavgPrice || row.estimatedWavg).toLocaleString('en-IN', { maximumFractionDigits: 2 })}{row.qtyEstimated && <span className="text-amber-400 ml-0.5" title="Estimated (= mkt price)">~</span>}</span>
                        : '—'}
                    </td>
                    <td className="py-3 px-4 font-mono text-soft">{row.net >= 0 ? '' : '−'}{fmt(Math.abs(row.net))}</td>
                    <td className="py-3 px-4 font-mono text-xs text-soft">{row.mktPrice ? `₹${row.mktPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}</td>
                    <td className="py-3 px-4 font-mono text-soft">{row.mktValue ? fmt(row.mktValue) : '—'}</td>
                    <td className="py-3 px-4 font-mono text-xs">
                      {row.returnPct !== null ? (
                        <span className={row.returnPct >= 0 ? 'text-teal' : 'text-rose'}>
                          {row.returnPct >= 0 ? '+' : ''}{row.returnPct.toFixed(1)}%
                        </span>
                      ) : '—'}
                    </td>
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
