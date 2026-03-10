import { useEffect, useMemo, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Legend } from 'recharts';
import { PieChart as PieIcon, Target, Wallet } from 'lucide-react';
import api from '../lib/api';
import { fmt } from '../lib/utils';
import TradeFeedbackCard from '../components/TradeFeedbackCard';
import { useAuth } from '../hooks/useAuth';

const RISK_COLORS = { Low: '#60a5fa', Medium: '#fbbf24', High: '#f97316' };
const ASSET_COLORS = { Equity: '#f97316', Debt: '#60a5fa', Gold: '#fbbf24', Cash: '#6b7280', 'Real Estate': '#a78bfa', Crypto: '#ec4899' };

const riskForAsset = asset => {
  switch (asset) {
    case 'Cash':
    case 'Debt':
      return 'Low';
    case 'Gold':
    case 'Real Estate':
      return 'Medium';
    case 'Equity':
    case 'Crypto':
    default:
      return 'High';
  }
};

export default function Portfolio() {
  const { personName } = useAuth();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [goalFilter, setGoalFilter] = useState('');
  const [brokerFilter, setBrokerFilter] = useState('');

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (personName) params.set('account', personName);
    api
      .get(`/investments?${params}`)
      .then(r => setData(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [personName]);

  const goals = useMemo(
    () => Array.from(new Set(data.map(d => d.goal))).sort(),
    [data]
  );
  const brokers = useMemo(
    () => Array.from(new Set(data.map(d => d.broker || '').filter(Boolean))).sort(),
    [data]
  );

  const goalInvestments = useMemo(() => {
    let list = data;
    if (goalFilter) list = list.filter(d => d.goal === goalFilter);
    if (brokerFilter) list = list.filter(d => (d.broker || '') === brokerFilter);
    return list;
  }, [data, goalFilter, brokerFilter]);

  // Aggregated net positions: same goal, account, asset_class, instrument, broker → one row with net amount
  const aggregated = useMemo(() => {
    const map = {};
    goalInvestments.forEach(inv => {
      const key = `${inv.goal}|${inv.account}|${inv.asset_class}|${inv.instrument}|${inv.broker || ''}`;
      if (!map[key]) {
        map[key] = { goal: inv.goal, account: inv.account, asset_class: inv.asset_class, instrument: inv.instrument, broker: inv.broker || '—', net: 0 };
      }
      map[key].net += inv.side === 'SELL' ? -Number(inv.amount) : Number(inv.amount);
    });
    return Object.values(map).filter(r => r.net !== 0).sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  }, [goalInvestments]);

  const totalNet = goalInvestments.reduce(
    (sum, inv) => sum + (inv.side === 'SELL' ? -Number(inv.amount) : Number(inv.amount)),
    0
  );

  const riskBuckets = goalInvestments.reduce(
    (acc, inv) => {
      const bucket = riskForAsset(inv.asset_class);
      const signed = inv.side === 'SELL' ? -Number(inv.amount) : Number(inv.amount);
      acc[bucket] = (acc[bucket] || 0) + signed;
      return acc;
    },
    {}
  );

  const riskPie = Object.entries(riskBuckets).map(([name, value]) => ({ name, value }));

  const assetBuckets = goalInvestments.reduce(
    (acc, inv) => {
      const signed = inv.side === 'SELL' ? -Number(inv.amount) : Number(inv.amount);
      acc[inv.asset_class] = (acc[inv.asset_class] || 0) + signed;
      return acc;
    },
    {}
  );
  const assetBar = Object.entries(assetBuckets).map(([name, value]) => ({
    name,
    ValueL: value / 100000,
  }));

  const brokerBuckets = goalInvestments.reduce(
    (acc, inv) => {
      const broker = inv.broker || '—';
      const signed = inv.side === 'SELL' ? -Number(inv.amount) : Number(inv.amount);
      acc[broker] = (acc[broker] || 0) + signed;
      return acc;
    },
    {}
  );
  const brokerPie = Object.entries(brokerBuckets)
    .filter(([, v]) => v !== 0)
    .map(([name, value]) => ({ name, value }));

  const BROKER_COLORS = ['#2dd4bf', '#f0c040', '#60a5fa', '#a78bfa', '#fb7185', '#34d399', '#f97316', '#6b7280'];

  // Important metrics
  const equityVal = Math.max(0, assetBuckets.Equity || 0) + Math.max(0, assetBuckets.Crypto || 0);
  const debtVal = Math.max(0, assetBuckets.Debt || 0);
  const goldVal = Math.max(0, assetBuckets.Gold || 0) + Math.max(0, assetBuckets['Real Estate'] || 0);
  const cashVal = Math.max(0, assetBuckets.Cash || 0);
  const totalAbs = equityVal + debtVal + goldVal + cashVal || 1;
  const equityPct = (equityVal / totalAbs) * 100;
  const debtPct = (debtVal / totalAbs) * 100;
  const goldPct = (goldVal / totalAbs) * 100;
  const cashPct = (cashVal / totalAbs) * 100;
  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-white">Goal Portfolio</h1>
            <p className="text-muted text-sm mt-0.5">
              View by account and filter by goal
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label htmlFor="portfolio-goal" className="text-muted text-xs uppercase tracking-wider">Goal</label>
            <select
              id="portfolio-goal"
              value={goalFilter}
              onChange={e => setGoalFilter(e.target.value)}
              className="input py-2 text-sm min-w-[160px]"
            >
              <option value="">All goals</option>
              {goals.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="portfolio-broker" className="text-muted text-xs uppercase tracking-wider">Broker</label>
            <select
              id="portfolio-broker"
              value={brokerFilter}
              onChange={e => setBrokerFilter(e.target.value)}
              className="input py-2 text-sm min-w-[140px]"
            >
              <option value="">All brokers</option>
              {brokers.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          {goals.length === 0 && (
            <span className="text-muted text-xs">Add investments with goals to see portfolio.</span>
          )}
        </div>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="card flex flex-col">
          <div className="flex items-center gap-2 text-muted mb-1">
            <Wallet size={14} />
            <span className="stat-label text-xs">Net Invested</span>
          </div>
          <span className="font-mono text-lg font-bold text-accent">{fmt(totalNet)}</span>
        </div>
        <div className="card flex flex-col">
          <div className="flex items-center gap-2 text-muted mb-1">
            <Target size={14} />
            <span className="stat-label text-xs">Positions</span>
          </div>
          <span className="font-mono text-lg font-bold text-white">{aggregated.length}</span>
        </div>
        <div className="card flex flex-col">
          <div className="flex items-center gap-2 text-muted mb-1">
            <PieIcon size={14} />
            <span className="stat-label text-xs">Equity</span>
          </div>
          <span className="font-mono text-lg font-bold" style={{ color: ASSET_COLORS.Equity }}>{equityPct.toFixed(1)}%</span>
        </div>
        <div className="card flex flex-col">
          <div className="flex items-center gap-2 text-muted mb-1">
            <PieIcon size={14} />
            <span className="stat-label text-xs">Debt</span>
          </div>
          <span className="font-mono text-lg font-bold" style={{ color: ASSET_COLORS.Debt }}>{debtPct.toFixed(1)}%</span>
        </div>
        <div className="card flex flex-col">
          <div className="flex items-center gap-2 text-muted mb-1">
            <PieIcon size={14} />
            <span className="stat-label text-xs">Gold / RE</span>
          </div>
          <span className="font-mono text-lg font-bold" style={{ color: ASSET_COLORS.Gold }}>{goldPct.toFixed(1)}%</span>
        </div>
        <div className="card flex flex-col">
          <div className="flex items-center gap-2 text-muted mb-1">
            <PieIcon size={14} />
            <span className="stat-label text-xs">Cash</span>
          </div>
          <span className="font-mono text-lg font-bold" style={{ color: ASSET_COLORS.Cash }}>{cashPct.toFixed(1)}%</span>
        </div>
      </div>

      {/* Trade feedback — portfolio / goal + ask if trade makes sense */}
      <TradeFeedbackCard
        key={`portfolio-${goalFilter}-${aggregated.filter((r) => r.net > 0).length}`}
        defaultPortfolioContext={aggregated.length > 0
          ? `Current: ${aggregated.filter((r) => r.net > 0).slice(0, 12).map((r) => `${r.instrument} ₹${fmt(r.net)}`).join(', ')}${aggregated.filter((r) => r.net > 0).length > 12 ? '…' : ''}. Goal: ${goalFilter || 'Balanced'}`
          : ''}
        holdings={aggregated}
      />

      {/* Three charts in one row: Risk, Asset, Broker */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Risk pie */}
        <div className="card">
          <p className="stat-label mb-3">Risk Mix</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={riskPie}
                cx="50%"
                cy="45%"
                innerRadius={45}
                outerRadius={70}
                dataKey="value"
                nameKey="name"
                strokeWidth={0}
                labelLine={false}
              >
                {riskPie.map(d => (
                  <Cell key={d.name} fill={RISK_COLORS[d.name] || '#9ca3af'} />
                ))}
              </Pie>
              <Legend
                layout="horizontal"
                align="center"
                verticalAlign="bottom"
                formatter={(value) => <span style={{ color: '#e5e7eb', fontSize: 12 }}>{value}</span>}
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ paddingTop: 8 }}
              />
              <Tooltip
                contentStyle={{
                  background: '#1e2330',
                  border: '1px solid #2a3040',
                  borderRadius: 8,
                  fontSize: 12,
                  color: '#e5e7eb',
                }}
                formatter={(value, name) => [fmt(value), name || 'Amount']}
                content={({ active, payload }) =>
                  active && payload?.[0] ? (
                    <div style={{ padding: '6px 10px', background: '#1e2330', border: '1px solid #2a3040', borderRadius: 8, fontSize: 12, color: '#e5e7eb' }}>
                      <strong>{payload[0].name}</strong>: {fmt(payload[0].value)}
                    </div>
                  ) : null
                }
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Asset bar */}
        <div className="card">
          <p className="stat-label mb-3">By Asset Class (₹L)</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={assetBar} margin={{ top: 4, right: 4, bottom: 20, left: 0 }}>
              <XAxis
                dataKey="name"
                tick={{ fill: '#6b7280', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fill: '#6b7280', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: '#1e2330',
                  border: '1px solid #2a3040',
                  borderRadius: 8,
                  fontSize: 12,
                  color: '#e5e7eb',
                }}
                content={({ active, payload }) =>
                  active && payload?.[0] ? (
                    <div style={{ padding: '6px 10px', background: '#1e2330', border: '1px solid #2a3040', borderRadius: 8, fontSize: 12, color: '#e5e7eb' }}>
                      <strong>{payload[0].payload?.name ?? 'Value'}</strong>: {Number(payload[0].value).toFixed(2)} L
                    </div>
                  ) : null
                }
              />
              <Bar dataKey="ValueL" radius={[3, 3, 0, 0]}>
                {assetBar.map(d => (
                  <Cell
                    key={d.name}
                    fill={ASSET_COLORS[d.name] || '#9ca3af'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* By Broker */}
        <div className="card">
          <p className="stat-label mb-3">By Broker Account</p>
          {brokerPie.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={brokerPie}
                  cx="50%"
                  cy="45%"
                  innerRadius={40}
                  outerRadius={65}
                  dataKey="value"
                  nameKey="name"
                  strokeWidth={0}
                >
                  {brokerPie.map((d, i) => (
                    <Cell key={d.name} fill={BROKER_COLORS[i % BROKER_COLORS.length]} />
                  ))}
                </Pie>
                <Legend
                  layout="horizontal"
                  align="center"
                  verticalAlign="bottom"
                  formatter={(value) => <span style={{ color: '#e5e7eb', fontSize: 11 }}>{value}</span>}
                  iconType="circle"
                  iconSize={6}
                  wrapperStyle={{ paddingTop: 6 }}
                />
                <Tooltip
                  contentStyle={{ background: '#1e2330', border: '1px solid #2a3040', borderRadius: 8, fontSize: 12, color: '#e5e7eb' }}
                  content={({ active, payload }) =>
                    active && payload?.[0] ? (
                      <div style={{ padding: '6px 10px', background: '#1e2330', border: '1px solid #2a3040', borderRadius: 8, fontSize: 12, color: '#e5e7eb' }}>
                        <strong>{payload[0].name}</strong>: {fmt(payload[0].value)}
                      </div>
                    ) : null
                  }
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-muted text-sm">No broker data</div>
          )}
        </div>
      </div>

      {/* Aggregated net positions (goal, account, asset, instrument, broker) */}
      <div className="card overflow-hidden">
        <p className="text-muted text-xs mb-3">Net position per goal, account, asset, instrument & broker (BUY − SELL aggregated)</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Goal', 'Account', 'Asset Class', 'Instrument', 'Broker', 'Net (₹)'].map(
                  h => (
                    <th
                      key={h}
                      className="text-left py-3 px-4 text-muted font-display text-xs uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted font-mono text-sm animate-pulse">
                    Loading…
                  </td>
                </tr>
              ) : aggregated.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted">
                    {goalFilter || brokerFilter ? 'No positions for this filter' : 'No investments yet'}
                  </td>
                </tr>
              ) : (
                aggregated.map((row, i) => (
                  <tr key={i} className="border-b border-border/40 hover:bg-surface/40 transition-colors">
                    <td className="py-3 px-4 text-xs text-soft">{row.goal}</td>
                    <td className="py-3 px-4 text-xs text-soft">{row.account}</td>
                    <td className="py-3 px-4 text-xs">
                      <span className="tag bg-card/60">{row.asset_class}</span>
                    </td>
                    <td className="py-3 px-4 text-xs text-soft max-w-xs truncate">{row.instrument}</td>
                    <td className="py-3 px-4 text-xs text-muted">{row.broker}</td>
                    <td className="py-3 px-4 font-mono text-soft">
                      {row.net >= 0 ? '' : '−'}
                      {fmt(Math.abs(row.net))}
                    </td>
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
