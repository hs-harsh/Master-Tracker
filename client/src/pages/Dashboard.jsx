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

const TOOLTIP_STYLE = {
  background: 'var(--tooltip-bg, #0f1117)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  fontSize: 12,
  color: '#e2e8f0',
  boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
};
const TOOLTIP_LABEL_STYLE = { color: '#8b95a5' };
const TOOLTIP_ITEM_STYLE  = { color: '#e2e8f0' };

/* ── Hero stat card (Net Asset) ─────────────────────────────────────────── */
function HeroStatCard({ label, value, sub, trend, delay = '' }) {
  const Icon = trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;
  const trendColor =
    trend > 0 ? 'text-teal' : trend < 0 ? 'text-rose' : 'text-muted';
  return (
    <div className={`card-hero fade-up${delay}`}>
      <p className="stat-label mb-3">{label}</p>
      <p className="stat-hero glow-gold">{value}</p>
      {sub != null && sub !== '' && (
        <div className={`flex items-center gap-1 mt-2 text-xs font-mono ${trendColor}`}>
          <Icon size={12} />
          <span>{sub}</span>
        </div>
      )}
    </div>
  );
}

/* ── Regular stat card ──────────────────────────────────────────────────── */
function StatCard({ label, value, sub, trend, delay = '' }) {
  const Icon = trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;
  const trendColor =
    trend > 0 ? 'text-teal' : trend < 0 ? 'text-rose' : 'text-muted';
  return (
    <div
      className={`card fade-up${delay} cursor-default group`}
      style={{ transition: 'all 0.2s ease' }}
    >
      <p className="stat-label mb-2">{label}</p>
      <p className="stat-value">{value}</p>
      {sub != null && sub !== '' && (
        <div className={`flex items-center gap-1 mt-1.5 text-xs font-mono ${trendColor}`}>
          <Icon size={12} />
          <span>{sub}</span>
        </div>
      )}
    </div>
  );
}

/* ── Aggregate investments by month for cumulative trend ────────────────── */
function investmentsByMonth(investments) {
  const byMonth = {};
  for (const inv of investments || []) {
    const d = inv.date.slice(0, 7);
    const amt = inv.side === 'SELL' ? -Number(inv.amount) : Number(inv.amount);
    byMonth[d] = (byMonth[d] || 0) + amt;
  }
  return Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, net]) => ({
      month: new Date(month + '-01').toLocaleDateString('en-IN', {
        month: 'short',
        year: 'numeric',
      }),
      monthKey: month,
      Net: net,
    }));
}

/* ── Compact view (used in multi-person mode) ───────────────────────────── */
function PersonPanelCompact({ person, cashflowData, investments }) {
  const color = colorFor(person);
  const latest = cashflowData[cashflowData.length - 1];
  const prev   = cashflowData[cashflowData.length - 2];

  const netAssetTrend =
    latest && prev
      ? ((latest.net_asset - prev.net_asset) / Math.abs(prev.net_asset || 1)) * 100
      : 0;

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

  return (
    <div className="flex-1 min-w-0 space-y-3">
      <div className="flex items-center gap-2.5">
        <div className="w-1 h-8 rounded-full" style={{ backgroundColor: color }} />
        <h2 className="font-display font-bold text-white text-sm tracking-wide">{person}</h2>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <StatCard
          label="Net Asset"
          value={latest ? fmt(latest.net_asset) : '—'}
          sub={`${netAssetTrend >= 0 ? '+' : ''}${netAssetTrend.toFixed(1)}% MoM`}
          trend={netAssetTrend}
        />
        <StatCard label="Invested"  value={fmt(totalInvested)} />
        <StatCard label="Income"    value={latest ? fmt(latest.income) : '—'} />
        <StatCard label="Saving"    value={latest ? fmt(latest.actual_saving) : '—'} />
      </div>
      <div className="card">
        <p className="stat-label mb-2">Cashflow (last 12m)</p>
        <ResponsiveContainer width="100%" height={100}>
          <BarChart data={cashflowChartData} barGap={2} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <XAxis dataKey="month" tick={{ fill: '#4b5563', fontSize: 9 }} tickLine={false} axisLine={false} />
            <YAxis hide />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
              formatter={(v, name) => [fmt(v), name]}
            />
            <Bar dataKey="Income"  fill="#f0c040" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Expense" fill="#fb7185" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Saving"  fill="#2dd4bf" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ── Full person panel ──────────────────────────────────────────────────── */
function PersonPanel({ person, cashflowData, investments }) {
  const color = colorFor(person);
  const latest = cashflowData[cashflowData.length - 1];
  const prev   = cashflowData[cashflowData.length - 2];

  const netAssetTrend =
    latest && prev
      ? ((latest.net_asset - prev.net_asset) / Math.abs(prev.net_asset || 1)) * 100
      : 0;

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
    const prevRow    = cashflowData[cashflowData.length - 6 + i - 1];
    const income     = Number(r.income || 0);
    const expense    = Number(r.net_expense || 0);
    const saving     = Number(r.actual_saving ?? 0);
    const prevIncome  = prevRow ? Number(prevRow.income || 0) : income;
    const prevExpense = prevRow ? Number(prevRow.net_expense || 0) : expense;
    const prevSaving  = prevRow ? Number(prevRow.actual_saving ?? 0) : saving;
    return {
      month: fmtDate(r.month),
      Income: income,
      Expense: expense,
      Saving: saving,
      IncomeMoM:  prevIncome  !== 0 ? ((income  - prevIncome)  / Math.abs(prevIncome))  * 100 : 0,
      ExpenseMoM: prevExpense !== 0 ? ((expense - prevExpense) / Math.abs(prevExpense)) * 100 : 0,
      SavingMoM:  prevSaving  !== 0 ? ((saving  - prevSaving)  / Math.abs(prevSaving))  * 100 : 0,
    };
  });

  const assetBreakdown = latest
    ? [
        { name: 'Cash',        value: Number(latest.cash) },
        { name: 'Gold/Silver', value: Number(latest.gold_silver) },
        { name: 'PF',          value: Number(latest.debt_pf) },
        { name: 'MF',          value: Number(latest.debt_mf) },
        {
          name: 'Equity',
          value:
            Number(latest.equity_indian) +
            Number(latest.equity_intl) +
            Number(latest.equity_nps) +
            Number(latest.equity_trading),
        },
        { name: 'Real Estate', value: Number(latest.real_estate) },
      ].filter(d => d.value > 0)
    : [];

  const riskData = latest
    ? [
        { name: 'Low',  value: parseFloat(latest.low_risk_pct    || 0) * 100 },
        { name: 'Med',  value: parseFloat(latest.medium_risk_pct || 0) * 100 },
        { name: 'High', value: parseFloat(latest.high_risk_pct   || 0) * 100 },
      ].filter(d => d.value > 0)
    : [];

  return (
    <div className="flex-1 min-w-0 space-y-5">
      {/* Person header */}
      <div className="flex items-center gap-3 fade-up">
        <div className="w-1 h-10 rounded-full" style={{ backgroundColor: color }} />
        <div>
          <h2 className="font-display text-2xl font-bold text-white tracking-tight">{person}</h2>
          <p className="text-muted text-xs mt-0.5 uppercase tracking-widest font-mono">
            {latest ? fmtDate(latest.month) : 'No data'}
          </p>
        </div>
      </div>

      {/* Stats row — Net Asset hero + supporting stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        <div className="col-span-2 sm:col-span-2">
          <HeroStatCard
            label="Net Asset"
            value={latest ? fmt(latest.net_asset) : '—'}
            sub={`${netAssetTrend >= 0 ? '+' : ''}${netAssetTrend.toFixed(1)}% MoM`}
            trend={netAssetTrend}
            delay="-1"
          />
        </div>
        <StatCard
          label="Income"
          value={latest ? fmt(latest.income) : '—'}
          sub={latest && Number(latest.other_income) ? `+${fmt(latest.other_income)} other` : ''}
          delay="-2"
        />
        <StatCard label="Expense"       value={latest ? fmt(latest.net_expense) : '—'} delay="-3" />
        <StatCard label="Saving"        value={latest ? fmt(latest.actual_saving) : '—'} delay="-4" />
        <StatCard label="Total Invested" value={fmt(totalInvested)} delay="-5" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 fade-up" style={{ animationDelay: '0.15s', opacity: 0 }}>
        <div className="card">
          <p className="stat-label mb-4">Cashflow trend — last 12 months</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart
              data={cashflowChartData}
              barGap={4}
              margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
            >
              <XAxis dataKey="month" tick={{ fill: '#4b5563', fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#4b5563', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => fmt(v)} width={55} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
                formatter={(v, name) => [fmt(v), name]}
              />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.06)" />
              <Bar dataKey="Income"  fill="#f0c040" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Expense" fill="#fb7185" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Saving"  fill="#2dd4bf" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <p className="stat-label mb-4">Investments — cumulative</p>
          <ResponsiveContainer width="100%" height={180}>
            {invCumulative.length > 0 ? (
              <AreaChart
                data={invCumulative}
                margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
              >
                <defs>
                  <linearGradient id={`inv-grad-${person}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={color} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" tick={{ fill: '#4b5563', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#4b5563', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => fmt(v)} width={55} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={TOOLTIP_LABEL_STYLE}
                  itemStyle={TOOLTIP_ITEM_STYLE}
                  formatter={(v, name) => [fmt(v), name]}
                />
                <Area
                  type="monotone"
                  dataKey="Cumulative"
                  stroke={color}
                  fill={`url(#inv-grad-${person})`}
                  strokeWidth={2}
                  dot={false}
                />
              </AreaChart>
            ) : (
              <div className="h-full flex items-center justify-center text-muted text-sm">
                No investment entries yet
              </div>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* MoM chart */}
      <div className="card fade-up" style={{ animationDelay: '0.20s', opacity: 0 }}>
        <p className="stat-label mb-4">Month-over-month — Income, Expense, Saving</p>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={momData} barGap={2} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <XAxis dataKey="month" tick={{ fill: '#4b5563', fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: '#4b5563', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => fmt(v)} width={55} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
              formatter={(v, name) => [fmt(v), name]}
            />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.06)" />
            <Bar dataKey="Income"  fill="#f0c040" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Expense" fill="#fb7185" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Saving"  fill="#2dd4bf" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Asset & Risk breakdown */}
      {(assetBreakdown.length > 0 || riskData.length > 0) && (
        <div className="grid grid-cols-2 gap-3 fade-up" style={{ animationDelay: '0.25s', opacity: 0 }}>
          {assetBreakdown.length > 0 && (
            <div className="card">
              <p className="stat-label mb-3">Asset breakdown</p>
              <ResponsiveContainer width="100%" height={120}>
                <PieChart>
                  <Pie
                    data={assetBreakdown}
                    cx="50%" cy="50%"
                    innerRadius={32} outerRadius={52}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {assetBreakdown.map((_, i) => (
                      <Cell key={i} fill={Object.values(ASSET_COLORS)[i % 10]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    itemStyle={TOOLTIP_ITEM_STYLE}
                    formatter={(v, name) => [fmt(v), name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          {riskData.length > 0 && (
            <div className="card">
              <p className="stat-label mb-3">Risk profile</p>
              <ResponsiveContainer width="100%" height={120}>
                <PieChart>
                  <Pie
                    data={riskData}
                    cx="50%" cy="50%"
                    innerRadius={32} outerRadius={52}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {riskData.map((_, i) => (
                      <Cell key={i} fill={RISK_COLORS[i]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    itemStyle={TOOLTIP_ITEM_STYLE}
                    formatter={v => [`${Number(v).toFixed(1)}%`, '']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Dashboard page ─────────────────────────────────────────────────────── */
export default function Dashboard() {
  const { personName, persons } = useAuth();
  const [selectedPerson, setSelectedPerson] = useState('');
  const [cashflowMap, setCashflowMap]       = useState({});
  const [investmentsMap, setInvestmentsMap] = useState({});
  const [loading, setLoading]               = useState(true);

  useEffect(() => {
    if (persons.length && !selectedPerson) setSelectedPerson(persons[0]);
  }, [persons]);

  useEffect(() => {
    if (!persons.length) return;
    setLoading(true);
    Promise.all(
      persons.map(p =>
        Promise.all([
          api.get(`/cashflow?person=${p}`),
          api.get(`/investments?account=${p}`),
        ]).then(([cf, inv]) => ({ person: p, cashflow: cf.data, investments: inv.data }))
      )
    )
      .then(results => {
        const cfMap = {}, invMap = {};
        results.forEach(r => { cfMap[r.person] = r.cashflow; invMap[r.person] = r.investments; });
        setCashflowMap(cfMap);
        setInvestmentsMap(invMap);
      })
      .finally(() => setLoading(false));
  }, [persons]);

  const activePerson = selectedPerson || personName;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted font-mono text-sm animate-pulse tracking-widest uppercase text-xs">
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 sm:space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4 fade-up">
        <div className="min-w-0">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight truncate">
            Dashboard
          </h1>
          <p className="text-muted text-xs mt-1 uppercase tracking-widest font-mono">
            Cashflow &amp; investment overview
          </p>
        </div>

        {/* Person selector */}
        {persons.length > 1 && (
          <div
            className="flex gap-1.5 p-1 rounded-full flex-shrink-0"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {persons.map(p => (
              <button
                key={p}
                onClick={() => setSelectedPerson(p)}
                className={`px-4 py-1.5 rounded-full text-xs font-display font-bold transition-all ${
                  activePerson === p
                    ? 'bg-accent text-ink shadow-glow-gold'
                    : 'text-soft hover:text-white'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      <PersonPanel
        person={activePerson}
        cashflowData={cashflowMap[activePerson] || []}
        investments={investmentsMap[activePerson] || []}
      />
    </div>
  );
}
