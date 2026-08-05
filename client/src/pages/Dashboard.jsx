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
import { fmt, fmtDate, colorFor, ASSET_COLORS, sliceByCalendarMonths, aggregateSavingsRate } from '../lib/utils';
import { TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle2, Info, ArrowRight, Download } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import PageHeader from '../components/PageHeader';
import RangeChips from '../components/RangeChips';
import ExportModal from '../components/ExportModal';
import { TT, AX, GRID, CHROME, identityPalette } from '../lib/chartTheme';
import { useNavigate } from 'react-router-dom';

// Low / Medium / High — same hues as Portfolio's RISK_COLORS map.
const RISK_COLORS = identityPalette(['blue', 'amber', 'orange']);

// Convert an investment's amount to INR using its currency and the live FX rate map.
function toINR(inv, fxRates) {
  const fx = fxRates?.[inv.currency || 'INR'] || 1;
  return Number(inv.amount) * fx;
}

// Tooltip / axis / grid chrome comes from lib/chartTheme.js — see AC-4.1.
const money = (v, name) => [fmt(v), name];

// ── Stat cards ────────────────────────────────────────────────────────────────
function HeroCard({ label, value, sub, trend }) {
  const Icon = trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;
  const tc   = trend > 0 ? 'text-teal' : trend < 0 ? 'text-rose' : 'text-muted';
  return (
    <div className="card-hero fade-up">
      <p className="stat-label mb-3">{label}</p>
      <p className="stat-hero glow-accent">{value}</p>
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
            a.level === 'warning' ? 'bg-amber-500/10 border border-amber-500/25 text-hue-amber' :
                                    'bg-accent/10 border border-accent/25 text-accent-ink'}`}>
          {a.level === 'error'   ? <AlertTriangle size={15} className="shrink-0" /> :
           a.level === 'warning' ? <AlertTriangle size={15} className="shrink-0" /> :
                                   <Info size={15} className="shrink-0" />}
          <span className="flex-1">{a.message}</span>
          {a.cta && (
            <a href={a.href} className="tap flex items-center gap-1 text-xs font-semibold underline shrink-0 hover:opacity-80">
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
const FINANCE_RANGE_KEY = 'finance_chart_range';
const RANGE_MONTHS = { '3M': 3, '6M': 6, '1Y': 12 };
// Gap-tolerant: slices by calendar months present, not row count — a gap in
// cashflow history no longer makes "3M" mean "the last 3 rows however far
// back they go."
function sliceByRange(data, range) {
  const months = RANGE_MONTHS[range];
  return months ? sliceByCalendarMonths(data, months) : data;
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

  // 3. Savings rate declining (compare 3m avg vs previous 3m avg).
  // Uses the same aggregateSavingsRate (Σsaving/Σincome) as the Dashboard
  // chart caption — they must not be able to disagree on what "the savings
  // rate" is for the same window.
  if (cashflowData.length >= 6) {
    const avgLast = aggregateSavingsRate(cashflowData.slice(-3));
    const avgPrev = aggregateSavingsRate(cashflowData.slice(-6, -3));
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

// ── Saved vs Deployed wording ──────────────────────────────────────────────────
// `corpus` is a running sum of monthly savings starting at zero from the first
// tracked cashflow month; `totalInvested` is all-time investment principal.
// These are two different denominators (savings vs. deployed capital) — the
// difference between them is NOT a return figure, so it must never be
// labelled "(returns!)". The card and the chart caption share this exact
// wording/guard logic so they can't contradict each other.
function savedVsDeployedCopy(corpus, totalInvested, firstMonth) {
  const gap   = corpus - totalInvested;
  const since = firstMonth ? fmtDate(firstMonth) : null;
  if (totalInvested === 0) {
    return {
      diffValue: Math.abs(gap),
      diffSub:   'nothing deployed yet',
      tone:      'neutral',
      since,
    };
  }
  return {
    diffValue: Math.abs(gap),
    diffSub:   gap >= 0 ? 'saved beyond deployment' : 'deployed beyond savings',
    tone:      gap >= 0 ? 'positive' : 'warning',
    since,
  };
}

// ── Corpus vs Invested chart ──────────────────────────────────────────────────
function CorpusVsInvestedChart({ cashflowData, investments, allCashflowData, fxRates }) {
  // Build cumulative investments by month — needs to be keyed against ALL history,
  // but we only display the sliced window.
  const invByMonth = {};
  (investments || []).forEach(inv => {
    const mk = inv.date.slice(0, 7);
    const a  = inv.side === 'SELL' ? -toINR(inv, fxRates) : toINR(inv, fxRates);
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

  // Unclamped raw values — must match PersonPanel's stat-card numbers exactly
  // (the chart's own Corpus/Invested series are floored at 0 purely so the
  // area chart doesn't dip below the axis; the caption below uses the real
  // numbers so the two can't disagree).
  const rawFirst    = cashflowData[0];
  const rawLast      = cashflowData[cashflowData.length - 1];
  const rawCorpus    = Number(rawLast?.corpus || 0);
  const rawInvested  = cumByMonth[rawLast?.month?.slice(0, 7) || ''] || 0;
  const firstMonth   = (allCashflowData || cashflowData)[0]?.month || rawFirst?.month;
  const copy = savedVsDeployedCopy(rawCorpus, rawInvested, firstMonth);
  const toneClass = copy.tone === 'warning' ? 'text-hue-amber' : copy.tone === 'positive' ? 'text-teal' : 'text-muted';

  return (
    <div className="card">
      <div className="flex items-start justify-between mb-1">
        <div>
          <p className="stat-label mb-0.5">Saved vs Deployed</p>
          <p className="text-xs text-muted">
            CORPUS <span className="font-mono text-white">{fmt(rawCorpus)}</span> — saved since {copy.since ? copy.since : '—'}
          </p>
          <p className="text-xs text-muted">
            DEPLOYED <span className="font-mono text-white">{fmt(rawInvested)}</span> — invested since {copy.since ? copy.since : '—'}
          </p>
          <p className="text-xs text-muted">
            SAVED VS DEPLOYED <span className={`font-mono ${toneClass}`}>{fmt(copy.diffValue)}</span> — {copy.diffSub}
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
          <CartesianGrid {...GRID} />
          <XAxis dataKey="month" {...AX} />
          <YAxis {...AX} tickFormatter={v => fmt(v)} width={60} />
          <Tooltip {...TT} formatter={money} />
          <Area type="monotone" dataKey="Corpus"   stroke="#2dd4bf" strokeWidth={2}   fill="url(#gCorpus)" dot={false} />
          <Line type="monotone" dataKey="Invested" stroke="#f0c040" strokeWidth={2}   dot={false} strokeDasharray="5 3" />
        </ComposedChart>
      </ResponsiveContainer>
      <Leg items={[['Corpus (cumul. savings)', '#2dd4bf'], ['Total Deployed (investments)', '#f0c040', true]]} />
    </div>
  );
}

// ── Savings Rate chart ────────────────────────────────────────────────────────
const RANGE_LABEL = { '3M': '3-month', '6M': '6-month', '1Y': '12-month', 'All': 'All-time' };
const RATE_DOMAIN_FLOOR = -100;

function SavingsRateChart({ cashflowData, range }) {
  const data = cashflowData.map(r => {
    const inc  = Number(r.income || 0) + Number(r.other_income || 0);
    // No clamp — a real negative-saving month must show as negative, not get
    // flattened to 0 (that inflates any average computed from this series).
    // `null` (not 0) for zero-income months so the line breaks cleanly there
    // instead of implying a real 0% rate.
    const rate = inc > 0 ? (Number(r.actual_saving || 0) / inc) * 100 : null;
    const tgt  = inc > 0 && Number(r.target_saving || 0) > 0
      ? (Number(r.target_saving || 0) / inc) * 100 : null;
    return {
      month:        fmtDate(r.month),
      'Savings %':  rate != null ? parseFloat(rate.toFixed(1)) : null,
      'Target %':   tgt,
      offScale:     rate != null && rate < RATE_DOMAIN_FLOOR,
    };
  });

  // Σsaving/Σincome over the window — same aggregateSavingsRate() used by
  // buildAlerts, so the caption and the alert bar can't disagree. Label
  // follows the selected chip instead of being hardcoded to "12m".
  const avg = aggregateSavingsRate(cashflowData);
  const label = RANGE_LABEL[range] || `${cashflowData.length}-month`;
  const offScaleMonths = data.filter(d => d.offScale);

  return (
    <div className="card">
      <div className="flex items-start justify-between mb-1">
        <div>
          <p className="stat-label mb-0.5">Savings Rate</p>
          <p className="text-xs text-muted">
            {label} avg: <span className="font-mono text-white">{avg.toFixed(1)}%</span>
            {offScaleMonths.length > 0 && (
              <span className="text-hue-amber ml-2">
                · {offScaleMonths.length} month{offScaleMonths.length > 1 ? 's' : ''} off-scale (below {RATE_DOMAIN_FLOOR}%, chart floor)
              </span>
            )}
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
          <CartesianGrid {...GRID} />
          <XAxis dataKey="month" {...AX} />
          <YAxis {...AX} tickFormatter={v => `${v}%`} width={44} domain={[RATE_DOMAIN_FLOOR, 'auto']} allowDataOverflow />
          <Tooltip {...TT} formatter={(v, name) => [v != null ? `${Number(v).toFixed(1)}%` : '—', name]} />
          <ReferenceLine y={0}   stroke={CHROME.hairline(0.2)} />
          <ReferenceLine y={avg} stroke={CHROME.hairline(0.12)} strokeDasharray="4 2" />
          <Area  type="monotone" dataKey="Savings %" stroke="#6366f1" strokeWidth={2} fill="url(#gRate)" dot={{ r: 3, fill: '#6366f1' }} connectNulls />
          <Line  type="monotone" dataKey="Target %"  stroke="#f0c040" strokeWidth={1.5} dot={false} strokeDasharray="5 3" connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
      <Leg items={[['Savings Rate %', '#6366f1'], ['Target Rate %', '#f0c040', true]]} />
    </div>
  );
}

// ── Range pill selector ───────────────────────────────────────────────────────
function RangePills({ range, setRange }) {
  return <RangeChips options={RANGES} value={range} onChange={setRange} />;
}

// ── Full person panel ─────────────────────────────────────────────────────────
function PersonPanel({ person, cashflowData, investments, otherAssets, fxRates }) {
  const [range, setRangeRaw] = useState(() => localStorage.getItem(FINANCE_RANGE_KEY) || '1Y');
  const setRange = (r) => { setRangeRaw(r); localStorage.setItem(FINANCE_RANGE_KEY, r); };
  const color   = colorFor(person);
  const latest  = cashflowData[cashflowData.length - 1];

  // Core numbers — net asset computed from real data, not a stored field
  const totalInvested = (investments || []).reduce(
    (s, inv) => s + (inv.side === 'SELL' ? -toINR(inv, fxRates) : toINR(inv, fxRates)), 0
  );
  const oa = otherAssets || [];
  const illiquidValue = oa.reduce((s, a) => s + Number(a.current_value  || 0), 0);
  const illiquidLoans = oa.reduce((s, a) => s + Number(a.loan_outstanding || 0), 0);
  const netAsset      = totalInvested + illiquidValue - illiquidLoans;

  const corpus    = Number(latest?.corpus || 0);
  const corpusGap = corpus - totalInvested;
  const svdCopy   = savedVsDeployedCopy(corpus, totalInvested, cashflowData[0]?.month);

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

  // Every slice that feeds total_asset must be represented — debt_ppf and
  // equity_smallcase were previously omitted from both the slice list and
  // the Equity roll-up, so Recharts (which normalizes to the sum of slices
  // it's given, not to total_asset) overstated every remaining slice's
  // share. `key` is the underlying column name so ASSET_COLORS lookups
  // can't reshuffle when a slice is added or a category is empty.
  const assetBreakdown = latest ? [
    { key: 'cash',        name: 'Cash',        value: Number(latest.cash) },
    { key: 'gold_silver', name: 'Gold/Silver', value: Number(latest.gold_silver) },
    { key: 'debt_pf',     name: 'PF',          value: Number(latest.debt_pf) },
    { key: 'debt_ppf',    name: 'PPF',         value: Number(latest.debt_ppf) },
    { key: 'debt_mf',     name: 'MF',          value: Number(latest.debt_mf) },
    { key: 'equity_indian',    name: 'Equity', value: Number(latest.equity_indian) + Number(latest.equity_intl) + Number(latest.equity_nps) + Number(latest.equity_trading) + Number(latest.equity_smallcase) },
    { key: 'real_estate', name: 'Real Estate', value: Number(latest.real_estate) },
  ].filter(d => d.value > 0) : [];

  const riskData = latest ? [
    { name: 'Low',  value: parseFloat(latest.low_risk_pct    || 0) * 100 },
    { name: 'Med',  value: parseFloat(latest.medium_risk_pct || 0) * 100 },
    { name: 'High', value: parseFloat(latest.high_risk_pct   || 0) * 100 },
  ].filter(d => d.value > 0) : [];

  return (
    <div className="space-y-5">
      {/* Alerts */}
      <AlertBar alerts={alerts} />

      {/* Hero + stat row.
          The hero gets its own full-width row; the four secondary stats sit
          below it, 2-up until `lg` and 4-up above. Two earlier attempts failed
          because they tried to fit all five cards on one line:

            5 equal columns  — gave the app's largest type (48px .stat-hero) the
                               same 141px box as the 30px .stat-value cards, so
                               ₹1.04Cr clipped at desktop.
            hero spanning 2  — fixed the hero but left the four siblings ~149px
              of 4/6 cols       between roughly 640 and 1010px, so CORPUS,
                               TOTAL INVESTED and UNINVESTED GAP all clipped
                               instead. One clipped card became four.

          The figures simply do not all fit on one line at tablet widths. Giving
          the hero its own row is what actually resolves it: the primary figure
          gets the full container, and the secondary stats never drop below half
          the container each. It costs one row of height and it holds at every
          width rather than at a lucky range of them. Shrinking .stat-hero was
          not an option — it is part of the mono-numeral type ramp. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="col-span-2 lg:col-span-4">
          <HeroCard
            label="Net Asset"
            value={fmt(netAsset)}
            sub={`${fmt(totalInvested)} liquid + ${fmt(illiquidValue - illiquidLoans)} illiquid`}
            trend={netAsset > 0 ? 1 : 0}
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
          label="Saved vs Deployed"
          value={fmt(svdCopy.diffValue)}
          sub={svdCopy.diffSub}
          trend={svdCopy.tone === 'warning' ? -1 : svdCopy.tone === 'positive' ? 1 : 0}
          accent={svdCopy.tone === 'warning' ? 'text-hue-amber' : svdCopy.tone === 'positive' ? 'text-teal' : 'text-muted'}
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
        <CorpusVsInvestedChart cashflowData={slicedCashflow} investments={investments} allCashflowData={cashflowData} fxRates={fxRates} />
        <SavingsRateChart cashflowData={slicedCashflow} range={range} />
      </div>

      {/* Cashflow trend */}
      <div className="card fade-up">
        <p className="stat-label mb-4">Cashflow — {range === 'All' ? 'all time' : `last ${range}`}</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={cashflowChartData} barGap={4} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="month" {...AX} />
            <YAxis {...AX} tickFormatter={v => fmt(v)} width={55} />
            <Tooltip {...TT} formatter={money} />
            <ReferenceLine y={0} stroke={CHROME.hairline(0.14)} />
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
                    {assetBreakdown.map((d) => <Cell key={d.key} fill={ASSET_COLORS[d.key]} />)}
                  </Pie>
                  <Tooltip {...TT} formatter={money} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                {assetBreakdown.map((d) => (
                  <span key={d.name} className="text-xs text-muted flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ background: ASSET_COLORS[d.key] }} />
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

/* ── Dashboard page ──────────────────────────────────────────────────────── */
export default function Dashboard() {
  const { personName, persons, personsLoaded, activePerson, setActivePerson, token } = useAuth();
  const [cashflowMap, setCashflowMap]       = useState({});
  const [investmentsMap, setInvestmentsMap] = useState({});
  const [otherAssetsMap, setOtherAssetsMap] = useState({});
  const [loading, setLoading]               = useState(true);
  const [fxRates, setFxRates]               = useState({ INR: 1 });
  const [exportModalOpen, setExportModalOpen] = useState(false);

  const currentPerson = activePerson || personName;

  useEffect(() => {
    if (!personsLoaded) return;
    if (!persons.length) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all(
      persons.map(p =>
        Promise.all([
          api.get(`/cashflow?person=${p}`),
          api.get(`/investments?account=${p}`),
          api.get(`/other-assets?account=${encodeURIComponent(p)}`).catch(() => ({ data: [] })),
        ]).then(([cf, inv, oa]) => ({ person: p, cashflow: cf.data, investments: inv.data, otherAssets: oa.data }))
      )
    )
      .then(results => {
        const cfMap = {}, invMap = {}, oaMap = {};
        results.forEach(r => {
          cfMap[r.person]  = r.cashflow;
          invMap[r.person] = r.investments;
          oaMap[r.person]  = r.otherAssets;
        });
        setCashflowMap(cfMap);
        setInvestmentsMap(invMap);
        setOtherAssetsMap(oaMap);
      })
      .finally(() => setLoading(false));
  }, [persons, personsLoaded]);

  // Live USD/GBP → INR rates, so "Total Invested" sums all currencies correctly.
  useEffect(() => {
    if (!token) return;
    api.get('/investments/fx-rates')
      .then(({ data }) => setFxRates({ INR: 1, ...data }))
      .catch(() => {});
  }, [token]);

  if (loading || !personsLoaded) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted font-mono text-sm animate-pulse tracking-widest uppercase text-xs">Loading…</div>
      </div>
    );
  }

  if (!persons.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
        <p className="text-soft text-sm">No profiles loaded. Your session may have expired.</p>
        <p className="text-muted text-xs">Hard-refresh the page or sign in again from Settings.</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <PageHeader
        className="fade-up"
        title={currentPerson ? `${currentPerson}'s Dashboard` : 'Dashboard'}
        eyebrow="Financial health overview"
        actions={
          <button type="button" onClick={() => setExportModalOpen(true)} className="btn-ghost flex items-center gap-2">
            <Download size={14} /> Export &amp; Email
          </button>
        }
      />

      <PersonPanel
        person={currentPerson}
        cashflowData={cashflowMap[currentPerson] || []}
        investments={investmentsMap[currentPerson] || []}
        otherAssets={otherAssetsMap[currentPerson] || []}
        fxRates={fxRates}
      />

      {exportModalOpen && <ExportModal onClose={() => setExportModalOpen(false)} />}
    </div>
  );
}
