import { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import api from '../lib/api';
import { fmt, fmtDate, fmtPct, colorFor, ASSET_COLORS } from '../lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const RISK_COLORS = ['#60a5fa', '#fbbf24', '#f97316'];

function StatCard({ label, value, sub, trend }) {
  const Icon = trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;
  const trendColor = trend > 0 ? 'text-teal' : trend < 0 ? 'text-rose' : 'text-muted';
  return (
    <div className="card fade-up">
      <p className="stat-label mb-2">{label}</p>
      <p className="stat-value">{value}</p>
      {sub && (
        <div className={`flex items-center gap-1 mt-1 text-xs font-mono ${trendColor}`}>
          <Icon size={12} />
          <span>{sub}</span>
        </div>
      )}
    </div>
  );
}

function PersonPanel({ person, data }) {
  const color = colorFor(person);
  const latest = data[data.length - 1];
  const prev = data[data.length - 2];

  const netAssetTrend = latest && prev
    ? ((latest.net_asset - prev.net_asset) / Math.abs(prev.net_asset || 1)) * 100
    : 0;

  const chartData = data.slice(-18).map(r => ({
    month: fmtDate(r.month),
    'Net Asset': Number(r.net_asset),
    'Total Asset': Number(r.total_asset),
    'Liability': Number(r.liability),
  }));

  const assetBreakdown = latest ? [
    { name: 'Cash', value: Number(latest.cash) },
    { name: 'Gold/Silver', value: Number(latest.gold_silver) },
    { name: 'PF', value: Number(latest.debt_pf) },
    { name: 'PPF', value: Number(latest.debt_ppf) },
    { name: 'Mutual Fund', value: Number(latest.debt_mf) },
    { name: 'EQ Indian', value: Number(latest.equity_indian) },
    { name: 'EQ Intl', value: Number(latest.equity_intl) },
    { name: 'NPS', value: Number(latest.equity_nps) },
    { name: 'Trading', value: Number(latest.equity_trading) },
    { name: 'Real Estate', value: Number(latest.real_estate) },
  ].filter(d => d.value > 0) : [];

  const assetColors = Object.values(ASSET_COLORS);

  const riskData = latest ? [
    { name: 'Low Risk', value: parseFloat(latest.low_risk_pct) * 100 },
    { name: 'Medium Risk', value: parseFloat(latest.medium_risk_pct) * 100 },
    { name: 'High Risk', value: parseFloat(latest.high_risk_pct) * 100 },
  ].filter(d => d.value > 0) : [];

  return (
    <div className="flex-1 min-w-0 space-y-4">
      {/* Person header */}
      <div className="flex items-center gap-3">
        <div className="w-2 h-8 rounded-full" style={{ backgroundColor: color }} />
        <div>
          <h2 className="font-display text-xl font-bold text-white">{person}</h2>
          <p className="text-muted text-xs">{latest ? fmtDate(latest.month) : 'No data'}</p>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Net Asset"
          value={latest ? fmt(latest.net_asset) : '—'}
          sub={`${netAssetTrend >= 0 ? '+' : ''}${netAssetTrend.toFixed(1)}% MoM`}
          trend={netAssetTrend}
        />
        <StatCard
          label="Total Asset"
          value={latest ? fmt(latest.total_asset) : '—'}
        />
        <StatCard
          label="Liability"
          value={latest ? fmt(latest.liability) : '—'}
          trend={latest && latest.liability > 0 ? -1 : 0}
        />
        <StatCard
          label="Corpus"
          value={latest ? fmt(latest.corpus) : '—'}
        />
      </div>

      {/* Net Asset chart */}
      <div className="card">
        <p className="stat-label mb-4">Net Asset History</p>
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={`grad-${person}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => fmt(v)} width={55} />
            <Tooltip
              contentStyle={{ background: '#1e2330', border: '1px solid #2a3040', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: '#9ca3af' }}
              formatter={v => [fmt(v), '']}
            />
            <Area type="monotone" dataKey="Net Asset" stroke={color} fill={`url(#grad-${person})`} strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Asset breakdown + Risk */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card">
          <p className="stat-label mb-3">Asset Breakdown</p>
          <ResponsiveContainer width="100%" height={130}>
            <PieChart>
              <Pie data={assetBreakdown} cx="50%" cy="50%" innerRadius={35} outerRadius={55} dataKey="value" strokeWidth={0}>
                {assetBreakdown.map((_, i) => <Cell key={i} fill={assetColors[i % assetColors.length]} />)}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#1e2330', border: '1px solid #2a3040', borderRadius: 8, fontSize: 11 }}
                formatter={v => [fmt(v), '']}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <p className="stat-label mb-3">Risk Profile</p>
          <ResponsiveContainer width="100%" height={130}>
            <PieChart>
              <Pie data={riskData} cx="50%" cy="50%" innerRadius={35} outerRadius={55} dataKey="value" strokeWidth={0}>
                {riskData.map((_, i) => <Cell key={i} fill={RISK_COLORS[i]} />)}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#1e2330', border: '1px solid #2a3040', borderRadius: 8, fontSize: 11 }}
                formatter={v => [`${v.toFixed(1)}%`, '']}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1 mt-2">
            {riskData.map((r, i) => (
              <div key={r.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: RISK_COLORS[i] }} />
                  <span className="text-soft">{r.name}</span>
                </div>
                <span className="font-mono text-white">{r.value.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Savings trend */}
      <div className="card">
        <p className="stat-label mb-4">Savings: Actual vs Target</p>
        <ResponsiveContainer width="100%" height={120}>
          <AreaChart data={data.slice(-12).map(r => ({
            month: fmtDate(r.month),
            Actual: Number(r.actual_saving),
            Target: Number(r.target),
          }))} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => fmt(v)} width={50} />
            <Tooltip
              contentStyle={{ background: '#1e2330', border: '1px solid #2a3040', borderRadius: 8, fontSize: 12 }}
              formatter={v => [fmt(v), '']}
            />
            <Area type="monotone" dataKey="Target" stroke="#2a3040" fill="#2a3040" strokeWidth={1} strokeDasharray="4 2" dot={false} fillOpacity={0.3} />
            <Area type="monotone" dataKey="Actual" stroke={color} fill={color} strokeWidth={2} dot={false} fillOpacity={0.15} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [harshData, setHarshData] = useState([]);
  const [kirtiData, setKirtiData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/cashflow?person=Harsh'),
      api.get('/cashflow?person=Kirti'),
    ]).then(([h, k]) => {
      setHarshData(h.data);
      setKirtiData(k.data);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-muted font-mono text-sm animate-pulse">Loading dashboard…</div>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-muted text-sm mt-0.5">Combined wealth overview · Harsh & Kirti</p>
      </div>

      {/* Combined net worth banner */}
      {harshData.length > 0 && (
        <div className="card border-accent/20 bg-accent/5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="stat-label text-accent/70">Combined Net Asset</p>
              <p className="font-display text-3xl font-extrabold text-accent mt-1">
                {fmt((Number(harshData[harshData.length-1]?.net_asset || 0)) + (Number(kirtiData[kirtiData.length-1]?.net_asset || 0)))}
              </p>
            </div>
            <div className="flex gap-8">
              <div>
                <p className="stat-label">Harsh Corpus</p>
                <p className="font-mono text-lg text-white">{fmt(harshData[harshData.length-1]?.corpus)}</p>
              </div>
              {kirtiData.length > 0 && (
                <div>
                  <p className="stat-label">Kirti Corpus</p>
                  <p className="font-mono text-lg text-white">{fmt(kirtiData[kirtiData.length-1]?.corpus)}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Side by side panels */}
      <div className="flex gap-6">
        <PersonPanel person="Harsh" data={harshData} />
        <div className="w-px bg-border shrink-0" />
        <PersonPanel person="Kirti" data={kirtiData.length > 0 ? kirtiData : []} />
      </div>
    </div>
  );
}
