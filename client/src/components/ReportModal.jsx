import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { X } from 'lucide-react';
import PriceChartCard from './PriceChartCard';

function toNum(x) {
  const n = Number(x);
  return typeof x === 'number' && !isNaN(x) ? x : !isNaN(n) ? n : null;
}

const RATING_COLOR = {
  'STRONG BUY': 'text-green-400',
  BUY: 'text-teal-400',
  HOLD: 'text-amber-400',
  AVOID: 'text-rose',
};
const RISK_COLOR = { Low: 'text-green-400', Medium: 'text-amber-400', High: 'text-rose' };
const OUTLOOK_COLOR = {
  BULLISH: { text: 'text-green-400', bg: 'bg-green-400/10 border-green-400/30' },
  NEUTRAL: { text: 'text-amber-400', bg: 'bg-amber-400/10 border-amber-400/30' },
  BEARISH: { text: 'text-rose', bg: 'bg-rose/10 border-rose/30' },
};

const TOOLTIP_STYLE = {
  contentStyle: {
    background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8,
    fontSize: 12, color: '#0f172a', padding: '8px 12px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
  },
  labelStyle: { color: '#0f172a', fontWeight: 600 },
  itemStyle: { color: '#0f172a' },
};

function SectionTitle({ children }) {
  return <p className="stat-label mb-3">{children}</p>;
}

function OutlookBadge({ rating }) {
  if (!rating) return null;
  const c = OUTLOOK_COLOR[rating] || OUTLOOK_COLOR.NEUTRAL;
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded border ${c.text} ${c.bg}`}>
      {rating}
    </span>
  );
}

function FundamentalsGrid({ fundamentals }) {
  if (!fundamentals) return null;
  const fields = [
    { label: 'P/E', val: fundamentals.pe, fmt: (v) => v?.toFixed(1) },
    { label: 'P/B', val: fundamentals.pb, fmt: (v) => v?.toFixed(2) },
    { label: 'ROE %', val: fundamentals.roe, fmt: (v) => `${v?.toFixed(1)}%` },
    { label: 'D/E', val: fundamentals.debtToEquity, fmt: (v) => v?.toFixed(2) },
    { label: 'Rev Growth YoY', val: fundamentals.revenueGrowthYoY, fmt: (v) => `${v > 0 ? '+' : ''}${v?.toFixed(1)}%`, color: fundamentals.revenueGrowthYoY >= 0 ? 'text-green-400' : 'text-rose' },
    { label: 'Profit Growth YoY', val: fundamentals.profitGrowthYoY, fmt: (v) => `${v > 0 ? '+' : ''}${v?.toFixed(1)}%`, color: fundamentals.profitGrowthYoY >= 0 ? 'text-green-400' : 'text-rose' },
    { label: 'Operating Margin', val: fundamentals.operatingMargin, fmt: (v) => `${v?.toFixed(1)}%` },
    { label: 'Net Margin', val: fundamentals.netMargin, fmt: (v) => `${v?.toFixed(1)}%` },
    { label: 'EPS', val: fundamentals.eps, fmt: (v) => v?.toLocaleString('en-IN') },
  ].filter((f) => f.val != null);

  if (fields.length === 0) return null;

  return (
    <div className="card">
      <SectionTitle>Fundamental metrics</SectionTitle>
      <p className="text-muted text-xs mb-3">AI-estimated based on training data — verify with latest filings</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        {fields.map((f) => (
          <div key={f.label} className="rounded-lg bg-surface p-3">
            <p className="text-muted text-xs">{f.label}</p>
            <p className={`font-mono font-semibold mt-0.5 ${f.color || 'text-white'}`}>
              {f.fmt(f.val)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuarterlyChart({ data }) {
  if (!data?.length) return null;
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <SectionTitle>Quarterly trend (QoQ)</SectionTitle>
        <span className="text-muted text-xs">AI-estimated</span>
      </div>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }} barSize={10}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis dataKey="quarter" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} width={40}
              tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v} />
            <Tooltip {...TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
            <Bar dataKey="revenue" name="Revenue" fill="#60a5fa" radius={[3, 3, 0, 0]} />
            <Bar dataKey="profit" name="Profit" fill="#2dd4bf" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function AnnualChart({ data }) {
  if (!data?.length) return null;
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <SectionTitle>Annual trend (YoY)</SectionTitle>
        <span className="text-muted text-xs">AI-estimated</span>
      </div>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis dataKey="year" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} width={40}
              tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v} />
            <Tooltip {...TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
            <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#60a5fa" strokeWidth={2} dot={{ fill: '#60a5fa', r: 4 }} />
            <Line type="monotone" dataKey="profit" name="Profit" stroke="#2dd4bf" strokeWidth={2} dot={{ fill: '#2dd4bf', r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function OutlookSection({ outlook }) {
  if (!outlook) return null;
  const terms = [
    { key: 'shortTerm', label: 'Short-term', sublabel: '3–6 months', ratingKey: 'shortRating' },
    { key: 'mediumTerm', label: 'Medium-term', sublabel: '6–18 months', ratingKey: 'mediumRating' },
    { key: 'longTerm', label: 'Long-term', sublabel: '2–5 years', ratingKey: 'longRating' },
  ];

  return (
    <div className="card">
      <SectionTitle>Outlook &amp; Conclusion</SectionTitle>
      <div className="space-y-3">
        {terms.map(({ key, label, sublabel, ratingKey }) => {
          const text = outlook[key];
          const rating = outlook[ratingKey];
          if (!text) return null;
          const c = OUTLOOK_COLOR[rating] || OUTLOOK_COLOR.NEUTRAL;
          return (
            <div key={key} className={`rounded-xl border p-4 ${c.bg}`}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-white font-semibold text-sm">{label}</span>
                  <span className="text-muted text-xs ml-2">({sublabel})</span>
                </div>
                <OutlookBadge rating={rating} />
              </div>
              <p className="text-soft text-sm leading-relaxed">{text}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BuyTheDipSection({ buyTheDipAnalysis, screening }) {
  const dip = buyTheDipAnalysis;
  if (!dip) return null;

  return (
    <div className="card">
      <SectionTitle>Buy-the-dip analysis</SectionTitle>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="text-muted text-xs">Current dip from 52w high</p>
          <p className="font-mono text-2xl font-bold text-amber-400">
            {toNum(dip.currentDipPct) != null ? `${Number(dip.currentDipPct).toFixed(1)}%` : `${Number(screening?.dipFromHighPct || 0).toFixed(1)}%`}
          </p>
        </div>
        {dip.assessment && (
          <div className="text-right">
            <p className="text-muted text-xs mb-1">Assessment</p>
            <span className="text-xs font-medium text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded px-2 py-1">
              {dip.assessment}
            </span>
          </div>
        )}
      </div>

      {dip.levels?.length > 0 && (
        <div className="space-y-2 mb-4">
          {dip.levels.map((lvl, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg bg-surface px-4 py-3 text-sm">
              <div className="min-w-0">
                <span className="text-white font-medium">{lvl.label}</span>
                {lvl.dipFromHighPct != null && (
                  <span className="text-muted text-xs ml-2">({Number(lvl.dipFromHighPct).toFixed(1)}% below high)</span>
                )}
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <span className="font-mono text-accent">{Number(lvl.level).toLocaleString('en-IN')}</span>
                {lvl.allocPct != null && (
                  <span className="text-xs text-soft bg-accent/10 rounded px-2 py-0.5">{lvl.allocPct}% of budget</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {dip.strategy && (
        <p className="text-soft text-sm leading-relaxed border-t border-border pt-3">{dip.strategy}</p>
      )}
    </div>
  );
}

export default function ReportModal({ instrument, parsed, onClose }) {
  const screening = parsed?.screening || {};
  const alloc = parsed?.oneLakhAllocation || {};
  const supportLevels = (parsed?.supportLevels || []).map(toNum).filter((n) => n != null);
  const resistanceLevels = (parsed?.resistanceLevels || []).map(toNum).filter((n) => n != null);
  const buyLevels = (parsed?.buyTheDipLevels || []).map((b) => toNum(b?.level)).filter((n) => n != null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-start justify-center overflow-y-auto bg-black/70 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-ink border border-border rounded-t-xl sm:rounded-xl shadow-xl max-w-3xl w-full sm:my-8 max-h-[95vh] sm:max-h-[calc(100vh-4rem)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-ink border-b border-border px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between shrink-0 safe-area-top">
          <div className="min-w-0 pr-8">
            <h2 className="font-display text-lg sm:text-xl font-bold text-white truncate">
              {parsed?.reportTitle || instrument.name}
            </h2>
            {instrument.ticker && (
              <p className="text-muted text-xs mt-0.5">{instrument.ticker}</p>
            )}
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:text-white p-1 shrink-0">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto min-h-0 flex-1">

          {/* Screening */}
          {screening && (screening.currentPrice != null || screening.rating) && (
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <SectionTitle>Screening</SectionTitle>
                <span className="text-muted text-xs">Prices: Yahoo Finance</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
                {screening.currentPrice != null && (
                  <div><p className="text-muted text-xs">Price</p><p className="font-mono text-white">{Number(screening.currentPrice).toLocaleString('en-IN')}</p></div>
                )}
                {screening.high52wOrRecent != null && (
                  <div><p className="text-muted text-xs">52w High</p><p className="font-mono text-white">{Number(screening.high52wOrRecent).toLocaleString('en-IN')}</p></div>
                )}
                {screening.dipFromHighPct != null && (
                  <div><p className="text-muted text-xs">Dip from high</p><p className="font-mono text-amber-400">{Number(screening.dipFromHighPct).toFixed(1)}%</p></div>
                )}
                {screening.rating && (
                  <div><p className="text-muted text-xs">Rating</p><p className={`font-semibold ${RATING_COLOR[screening.rating] || 'text-white'}`}>{screening.rating}</p></div>
                )}
                {screening.riskLevel && (
                  <div><p className="text-muted text-xs">Risk</p><p className={RISK_COLOR[screening.riskLevel] || 'text-soft'}>{screening.riskLevel}</p></div>
                )}
              </div>
            </div>
          )}

          {/* Fundamentals */}
          <FundamentalsGrid fundamentals={parsed?.fundamentals} />

          {/* QoQ chart */}
          <QuarterlyChart data={parsed?.quarterlyTrend} />

          {/* YoY chart */}
          <AnnualChart data={parsed?.annualTrend} />

          {/* Outlook */}
          <OutlookSection outlook={parsed?.outlook} />

          {/* Buy the dip */}
          <BuyTheDipSection buyTheDipAnalysis={parsed?.buyTheDipAnalysis} screening={screening} />

          {/* ₹1 Lakh allocation */}
          <div className="rounded-xl bg-accent/15 border-2 border-accent/40 p-5">
            <p className="stat-label text-accent mb-2">₹1 Lakh allocation</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-muted text-xs uppercase">Invest today</p>
                <p className="font-mono text-xl font-bold text-white">₹{(alloc.investTodayRupees ?? 0).toLocaleString('en-IN')}</p>
              </div>
              <div>
                <p className="text-muted text-xs uppercase">Wait for level</p>
                <p className="font-mono text-lg text-accent">
                  {alloc.waitForLevel != null
                    ? (typeof alloc.waitForLevel === 'number' ? alloc.waitForLevel.toLocaleString('en-IN') : String(alloc.waitForLevel))
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-muted text-xs uppercase">Add at that level</p>
                <p className="font-mono text-lg text-white">₹{(alloc.addAmountRupees ?? 0).toLocaleString('en-IN')}</p>
              </div>
            </div>
            {alloc.rationale && (
              <p className="text-soft text-sm mt-3 border-t border-border pt-3">{alloc.rationale}</p>
            )}
          </div>

          {/* Pros / Cons / Risks */}
          {(parsed?.pros?.length || parsed?.cons?.length || parsed?.risks?.length) && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {parsed.pros?.length > 0 && (
                <div className="card">
                  <p className="text-xs text-green-400 font-semibold uppercase tracking-wider mb-2">Pros</p>
                  <ul className="space-y-1.5 text-sm text-soft">
                    {parsed.pros.map((p, i) => (
                      <li key={i} className="flex gap-2"><span className="text-green-400 shrink-0">✓</span>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
              {parsed.cons?.length > 0 && (
                <div className="card">
                  <p className="text-xs text-rose font-semibold uppercase tracking-wider mb-2">Cons</p>
                  <ul className="space-y-1.5 text-sm text-soft">
                    {parsed.cons.map((c, i) => (
                      <li key={i} className="flex gap-2"><span className="text-rose shrink-0">✗</span>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
              {parsed.risks?.length > 0 && (
                <div className="card">
                  <p className="text-xs text-amber-400 font-semibold uppercase tracking-wider mb-2">Risks</p>
                  <ul className="space-y-1.5 text-sm text-soft">
                    {parsed.risks.map((r, i) => (
                      <li key={i} className="flex gap-2"><span className="text-amber-400 shrink-0">⚠</span>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Verdict */}
          {parsed?.verdict && (
            <div className="card">
              <SectionTitle>Verdict</SectionTitle>
              <p className="text-soft text-sm leading-relaxed">{parsed.verdict}</p>
            </div>
          )}

          {/* Price chart */}
          <PriceChartCard
            instrumentId={instrument.id}
            fallbackCloses={parsed?.recentCloses || []}
            supportLevels={supportLevels}
            resistanceLevels={resistanceLevels}
            buyLevels={buyLevels}
            title="Price chart"
          />

          {/* Key levels */}
          {(supportLevels.length > 0 || resistanceLevels.length > 0 || buyLevels.length > 0) && (
            <div className="card">
              <SectionTitle>Key levels</SectionTitle>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                {supportLevels.length > 0 && (
                  <div><p className="text-muted text-xs">Support</p><p className="font-mono text-green-400">{supportLevels.map((l) => l.toLocaleString('en-IN')).join(', ')}</p></div>
                )}
                {resistanceLevels.length > 0 && (
                  <div><p className="text-muted text-xs">Resistance</p><p className="font-mono text-amber-400">{resistanceLevels.map((l) => l.toLocaleString('en-IN')).join(', ')}</p></div>
                )}
                {buyLevels.length > 0 && (
                  <div><p className="text-muted text-xs">Buy the dip</p><p className="font-mono text-accent">{buyLevels.map((l) => l.toLocaleString('en-IN')).join(', ')}</p></div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
