export const fmt = (n) => {
  if (n === null || n === undefined) return '—';
  const num = Number(n);
  if (isNaN(num)) return '—';
  if (Math.abs(num) >= 10000000) return `₹${(num / 10000000).toFixed(2)}Cr`;
  if (Math.abs(num) >= 100000) return `₹${(num / 100000).toFixed(2)}L`;
  if (Math.abs(num) >= 1000) return `₹${(num / 1000).toFixed(1)}K`;
  return `₹${num.toLocaleString('en-IN')}`;
};

export const fmtFull = (n) => {
  if (n === null || n === undefined) return '—';
  return `₹${Number(n).toLocaleString('en-IN')}`;
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

export const colorFor = (person) =>
  person === 'Harsh' ? '#f0c040' : '#a78bfa';

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
  Major: '#fb7185',
  'Non-Recurring': '#fbbf24',
  Trips: '#2dd4bf',
};
