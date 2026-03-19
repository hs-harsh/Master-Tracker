import { useEffect, useState } from 'react';
import {
  AreaChart, Area,
  BarChart, Bar,
  ComposedChart, Line,
  XAxis, YAxis,
  Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
  CartesianGrid, ReferenceLine,
} from 'recharts';
import api from '../lib/api';
import { fmt, fmtDate, colorFor, ASSET_COLORS } from '../lib/utils';
import { TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle2, Info, ArrowRight } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';

const RISK_COLORS = ['#60a5fa', '#fbbf24', '#f97316'];

const TT = {
  contentStyle: { background: '#0f1117', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, fontSize: 12, color: '#e2e8f0', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' },
  labelStyle:   { color: '#8b95a5', marginBottom: 4, fontWeight: 600 },
  formatter:    (v, name) => [fmt(v), name],
};
const AX = { tick: { fill: '#4b5563', fontSize: 10 }, tickLine: false, axisLine: false };

// ── Stat cards ────────────────────────────────────────────────────────────────
function HeroCard({ label, value, sub, trend }) {
  const Icon = trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;
  const tc   = trend > 0 ? 'text-teal' : trend < 0 ? 'text-rose' : 'text-muted';
  return (
    <div className="card-hero fade-up">
      <p className="stat-label mb-3">{label}</p>
      <p className="stat-hero glow-gold">{value}</p>
      {sub != null && sub !== '' && (
        <div className={`flex items-center gap-1 mt-2 text-xs font-mono ${tc}`}>
          <Icon size={12} /><span>{sub}</span>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, trend, accent }) {
  const Icon = trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;
  const tc   = trend > 0 ? 'text-teal' : trend < 0 ? 'text-rose' : 'text-muted';
  return (
    <div className="card fade-up">
      <p className="stat-label mb-2">{label}</p>
      <p className={`stat-value ${accent || ''}`}>{value}</p>
      {sub != null && sub !== '' && (
        <div className={`flex items-center gap-1 mt-1.5 text-xs font-mono ${tc}`}>
          <Icon size={12} /><span>{sub}</span>
        </div>
      )}
    </div>
  );
}

// ── Alert / Todo bar ──────────────────────────────────────────────────────────
function AlertBar({ alerts }) {
  if (!alerts.length) return null;
  return (
    <div className="space-y-2 fade-up">
      {alerts.map((a, i) => (
        <div key={i} className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm
          ${a.level === 'error'   ? 'bg-rose/10 border border-rose/25 text-rose' :
            a.level === 'warning' ? 'bg-amber-500/10 border border-amber-500/25 text-amber-400' :
                                    'bg-accent/10 border border-accent/25 text-accent'}`}>
          {a.level === 'error'   ? <AlertTriangle size={15} className="shrink-0" /> :
           a.level === 'warning' ? <AlertTriangle size={15} className="shrink-0" /> :
                                   <Info size={15} className="shrink-0" />}
          <span className="flex-1">{a.message}</span>
          {a.cta && (
            <a href={a.href} className="flex items-center gap-1 text-xs font-semibold underline shrink-0 hover:opacity-80">
              {a.cta} <ArrowRight size={11} />
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────
function Leg({ items }) {
  return (
    <div className="flex flex-wrap gap-4 mt-3">
      {items.map(([l, c, dash]) => (
        <div key={l} className="flex items-center gap-1.5 text-xs text-soft">
          <div className="w-5 h-0.5" style={{ background: c, borderTop: dash ? `2px dashed ${c}` : undefined }} />
          {l}
        </div>
      ))}
    </div>
  );
}

// ── Range helpers ─────────────────────────────────────────────────────────────
const RANGES = ['3M', '6M', '1Y', 'All'];
function sliceByRange(data, range) {
  if (range === '3M')  return data.slice(-3);
  if (range === '6M')  return data.slice(-6);
  if (range === '1Y')  return data.slice(-12);
  return data;
}

// ── Build alerts ──────────────────────────────────────────────────────────────
function buildAlerts(cashflowData, investments, corpusGap) {
  const alerts = [];
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // 1. Missing current month cashflow
  const hasCurrent = cashflowData.some(r => r.month?.slice(0, 7) === thisMonth);
  if (!hasCurrent) {
    alerts.push({
      level:   'warning',
      message: `No cashflow entry for ${now.toLocaleString('en-IN', { month: 'long', year: 'numeric' })} yet.`,
      cta:     'Add now',
      href:    '/cashflow',
    });
  }

  // 2. Latest month saving vs target
  const latest = cashflowData[cashflowData.length - 1];
  if (latest) {
    const actual = Number(latest.actual_saving || 0);
    const target = Number(latest.target_saving || latest.target || 0);
    if (target > 0 && actual < target) {
      const gap = target - actual;
      alerts.push({
        level:   'warning',
        message: `${fmtDate(latest.month)}: saving ${fmt(actual)} is ${fmt(gap)} short of target ${fmt(target)}.`,
      });
    } else if (target > 0 && actual >= target) {
      alerts.push({
        level:   'info',
        message: `${fmtDate(latest.month)}: on track — saved ${fmt(actual)}, target ${fmt(target)}. 🎯`,
      });
    }
  }

  // 3. Savings rate declining (compare 3m avg vs previous 3m avg)
  if (cashflowData.length >= 6) {
    const rate = r => {
      const inc = Number(r.income || 0) + Number(r.other_income || 0);
      return inc > 0 ? (Number(r.actual_saving || 0) / inc) * 100 : 0;
    };
    const last3 = cashflowData.slice(-3).map(rate);
    const prev3 = cashflowData.slice(-6, -3).map(rate);
    const avgLast = last3.reduce((s, v) => s + v, 0) / 3;
    const avgPrev = prev3.reduce((s, v) => s + v, 0) / 3;
    if (avgPrev > 0 && avgLast < avgPrev - 5) {
      alerts.push({
        level:   'warning',
        message: `Savings rate dropped from ${avgPrev.toFixed(1)}% → ${avgLast.toFixed(1)}% over last 3 months.`,
        cta:     'View cashflow',
        href:    '/cashflow',
      });
    }
  }

  // 4. Undeployed cash (corpus > total invested by a meaningful amount)
  if (corpusGap != null && corpusGap > 50000) {
    const latestInc = latest
      ? Number(latest.income || 0) + Number(latest.other_income || 0)
      : 0;
    const months = latestInc > 0 ? (corpusGap / latestInc).toFixed(1) : null;
    alerts.push({
      level:   'warning',
      message: `${fmt(corpusGap)} of corpus is sitting uninvested${months ? ` (~${months} months of income)` : ''}. Consider deploying it.`,
      cta:     'Portfolio',
      href:    '/portfolio',
    });
  }

  return alerts;
}

// ── Corpus vs Invested chart ──────────────────────────────────────────────────
function CorpusVsInvestedChart({ cashflowData, investments, allCashflowData }) {
  // Build cumulative investments by month — needs to be keyed against ALL history,
  // but we only display the sliced window.
  const invByMonth = {};
  (investments || []).forEach(inv => {
    const mk = inv.date.slice(0, 7);
    const a  = inv.side === 'SELL' ? -Number(inv.amount) : Number(inv.amount);
    invByMonth[mk] = (invByMonth[mk] || 0) + a;
  });

  // Walk the full dataset to build accurate cumulative values, then keep the slice.
  const fullBase = allCashflowData || cashflowData;
  let cumInv = 0;
  const cumByMonth = {};
  fullBase.forEach(r => {
    const mk = r.month?.slice(0, 7) || '';
    cumInv += invByMonth[mk] || 0;
    cumByMonth[mk] = cumInv;
  });

  const data = cashflowData.map(r => {
    const mk = r.month?.slice(0, 7) || '';
    return {
      month:    fmtDate(r.month),
      Corpus:   Math.max(0, Number(r.corpus || 0)),
      Invested: Math.max(0, cumByMonth[mk] || 0),
    };
  });

  const latest = data[data.length - 1];
  const gap    = latest ? latest.Corpus - latest.Invested : 0;

  return (
    <div className="card">
      <div className="flex items-start justify-between mb-1">
        <div>
          <p className="stat-label mb-0.5">Corpus vs Deployed</p>
          <p className="text-xs text-muted">
            Gap (uninvested cash):
            <span className={`font-mono ml-1 ${gap > 0 ? 'text-amber-400' : 'text-teal'}`}>
              {gap > 0 ? '+' : ''}{fmt(gap)}
            </span>
          </p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="gCorpus" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#2dd4bf" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a3040" vertical={false} />
          <XAxis dataKey="month" {...AX} />
          <YAxis {...AX} tickFormatter={v => fmt(v)} width={60} />
          <Tooltip {...TT} />
          <Area type="monotone" dataKey="Corpus"   stroke="#2dd4bf" strokeWidth={2}   fill="url(#gCorpus)" dot={false} />
          <Line type="monotone" dataKey="Invested" stroke="#f0c040" strokeWidth={2}   dot={false} strokeDasharray="5 3" />
        </ComposedChart>
      </ResponsiveContainer>
      <Leg items={[['Corpus (cumul. savings)', '#2dd4bf'], ['Total Deployed (investments)', '#f0c040', true]]} />
    </div>
  );
}

// ── Savings Rate chart ────────────────────────────────────────────────────────
function SavingsRateChart({ cashflowData }) {
  const data = cashflowData.map(r => {
    const inc  = Number(r.income || 0) + Number(r.other_income || 0);
    const rate = inc > 0 ? Math.max(0, (Number(r.actual_saving || 0) / inc) * 100) : 0;
    const tgt  = inc > 0 && Number(r.target_saving || 0) > 0
      ? (Number(r.target_saving || 0) / inc) * 100 : null;
    return { month: fmtDate(r.month), 'Savings %': parseFloat(rate.toFixed(1)), 'Target %': tgt };
  });

  const avg = data.reduce((s, d) => s + d['Savings %'], 0) / (data.length || 1);

  return (
    <div className="card">
      <div className="flex items-start justify-between mb-1">
        <div>
          <p className="stat-label mb-0.5">Savings Rate</p>
          <p className="text-xs text-muted">
            12m avg: <span className="font-mono text-white">{avg.toFixed(1)}%</span>
          </p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="gRate" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a3040" vertical={false} />
          <XAxis dataKey="month" {...AX} />
          <YAxis {...AX} tickFormatter={v => `${v}%`} width={40} domain={[0, 'auto']} />
          <Tooltip {...TT} formatter={(v, name) => [v != null ? `${Number(v).toFixed(1)}%` : '—', name]} />
          <ReferenceLine y={avg} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 2" />
          <Area  type="monotone" dataKey="Savings %" stroke="#6366f1" strokeWidth={2} fill="url(#gRate)" dot={{ r: 3, fill: '#6366f1' }} />
          <Line  type="monotone" dataKey="Target %"  stroke="#f0c040" strokeWidth={1.5} dot={false} strokeDasharray="5 3" />
        </ComposedChart>
      </ResponsiveContainer>
      <Leg items={[['Savings Rate %', '#6366f1'], ['Target Rate %', '#f0c040', true]]} />
    </div>
  );
}

// ── Range pill selector ───────────────────────────────────────────────────────
function RangePills({ range, setRange }) {
  return (
    <div className="flex gap-1 p-0.5 rounded-lg"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
      {RANGES.map(r => (
        <button key={r} onClick={() => setRange(r)}
          className={`px-3 py-1 rounded-md text-xs font-mono font-semibold transition-all
            ${range === r ? 'bg-accent text-ink shadow-glow-gold' : 'text-muted hover:text-white'}`}>
          {r}
        </button>
      ))}
    </div>
  );
}

// ── Full person panel ─────────────────────────────────────────────────────────
function PersonPanel({ person, cashflowData, investments }) {
  const [range, setRange] = useState('1Y');
  const color   = colorFor(person);
  const latest  = cashflowData[cashflowData.length - 1];
  const prev    = cashflowData[cashflowData.length - 2];

  // Core numbers
  const netAsset     = Number(latest?.net_asset || 0);
  const corpus       = Number(latest?.corpus    || 0);
  const totalInvested = (investments || []).reduce(
    (s, inv) => s + (inv.side === 'SELL' ? -Number(inv.amount) : Number(inv.amount)), 0
  );
  const corpusGap = corpus - totalInvested; // positive = undeployed, negative = investments > corpus (returns!)

  const netAssetTrend = latest && prev
    ? ((netAsset - Number(prev.net_asset || 0)) / Math.abs(Number(prev.net_asset) || 1)) * 100
    : 0;

  const latestIncome  = Number(latest?.income || 0) + Number(latest?.other_income || 0);
  const savingsRate   = latestIncome > 0
    ? (Number(latest?.actual_saving || 0) / latestIncome * 100).toFixed(1)
    : '—';

  const alerts = buildAlerts(cashflowData, investments, corpusGap);

  // Sliced data for charts (range-aware)
  const slicedCashflow = sliceByRange(cashflowData, range);

  const cashflowChartData = slicedCashflow.map(r => ({
    month:   fmtDate(r.month),
    Income:  Number(r.income || 0) + Number(r.other_income || 0),
    Expense: Number(r.net_expense || 0),
    Saving:  Number(r.actual_saving || 0),
  }));

  const assetBreakdown = latest ? [
    { name: 'Cash',        value: Number(latest.cash) },
    { name: 'Gold/Silver', value: Number(latest.gold_silver) },
    { name: 'PF',          value: Number(latest.debt_pf) },
    { name: 'MF',          value: Number(latest.debt_mf) },
    { name: 'Equity',      value: Number(latest.equity_indian) + Number(latest.equity_intl) + Number(latest.equity_nps) + Number(latest.equity_trading) },
    { name: 'Real Estate', value: Number(latest.real_estate) },
  ].filter(d => d.value > 0) : [];

  const riskData = latest ? [
    { name: 'Low',  value: parseFloat(latest.low_risk_pct    || 0) * 100 },
    { name: 'Med',  value: parseFloat(latest.medium_risk_pct || 0) * 100 },
    { name: 'High', value: parseFloat(latest.high_risk_pct   || 0) * 100 },
  ].filter(d => d.value > 0) : [];

  return (
    <div className="space-y-5">
      {/* Person header */}
      <div className="flex items-center gap-3 fade-up">
        <div className="w-1 h-10 rounded-full" style={{ backgroundColor: color }} />
        <div>
          <h2 className="font-display text-2xl font-bold text-white tracking-tight">{person}</h2>
          <p className="text-muted text-xs mt-0.5 uppercase tracking-widest font-mono">
            {latest ? fmtDate(latest.month) : 'No cashflow data'}
          </p>
        </div>
      </div>

      {/* Alerts */}
      <AlertBar alerts={alerts} />

      {/* Hero + stat row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="col-span-2 sm:col-span-1">
          <HeroCard
            label="Net Asset"
            value={latest ? fmt(netAsset) : '—'}
            sub={`${netAssetTrend >= 0 ? '+' : ''}${netAssetTrend.toFixed(1)}% MoM`}
            trend={netAssetTrend}
          />
        </div>
        <StatCard
          label="Corpus"
          value={fmt(corpus)}
          sub="cumulative savings"
          trend={0}
        />
        <StatCard
          label="Total Invested"
          value={fmt(totalInvested)}
          sub="net deployed"
          trend={0}
        />
        <StatCard
          label="Uninvested Gap"
          value={fmt(Math.abs(corpusGap))}
          sub={corpusGap > 0 ? 'cash not yet deployed' : 'investments > corpus (returns!)'}
          trend={corpusGap > 0 ? -1 : 1}
          accent={corpusGap > 0 ? 'text-amber-400' : 'text-teal'}
        />
        <StatCard
          label="Savings Rate"
          value={savingsRate !== '—' ? `${savingsRate}%` : '—'}
          sub={`this month (target: ${latestIncome > 0 && Number(latest?.target_saving) > 0 ? (Number(latest.target_saving) / latestIncome * 100).toFixed(1) + '%' : '—'})`}
          trend={savingsRate !== '—' && Number(savingsRate) >= 20 ? 1 : -1}
        />
      </div>

      {/* Charts with range selector */}
      <div className="flex items-center justify-between fade-up">
        <p className="text-xs text-muted uppercase tracking-widest font-mono">Trend charts</p>
        <RangePills range={range} setRange={setRange} />
      </div>

      {/* Corpus vs Invested + Savings Rate */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 fade-up">
        <CorpusVsInvestedChart cashflowData={slicedCashflow} investments={investments} allCashflowData={cashflowData} />
        <SavingsRateChart cashflowData={slicedCashflow} />
      </div>

      {/* Cashflow trend */}
      <div className="card fade-up">
        <p className="stat-label mb-4">Cashflow — {range === 'All' ? 'all time' : `last ${range}`}</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={cashflowChartData} barGap={4} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a3040" vertical={false} />
            <XAxis dataKey="month" {...AX} />
            <YAxis {...AX} tickFormatter={v => fmt(v)} width={55} />
            <Tooltip {...TT} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.06)" />
            <Bar dataKey="Income"  fill="#f0c040" radius={[3,3,0,0]} />
            <Bar dataKey="Expense" fill="#fb7185" radius={[3,3,0,0]} />
            <Bar dataKey="Saving"  fill="#2dd4bf" radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
        <Leg items={[['Income', '#f0c040'], ['Expense', '#fb7185'], ['Saving', '#2dd4bf']]} />
      </div>

      {/* Asset & Risk pies */}
      {(assetBreakdown.length > 0 || riskData.length > 0) && (
        <div className="grid grid-cols-2 gap-3 fade-up">
          {assetBreakdown.length > 0 && (
            <div className="card">
              <p className="stat-label mb-3">Asset breakdown</p>
              <ResponsiveContainer width="100%" height={130}>
                <PieChart>
                  <Pie data={assetBreakdown} cx="50%" cy="50%" innerRadius={32} outerRadius={52} dataKey="value" strokeWidth={0}>
                    {assetBreakdown.map((_, i) => <Cell key={i} fill={Object.values(ASSET_COLORS)[i % 10]} />)}
                  </Pie>
                  <Tooltip {...TT} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                {assetBreakdown.map((d, i) => (
                  <span key={d.name} className="text-xs text-muted flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ background: Object.values(ASSET_COLORS)[i % 10] }} />
                    {d.name}
                  </span>
                ))}
              </div>
            </div>
          )}
          {riskData.length > 0 && (
            <div className="card">
              <p className="stat-label mb-3">Risk profile</p>
              <ResponsiveContainer width="100%" height={130}>
                <PieChart>
                  <Pie data={riskData} cx="50%" cy="50%" innerRadius={32} outerRadius={52} dataKey="value" strokeWidth={0}>
                    {riskData.map((_, i) => <Cell key={i} fill={RISK_COLORS[i]} />)}
                  </Pie>
                  <Tooltip {...TT} formatter={v => [`${Number(v).toFixed(1)}%`, '']} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-1">
                {riskData.map((d, i) => (
                  <span key={d.name} className="text-xs text-muted flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ background: RISK_COLORS[i] }} />
                    {d.name} {Number(d.value).toFixed(0)}%
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Compact view (multi-person sidebar) ──────────────────────────────────── */
function PersonPanelCompact({ person, cashflowData, investments }) {
  const color  = colorFor(person);
  const latest = cashflowData[cashflowData.length - 1];
  const prev   = cashflowData[cashflowData.length - 2];
  const netAssetTrend = latest && prev
    ? ((Number(latest.net_asset) - Number(prev.net_asset)) / Math.abs(Number(prev.net_asset) || 1)) * 100 : 0;
  const totalInvested = (investments || []).reduce(
    (s, inv) => s + (inv.side === 'SELL' ? -Number(inv.amount) : Number(inv.amount)), 0
  );
  const cfData = cashflowData.slice(-12).map(r => ({
    month:   fmtDate(r.month),
    Income:  Number(r.income || 0) + Number(r.other_income || 0),
    Expense: Number(r.net_expense || 0),
    Saving:  Number(r.actual_saving || 0),
  }));
  return (
    <div className="flex-1 min-w-0 space-y-3">
      <div className="flex items-center gap-2.5">
        <div className="w-1 h-8 rounded-full" style={{ backgroundColor: color }} />
        <h2 className="font-display font-bold text-white text-sm tracking-wide">{person}</h2>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Net Asset" value={latest ? fmt(latest.net_asset) : '—'}
          sub={`${netAssetTrend >= 0 ? '+' : ''}${netAssetTrend.toFixed(1)}% MoM`} trend={netAssetTrend} />
        <StatCard label="Invested"  value={fmt(totalInvested)} />
        <StatCard label="Income"    value={latest ? fmt(latest.income) : '—'} />
        <StatCard label="Saving"    value={latest ? fmt(latest.actual_saving) : '—'} />
      </div>
      <div className="card">
        <p className="stat-label mb-2">Cashflow (last 12m)</p>
        <ResponsiveContainer width="100%" height={100}>
          <BarChart data={cfData} barGap={2} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <XAxis dataKey="month" tick={{ fill: '#4b5563', fontSize: 9 }} tickLine={false} axisLine={false} />
            <YAxis hide />
            <Tooltip {...TT} />
            <Bar dataKey="Income"  fill="#f0c040" radius={[3,3,0,0]} />
            <Bar dataKey="Expense" fill="#fb7185" radius={[3,3,0,0]} />
            <Bar dataKey="Saving"  fill="#2dd4bf" radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ── Dashboard page ──────────────────────────────────────────────────────── */
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
        <div className="text-muted font-mono text-sm animate-pulse tracking-widest uppercase text-xs">Loading…</div>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 fade-up">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">Dashboard</h1>
          <p className="text-muted text-xs mt-1 uppercase tracking-widest font-mono">Financial health overview</p>
        </div>
        {persons.length > 1 && (
          <div className="flex gap-1.5 p-1 rounded-full"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            {persons.map(p => (
              <button key={p} onClick={() => setSelectedPerson(p)}
                className={`px-4 py-1.5 rounded-full text-xs font-display font-bold transition-all
                  ${activePerson === p ? 'bg-accent text-ink shadow-glow-gold' : 'text-soft hover:text-white'}`}>
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
