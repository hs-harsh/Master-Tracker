import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { TrendingUp, BarChart2, Loader2 } from 'lucide-react';
import {
  ComposedChart, Area, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import api from '../../lib/api';

const SUB_TABS = [
  { to: '/live-trading/backtest',   label: 'Backtest',   icon: TrendingUp },
  { to: '/live-trading/post-trade', label: 'Post-Trade', icon: BarChart2  },
];

function fmtPct(v) {
  if (v == null) return '—';
  return `${v >= 0 ? '+' : ''}${(+v).toFixed(1)}%`;
}
function fmtNum(v, d = 2) { return v == null ? '—' : (+v).toFixed(d); }
function fmtCurrency(v) { return v == null ? '—' : `₹${Math.round(v).toLocaleString('en-IN')}`; }

function deskLabel(s) {
  const sym = s.instruments?.[0] || '';
  if (sym.endsWith('.NS') || sym.endsWith('.BO')) return 'IN.Equity';
  if (/^\^/.test(sym)) return 'IN.Index';
  return 'US.Equity';
}

export default function PostTradePage() {
  const [strategies, setStrategies]   = useState([]);
  const [loading, setLoading]         = useState(true);
  const [selectedId, setSelectedId]   = useState(null);
  const [fullData, setFullData]       = useState(null);
  const [fullLoading, setFullLoading] = useState(false);
  const [activeTab, setActiveTab]     = useState('trades');

  useEffect(() => {
    api.get('/backtest/strategies').then(({ data }) => {
      const done = data.filter(s => s.status === 'done');
      setStrategies(done);
      if (done.length > 0) setSelectedId(done[0].id);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setFullLoading(true);
    api.get(`/backtest/strategies/${selectedId}`)
      .then(({ data }) => setFullData(data))
      .finally(() => setFullLoading(false));
  }, [selectedId]);

  const selected  = strategies.find(s => s.id === selectedId);
  const stats     = fullData?.results?.stats;
  const trades    = fullData?.results?.trades || [];
  const equityCurve = fullData?.results?.equityCurve || [];

  const chartData = equityCurve.length > 200
    ? equityCurve.filter((_, i) => i % Math.ceil(equityCurve.length / 200) === 0)
    : equityCurve;

  const grouped = strategies.reduce((acc, s) => {
    const desk = deskLabel(s);
    if (!acc[desk]) acc[desk] = [];
    acc[desk].push(s);
    return acc;
  }, {});

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
        <div className="w-56 shrink-0 border-r border-white/5 overflow-y-auto p-3 space-y-4">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-muted" /></div>
          ) : strategies.length === 0 ? (
            <div className="py-8 text-center space-y-2">
              <p className="text-muted text-xs">No completed backtests yet.</p>
              <p className="text-muted/60 text-[11px]">Run a backtest first.</p>
            </div>
          ) : (
            <>
              {Object.entries(grouped).map(([desk, strats]) => (
                <div key={desk}>
                  <p className="text-[10px] text-muted uppercase tracking-widest font-mono mb-1.5 px-1">{desk}</p>
                  <div className="space-y-1">
                    {strats.map(s => (
                      <button key={s.id}
                        onClick={() => { setSelectedId(s.id); setActiveTab('trades'); }}
                        className={`w-full text-left p-2.5 rounded-xl transition-all ${
                          selectedId === s.id
                            ? 'bg-accent/8 border border-accent/20'
                            : 'hover:bg-white/[0.04] border border-transparent'
                        }`}>
                        <p className="text-xs font-medium text-white truncate">{s.name}</p>
                        <p className="text-[10px] font-mono text-muted mt-0.5 truncate">{s.instruments?.join(', ')}</p>
                        {s.stats?.totalReturn != null && (
                          <p className={`text-[11px] font-mono font-medium mt-0.5 ${s.stats.totalReturn >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {fmtPct(s.stats.totalReturn)}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {/* Summary by desk */}
              <div className="border-t border-white/8 pt-3">
                <p className="text-[10px] text-muted uppercase tracking-widest font-mono mb-2 px-1">Summary by Desk</p>
                {Object.entries(grouped).map(([desk, strats]) => {
                  const total = strats.reduce((sum, s) => sum + (s.stats?.totalReturn || 0), 0);
                  return (
                    <div key={desk} className="flex justify-between items-center px-1 py-1">
                      <span className="text-[11px] text-muted font-mono truncate">{desk}</span>
                      <span className={`text-[11px] font-mono font-medium shrink-0 ml-2 ${total >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {fmtPct(total)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Right panel */}
        <div className="flex-1 overflow-y-auto">
          {!selectedId || !selected ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <p className="text-soft font-display font-bold mb-1">Select a strategy</p>
              <p className="text-muted text-sm">Choose a completed backtest from the left</p>
            </div>
          ) : fullLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 size={20} className="animate-spin text-muted" />
            </div>
          ) : (
            <div className="p-6 space-y-5">
              {/* Header */}
              <div>
                <h2 className="text-white font-display font-bold text-lg">{selected.name}</h2>
                <p className="text-muted text-sm font-mono mt-0.5">
                  {fullData?.date_from} → {fullData?.date_to} · {fullData?.instruments?.join(', ')} · {fullData?.frequency}
                </p>
              </div>

              {/* Stats strip */}
              {stats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: 'Return',        value: fmtPct(stats.totalReturn),    c: stats.totalReturn >= 0 ? 'text-emerald-400' : 'text-red-400' },
                    { label: 'Max DD',         value: fmtPct(stats.maxDrawdown),    c: 'text-red-400' },
                    { label: 'Sharpe',         value: fmtNum(stats.sharpe),         c: 'text-white' },
                    { label: 'Win Rate',       value: fmtPct(stats.winRate),        c: stats.winRate >= 50 ? 'text-emerald-400' : 'text-amber-400' },
                    { label: 'Trades',         value: stats.totalTrades,            c: 'text-white' },
                    { label: 'Profit Factor',  value: fmtNum(stats.profitFactor),   c: stats.profitFactor >= 1 ? 'text-emerald-400' : 'text-red-400' },
                    { label: 'Avg Hold',       value: `${fmtNum(stats.avgTradeDays, 1)}d`, c: 'text-white' },
                    { label: 'Final Capital',  value: fmtCurrency(stats.finalCapital), c: 'text-white' },
                  ].map(({ label, value, c }) => (
                    <div key={label} className="card p-3">
                      <p className="text-[10px] text-muted uppercase tracking-wider font-mono">{label}</p>
                      <p className={`text-base font-display font-bold mt-0.5 ${c}`}>{value}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Equity chart */}
              {chartData.length > 0 && (
                <div className="card p-4">
                  <p className="text-xs text-muted uppercase tracking-wider font-mono mb-3">Equity PnL / Drawdown</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="ptGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#34d399" stopOpacity={0.25} />
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
                      <Area type="monotone" dataKey="equity" stroke="#34d399" strokeWidth={1.5} fill="url(#ptGrad)" dot={false} />
                      <Bar dataKey="drawdown" fill="#f87171" opacity={0.35} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Tabs */}
              <div className="card overflow-hidden">
                <div className="flex border-b border-white/8">
                  {[['trades','All Trades'], ['positions','Positions'], ['stats','Stats']].map(([key, label]) => (
                    <button key={key} onClick={() => setActiveTab(key)}
                      className={`px-4 py-3 text-xs font-mono transition-colors border-b-2 -mb-px ${
                        activeTab === key ? 'text-accent border-accent' : 'text-muted border-transparent hover:text-soft'
                      }`}>{label}</button>
                  ))}
                </div>

                {activeTab === 'trades' && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-white/8">
                          {['Symbol','Side','Entry','Entry ₹','Exit','Exit ₹','P&L','Return','Days'].map(h => (
                            <th key={h} className="text-left px-3 py-2.5 text-muted font-mono font-normal whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {!trades.length && <tr><td colSpan={9} className="px-3 py-8 text-center text-muted">No trades</td></tr>}
                        {trades.map((t, i) => (
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
                            <td className="px-3 py-2 font-mono text-muted">{t.holdDays || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {activeTab === 'positions' && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-white/8">
                          {['Symbol','Qty / Side','Entry ₹','P&L','Status'].map(h => (
                            <th key={h} className="text-left px-3 py-2.5 text-muted font-mono font-normal whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {!trades.length && <tr><td colSpan={5} className="px-3 py-8 text-center text-muted">No positions</td></tr>}
                        {trades.slice(0, 20).map((t, i) => (
                          <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02]">
                            <td className="px-3 py-2 font-mono text-white">{t.symbol}</td>
                            <td className="px-3 py-2 font-mono">
                              <span className={t.side === 'long' ? 'text-emerald-400' : 'text-red-400'}>{t.qty || 1} {t.side}</span>
                            </td>
                            <td className="px-3 py-2 font-mono text-soft">{t.entryPrice?.toFixed(2)}</td>
                            <td className={`px-3 py-2 font-mono font-medium ${(t.pnl||0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {(t.pnl||0) >= 0 ? '+' : ''}₹{Math.round(t.pnl||0)}
                            </td>
                            <td className="px-3 py-2 font-mono">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${t.exitDate ? 'bg-white/8 text-muted' : 'bg-emerald-500/15 text-emerald-400'}`}>
                                {t.exitDate ? 'closed' : 'open'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {activeTab === 'stats' && stats && (
                  <div className="p-4 grid grid-cols-2 gap-0">
                    {[
                      ['Total Return', fmtPct(stats.totalReturn)],
                      ['CAGR', fmtPct(stats.cagr)],
                      ['Max Drawdown', fmtPct(stats.maxDrawdown)],
                      ['Sharpe Ratio', fmtNum(stats.sharpe)],
                      ['Win Rate', fmtPct(stats.winRate)],
                      ['Profit Factor', fmtNum(stats.profitFactor)],
                      ['Total Trades', stats.totalTrades],
                      ['Avg Hold Days', fmtNum(stats.avgTradeDays, 1)],
                      ['Initial Capital', fmtCurrency(stats.initialCapital)],
                      ['Final Capital', fmtCurrency(stats.finalCapital)],
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
          )}
        </div>
      </div>
    </div>
  );
}
