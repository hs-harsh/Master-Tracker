import { useEffect, useMemo, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from 'recharts';
import api from '../lib/api';
import { fmt } from '../lib/utils';

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

const PERSON_OPTIONS = ['Harsh', 'Kirti', 'Both'];

export default function Portfolio() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [person, setPerson] = useState('Harsh');
  const [goalFilter, setGoalFilter] = useState('');

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (person !== 'Both') params.set('account', person);
    api
      .get(`/investments?${params}`)
      .then(r => setData(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [person]);

  const goals = useMemo(
    () => Array.from(new Set(data.map(d => d.goal))).sort(),
    [data]
  );

  const goalInvestments = goalFilter
    ? data.filter(d => d.goal === goalFilter)
    : data;

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

  return (
    <div className="p-6 space-y-6">
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
            <span className="text-muted text-xs uppercase tracking-wider">Account</span>
            {PERSON_OPTIONS.map(p => (
              <button
                key={p}
                onClick={() => setPerson(p)}
                className={`px-3 py-2 rounded-lg text-xs font-mono transition-colors ${
                  person === p ? 'bg-accent text-ink font-bold' : 'btn-ghost'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
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
          {goals.length === 0 && (
            <span className="text-muted text-xs">Add investments with goals to see portfolio.</span>
          )}
        </div>
      </div>

      {/* Summary + charts */}
      <div className="grid grid-cols-3 gap-4">
        {/* Total value */}
        <div className="card col-span-1 flex flex-col justify-between">
          <div>
            <p className="stat-label">Net Invested (₹)</p>
            <p className="font-mono text-2xl font-medium text-accent mt-2">
              {fmt(totalNet)}
            </p>
            <p className="text-muted text-xs mt-1">
              {goalInvestments.length} investment{goalInvestments.length !== 1 ? 's' : ''}
              {goalFilter ? ` for ${goalFilter}` : ''}
            </p>
          </div>
        </div>

        {/* Risk pie */}
        <div className="card">
          <p className="stat-label mb-3">Risk Mix</p>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={riskPie}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={70}
                dataKey="value"
                strokeWidth={0}
              >
                {riskPie.map(d => (
                  <Cell key={d.name} fill={RISK_COLORS[d.name] || '#9ca3af'} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: '#1e2330',
                  border: '1px solid #2a3040',
                  borderRadius: 8,
                  fontSize: 12,
                  color: '#e5e7eb',
                }}
                labelStyle={{ color: '#e5e7eb' }}
                itemStyle={{ color: '#e5e7eb' }}
                formatter={v => [fmt(v), '']}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Asset bar */}
        <div className="card">
          <p className="stat-label mb-3">By Asset Class (₹L)</p>
          <ResponsiveContainer width="100%" height={180}>
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
                labelStyle={{ color: '#e5e7eb' }}
                itemStyle={{ color: '#e5e7eb' }}
                formatter={v => [`${Number(v).toFixed(2)}L`, '']}
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
      </div>

      {/* Investments for goal */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Date', 'Goal', 'Asset Class', 'Instrument', 'Side', 'Amount', 'Broker'].map(
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
                  <td
                    colSpan={7}
                    className="py-8 text-center text-muted font-mono text-sm animate-pulse"
                  >
                    Loading…
                  </td>
                </tr>
              ) : goalInvestments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted">
                    {goalFilter ? `No investments for ${goalFilter} yet` : 'No investments yet'}
                  </td>
                </tr>
              ) : (
                goalInvestments.map(inv => (
                  <tr
                    key={inv.id}
                    className="border-b border-border/40 hover:bg-surface/40 transition-colors"
                  >
                    <td className="py-3 px-4 text-xs text-soft font-mono">
                      {new Date(inv.date).toLocaleDateString('en-IN')}
                    </td>
                    <td className="py-3 px-4 text-xs text-soft">{inv.goal}</td>
                    <td className="py-3 px-4 text-xs">
                      <span className="tag bg-card/60">{inv.asset_class}</span>
                    </td>
                    <td className="py-3 px-4 text-xs text-soft max-w-xs truncate">
                      {inv.instrument}
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <span
                        className={`tag ${
                          inv.side === 'BUY'
                            ? 'bg-teal/10 text-teal'
                            : 'bg-rose/10 text-rose'
                        }`}
                      >
                        {inv.side}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-soft">
                      {inv.side === 'SELL' ? '-' : ''}
                      {fmt(inv.amount)}
                    </td>
                    <td className="py-3 px-4 text-xs text-muted">
                      {inv.broker || '—'}
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
