import { identityPalette } from './chartTheme';

const CURRENCY_SYMBOLS = { INR: '₹', USD: '$' };
let _currencySymbol = '₹';

export function setCurrencySymbol(currencyDisplay) {
  _currencySymbol = CURRENCY_SYMBOLS[currencyDisplay] || '₹';
}

export const fmt = (n) => {
  if (n === null || n === undefined) return '—';
  const num = Number(n);
  if (isNaN(num)) return '—';
  const s = _currencySymbol;
  if (Math.abs(num) >= 10000000) return `${s}${(num / 10000000).toFixed(2)}Cr`;
  if (Math.abs(num) >= 100000) return `${s}${(num / 100000).toFixed(2)}L`;
  if (Math.abs(num) >= 1000) return `${s}${(num / 1000).toFixed(1)}K`;
  return `${s}${num.toLocaleString('en-IN')}`;
};

export const fmtFull = (n) => {
  if (n === null || n === undefined) return '—';
  return `${_currencySymbol}${Number(n).toLocaleString('en-IN')}`;
};

export const fmtPct = (n) => {
  if (n === null || n === undefined) return '—';
  return `${(Number(n) * 100).toFixed(1)}%`;
};

// The API now emits plain YYYY-MM-DD (see server DATE-casting sweep). Parsing
// that with `new Date(isoString)` reads it as UTC midnight, which in any
// timezone west of Greenwich rolls it back to the previous local day — for a
// month value like "2026-07-01" that flips the displayed month entirely.
// Slice-then-local-noon avoids the UTC boundary altogether.
export const fmtDate = (d) => {
  if (!d) return '—';
  const date = new Date(String(d).slice(0, 10) + 'T12:00:00');
  return date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};

export const fmtMonthKey = (d) => {
  if (!d) return '';
  return String(d).slice(0, 7);
};

// Slice a month-ascending array (each row has a `month` field like
// "2026-07-01") down to the last N *calendar* months, not the last N *rows*.
// Plain `data.slice(-n)` silently means something different when there's a
// gap in cashflow history — e.g. history stops for two months and resumes —
// "3M" would return the last 3 available rows however far back they go
// instead of the last 3 calendar months. Missing months just aren't in the
// result (there's no row to synthesize), but the cutoff itself is always
// calendar-correct.
export function sliceByCalendarMonths(data, monthsBack, monthField = 'month') {
  if (!data?.length || !monthsBack) return data;
  const last = data[data.length - 1];
  const [ly, lm] = String(last[monthField]).slice(0, 7).split('-').map(Number);
  let cy = ly, cm = lm - (monthsBack - 1);
  while (cm <= 0) { cm += 12; cy -= 1; }
  const cutoffKey = `${cy}-${String(cm).padStart(2, '0')}`;
  return data.filter(r => String(r[monthField]).slice(0, 7) >= cutoffKey);
}

// Σsaving ÷ Σincome — NOT the average of already-rounded monthly percentages.
// Averaging per-month percentages over-weights low-income months (a ₹100
// saving on ₹200 income is "50%" the same as ₹50,000 on ₹100,000), and a
// naive `Math.max(0, ...)` clamp on the way in silently inflates the result
// by discarding real negative-saving months instead of counting them.
// Dashboard's chart caption and buildAlerts() both call this so the two
// can't disagree about what the savings rate is.
export function aggregateSavingsRate(rows) {
  let saving = 0, income = 0;
  for (const r of rows || []) {
    saving += Number(r.actual_saving || 0);
    income += Number(r.income || 0) + Number(r.other_income || 0);
  }
  return income > 0 ? (saving / income) * 100 : 0;
}

// ── Week-based date helpers (shared by the wellness planner pages) ───────────
export function parseD(d) {
  if (!d) return null;
  if (d instanceof Date) return d;
  return new Date(String(d).slice(0, 10) + 'T12:00:00');
}

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function getMonday(ds) {
  const d   = new Date(ds + 'T12:00:00');
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().slice(0, 10);
}

export function getWeekDays(weekStart) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart + 'T12:00:00');
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

export function fmtWeekRange(ws) {
  const s = parseD(ws);
  const e = new Date(ws + 'T12:00:00'); e.setDate(e.getDate() + 6);
  const opts = { day: 'numeric', month: 'short' };
  return `${s.toLocaleDateString('en-IN', opts)} – ${e.toLocaleDateString('en-IN', { ...opts, year: 'numeric' })}`;
}

const PERSON_COLORS = identityPalette(['gold', 'violet', 'teal', 'rose', 'blue', 'orange']);
export const colorFor = (person) => {
  if (!person) return PERSON_COLORS[0];
  let hash = 0;
  for (let i = 0; i < person.length; i++) hash = person.charCodeAt(i) + ((hash << 5) - hash);
  return PERSON_COLORS[Math.abs(hash) % PERSON_COLORS.length];
};

/* Eleven buckets, eleven distinct hues. The old literals leaned on shades of
   the same hue to fill the list — equity_indian #f97316 next to equity_intl
   #fb923c, debt_pf #34d399 next to debt_mf #6ee7b7 — which are hard to tell
   apart in a pie at any size and became indistinguishable once both were
   darkened for the light theme. Each bucket now gets its own hue. */
export const ASSET_COLORS = identityPalette({
  cash:             'blue',
  gold_silver:      'amber',
  debt_pf:          'emerald',
  debt_ppf:         'teal',
  debt_mf:          'green',
  equity_indian:    'orange',
  equity_intl:      'gold',
  equity_nps:       'purple',
  equity_trading:   'pink',
  equity_smallcase: 'violet',
  real_estate:      'slate',
});

/* Transaction-type colours. These match the `.tag-*` classes in index.css and
   Cashflow's copy of this map — the three used to disagree, so the same
   "Income" row was teal in one chart, light green in another and emerald as a
   tag on the same screen. */
export const TYPE_COLORS = identityPalette({
  Income:          'emerald',
  'Other Income':  'green',
  Major:           'rose',
  'Non-Recurring': 'amber',
  Regular:         'slate',
  EMI:             'violet',
  Trips:           'teal',
});
