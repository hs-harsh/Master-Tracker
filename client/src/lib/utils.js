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

export const fmtDate = (d) => {
  if (!d) return '—';
  const date = new Date(d);
  return date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};

export const fmtMonthKey = (d) => {
  if (!d) return '';
  return new Date(d).toISOString().slice(0, 7);
};

const PERSON_COLORS = ['#f0c040', '#a78bfa', '#2dd4bf', '#fb7185', '#60a5fa', '#f97316'];
export const colorFor = (person) => {
  if (!person) return PERSON_COLORS[0];
  let hash = 0;
  for (let i = 0; i < person.length; i++) hash = person.charCodeAt(i) + ((hash << 5) - hash);
  return PERSON_COLORS[Math.abs(hash) % PERSON_COLORS.length];
};

export const ASSET_COLORS = {
  cash: '#60a5fa',
  gold_silver: '#fbbf24',
  debt_pf: '#34d399',
  debt_ppf: '#2dd4bf',
  debt_mf: '#6ee7b7',
  equity_indian: '#f97316',
  equity_intl: '#fb923c',
  equity_nps: '#c084fc',
  equity_trading: '#f472b6',
  equity_smallcase: '#e879f9',
  real_estate: '#94a3b8',
};

export const TYPE_COLORS = {
  Income: '#4ade80',
  'Other Income': '#22c55e',
  Major: '#fb7185',
  'Non-Recurring': '#fbbf24',
  Regular: '#94a3b8',
  EMI: '#a78bfa',
  Trips: '#2dd4bf',
};
