import { useEffect, useState } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  ReferenceLine,
} from 'recharts';
import api from '../lib/api';
import { fmt, fmtDate, colorFor, ASSET_COLORS } from '../lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

const RISK_COLORS = ['#60a5fa', '#fbbf24', '#f97316'];

function StatCard({ label, value, sub, trend }) {
  const Icon = trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;
  const trendColor = trend > 0 ? 'text-teal' : trend < 0 ? 'text-rose' : 'text-muted';
  return (
    <div className="card fade-up">
      <p className="stat-label mb-2">{label}</p>
      <p className="stat-value">{value}</p>
      {sub != null && sub !== '' && (
        <div className={`flex items-center gap-1 mt-1 text-xs font-mono ${trendColor}`}>
          <Icon size={12} />
          <span>{sub}</span>
        </div>
      )}
    </div>
  );
}

// Aggregate investments by month (net = BUY - SELL) for trend
function investmentsByMonth(investments) {
  const byMonth = {};
  for (const inv of investments || []) {
    const d = inv.date.slice(0, 7); // YYYY-MM
    const amt = inv.side === 'SELL' ? -Number(inv.amount) : Number(inv.amount);
    byMonth[d] = (byMonth[d] || 0) + amt;
  }
  return Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, net]) => ({
      month: new Date(month + '-01').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }),
      monthKey: month,
      Net: net,
    }));
}

function PersonPanel({ person, cashflowData, investments, compact }) {
  const color = colorFor(person);
  const latest = cashflowData[cashflowData.length - 1];
  const prev = cashflowData[cashflowData.length - 2];

  const netAssetTrend =
    latest && prev ? ((latest.net_asset - prev.net_asset) / Math.abs(prev.net_asset || 1)) * 100 : 0;

  const totalInvested = (investments || []).reduce(
    (s, inv) => s + (inv.side === 'SELL' ? -Number(inv.amount) : Number(inv.amount)),
    0
  );

  const cashflowChartData = cashflowData.slice(-12).map(r => ({
    month: fmtDate(r.month),
    Income: Number(r.income) + Number(r.other_income || 0),
    Expense: Number(r.net_expense),
    Saving: Number(r.actual_saving),
  }));

  const invTrendData = investmentsByMonth(investments);
  const invCumulative = invTrendData.reduce((acc, d) => {
    const last = acc.length ? acc[acc.length - 1].Cumulative : 0;
    acc.push({ ...d, Cumulative: last + d.Net });
    return acc;
  }, []);

  const momData = cashflowData.slice(-6).map((r, i) => {
    const prevRow = cashflowData[cashflowData.length - 6 + i - 1];
    const income = Number(r.income || 0);
    const expense = Number(r.net_expense || 0);
    const saving = Number(r.actual_saving ?? 0);
    const prevIncome = prevRow ? Number(prevRow.income || 0) : income;
    const prevExpense = prevRow ? Number(prevRow.net_expense || 0) : expense;
    const prevSaving = prevRow ? Number(prevRow.actual_saving ?? 0) : saving;
    return {
      month: fmtDate(r.month),
      Income: income,
      Expense: expense,
      Saving: saving,
      IncomeMoM: prevIncome !== 0 ? ((income - prevIncome) / Math.abs(prevIncome)) * 100 : 0,
      ExpenseMoM: prevExpense !== 0 ? ((expense - prevExpense) / Math.abs(prevExpense)) * 100 : 0,
      SavingMoM: prevSaving !== 0 ? ((saving - prevSaving) / Math.abs(prevSaving)) * 100 : 0,
    };
  });

  if (compact) {
    return (
      <div className="flex-1 min-w-0 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-6 rounded-full" style={{ backgroundColor: color }} />
          <h2 className="font-display font-bold text-white text-sm">{person}</h2>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <StatCard label="Net Asset" value={latest ? fmt(latest.net_asset) : '—'} sub={`${netAssetTrend >= 0 ? '+' : ''}${netAssetTrend.toFixed(1)}% MoM`} trend={netAssetTrend} />
          <StatCard label="Invested" value={fmt(totalInvested)} />
          <StatCard label="Income" value={latest ? fmt(latest.income) : '—'} />
          <StatCard label="Saving" value={latest ? fmt(latest.actual_saving) : '—'} />
        </div>
        <div className="card">
          <p className="stat-label mb-2">Cashflow (last 12m)</p>
          <ResponsiveContainer width="100%" height={100}>
            <BarChart data={cashflowChartData} barGap={2} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 9 }} tickLine={false} axisLine={false} />
              <YAxis hide />
              <Tooltip contentStyle={{ background: '#1e2330', border: '1px solid #2a3040', borderRadius: 8, fontSize: 11, color: '#e5e7eb' }} labelStyle={{ color: '#e5e7eb' }} itemStyle={{ color: '#e5e7eb' }} formatter={v => [fmt(v), '']} />
              <Bar dataKey="Income" fill="#f0c040" radius={[2, 2, 0, 0]} />
              <Bar dataKey="Expense" fill="#fb7185" radius={[2, 2, 0, 0]} />
              <Bar dataKey="Saving" fill="#2dd4bf" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  const assetBreakdown = latest
    ? [
        { name: 'Cash', value: Number(latest.cash) },
        { name: 'Gold/Silver', value: Number(latest.gold_silver) },
        { name: 'PF', value: Number(latest.debt_pf) },
        { name: 'MF', value: Number(latest.debt_mf) },
        { name: 'Equity', value: Number(latest.equity_indian) + Number(latest.equity_intl) + Number(latest.equity_nps) + Number(latest.equity_trading) },
        { name: 'Real Estate', value: Number(latest.real_estate) },
      ].filter(d => d.value > 0)
    : [];

  const riskData = latest
    ? [
        { name: 'Low', value: parseFloat(latest.low_risk_pct || 0) * 100 },
        { name: 'Med', value: parseFloat(latest.medium_risk_pct || 0) * 100 },
        { name: 'High', value: parseFloat(latest.high_risk_pct || 0) * 100 },
      ].filter(d => d.value > 0)
    : [];

  return (
    <div className="flex-1 min-w-0 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-2 h-8 rounded-full" style={{ backgroundColor: color }} />
        <div>
          <h2 className="font-display text-xl font-bold text-white">{person}</h2>
          <p className="text-muted text-xs">{latest ? fmtDate(latest.month) : 'No data'}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Net Asset" value={latest ? fmt(latest.net_asset) : '—'} sub={`${netAssetTrend >= 0 ? '+' : ''}${netAssetTrend.toFixed(1)}% MoM`} trend={netAssetTrend} />
        <StatCard label="Income" value={latest ? fmt(latest.income) : '—'} sub={latest ? fmt(latest.other_income) : ''} />
        <StatCard label="Expense" value={latest ? fmt(latest.net_expense) : '—'} />
        <StatCard label="Saving" value={latest ? fmt(latest.actual_saving) : '—'} />
        <StatCard label="Total Invested" value={fmt(totalInvested)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <p className="stat-label mb-3">Cashflow trend (last 12 months)</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={cashflowChartData} barGap={4} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => fmt(v)} width={55} />
              <Tooltip contentStyle={{ background: '#1e2330', border: '1px solid #2a3040', borderRadius: 8, fontSize: 12, color: '#e5e7eb' }} labelStyle={{ color: '#e5e7eb' }} itemStyle={{ color: '#e5e7eb' }} formatter={v => [fmt(v), '']} />
              <ReferenceLine y={0} stroke="#2a3040" />
              <Bar dataKey="Income" fill="#f0c040" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Expense" fill="#fb7185" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Saving" fill="#2dd4bf" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <p className="stat-label mb-3">Investment trend (cumulative)</p>
          <ResponsiveContainer width="100%" height={180}>
            {invCumulative.length > 0 ? (
              <AreaChart data={invCumulative} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={`inv-grad-${person}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => fmt(v)} width={55} />
                <Tooltip contentStyle={{ background: '#1e2330', border: '1px solid #2a3040', borderRadius: 8, fontSize: 12, color: '#e5e7eb' }} labelStyle={{ color: '#e5e7eb' }} itemStyle={{ color: '#e5e7eb' }} formatter={v => [fmt(v), '']} />
                <Area type="monotone" dataKey="Cumulative" stroke={color} fill={`url(#inv-grad-${person})`} strokeWidth={2} dot={false} />
              </AreaChart>
            ) : (
              <div className="h-full flex items-center justify-center text-muted text-sm">No investment entries yet</div>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <p className="stat-label mb-3">Month-over-month (Income, Expense, Saving)</p>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={momData} barGap={2} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => fmt(v)} width={55} />
            <Tooltip contentStyle={{ background: '#1e2330', border: '1px solid #2a3040', borderRadius: 8, fontSize: 12, color: '#e5e7eb' }} labelStyle={{ color: '#e5e7eb' }} itemStyle={{ color: '#e5e7eb' }} formatter={v => [fmt(v), '']} />
            <ReferenceLine y={0} stroke="#2a3040" />
            <Bar dataKey="Income" fill="#f0c040" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Expense" fill="#fb7185" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Saving" fill="#2dd4bf" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {(assetBreakdown.length > 0 || riskData.length > 0) && (
        <div className="grid grid-cols-2 gap-3">
          {assetBreakdown.length > 0 && (
            <div className="card">
              <p className="stat-label mb-3">Asset breakdown</p>
              <ResponsiveContainer width="100%" height={120}>
                <PieChart>
                  <Pie data={assetBreakdown} cx="50%" cy="50%" innerRadius={30} outerRadius={50} dataKey="value" strokeWidth={0}>
                    {assetBreakdown.map((_, i) => (
                      <Cell key={i} fill={Object.values(ASSET_COLORS)[i % 10]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#1e2330', border: '1px solid #2a3040', borderRadius: 8, fontSize: 11, color: '#e5e7eb' }} labelStyle={{ color: '#e5e7eb' }} itemStyle={{ color: '#e5e7eb' }} formatter={v => [fmt(v), '']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          {riskData.length > 0 && (
            <div className="card">
              <p className="stat-label mb-3">Risk profile</p>
              <ResponsiveContainer width="100%" height={120}>
                <PieChart>
                  <Pie data={riskData} cx="50%" cy="50%" innerRadius={30} outerRadius={50} dataKey="value" strokeWidth={0}>
                    {riskData.map((_, i) => (
                      <Cell key={i} fill={RISK_COLORS[i]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#1e2330', border: '1px solid #2a3040', borderRadius: 8, fontSize: 11, color: '#e5e7eb' }} labelStyle={{ color: '#e5e7eb' }} itemStyle={{ color: '#e5e7eb' }} formatter={v => [`${Number(v).toFixed(1)}%`, '']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { personName } = useAuth();
  const [cashflow, setCashflow] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!personName) return;
    Promise.all([
      api.get(`/cashflow?person=${personName}`),
      api.get(`/investments?account=${personName}`),
    ])
      .then(([cf, inv]) => {
        setCashflow(cf.data);
        setInvestments(inv.data);
      })
      .finally(() => setLoading(false));
  }, [personName]);

  if (loading)
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted font-mono text-sm animate-pulse">Loading dashboard…</div>
      </div>
    );

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-xl sm:text-2xl font-bold text-white truncate">Dashboard</h1>
          <p className="text-muted text-xs sm:text-sm mt-0.5">Key info, cashflow & investment trends · {personName}</p>
        </div>
      </div>

      <PersonPanel person={personName} cashflowData={cashflow} investments={investments} />
    </div>
  );
}
