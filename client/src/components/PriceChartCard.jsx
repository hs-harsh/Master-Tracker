import { useCallback, useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Loader2 } from 'lucide-react';
import api from '../lib/api';

const RANGES = [
  { key: '1m',  label: '1M' },
  { key: '6m',  label: '6M' },
  { key: 'ytd', label: 'YTD' },
  { key: '1y',  label: '1Y' },
  { key: '5y',  label: '5Y' },
];

function formatDateLabel(dateStr, range) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (range === '5y' || range === '1y') {
    return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
  }
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function toNum(x) {
  const n = Number(x);
  return typeof x === 'number' && !isNaN(x) ? x : !isNaN(n) ? n : null;
}

export default function PriceChartCard({
  instrumentId,
  fallbackCloses = [],
  supportLevels = [],
  resistanceLevels = [],
  buyLevels = [],
  title = 'Price chart',
}) {
  const [range, setRange] = useState('1m');
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchChart = useCallback(async (r) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/prices/${instrumentId}/chart?range=${r}`);
      const rows = res.data?.data || [];
      if (rows.length > 0) {
        setChartData(rows.map((row) => ({ date: row.date, close: row.close })));
      } else {
        // fallback to static closes from analysis
        setChartData(
          fallbackCloses
            .map((v, i) => ({ date: `s${i + 1}`, close: toNum(v) ?? 0 }))
            .filter((d) => d.close > 0)
        );
      }
    } catch (_) {
      // fallback
      setChartData(
        fallbackCloses
          .map((v, i) => ({ date: `s${i + 1}`, close: toNum(v) ?? 0 }))
          .filter((d) => d.close > 0)
      );
      if (fallbackCloses.length === 0) setError('Chart data unavailable');
    } finally {
      setLoading(false);
    }
  }, [instrumentId, fallbackCloses]);

  useEffect(() => {
    if (instrumentId) fetchChart(range);
  }, [range, instrumentId, fetchChart]);

  const handleRange = (r) => {
    setRange(r);
  };

  const isDateKey = chartData.length > 0 && chartData[0].date?.includes('-');

  const xFormatter = (val) => {
    if (!isDateKey) return val;
    return formatDateLabel(val, range);
  };

  const tickCount = range === '1m' ? 5 : range === '6m' ? 6 : range === 'ytd' ? 4 : range === '1y' ? 6 : 5;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="stat-label">{title}</p>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => handleRange(r.key)}
              className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors min-h-[28px] ${
                range === r.key
                  ? 'bg-accent text-ink'
                  : 'text-soft hover:text-white hover:bg-card border border-border'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="h-[200px] flex items-center justify-center">
          <Loader2 size={20} className="animate-spin text-muted" />
        </div>
      ) : error ? (
        <div className="h-[200px] flex items-center justify-center">
          <p className="text-muted text-xs">{error}</p>
        </div>
      ) : chartData.length > 0 ? (
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 12, right: 8, left: 4, bottom: 8 }}>
              <defs>
                <linearGradient id={`fill-live-${instrumentId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#2dd4bf" stopOpacity={0.06} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tick={{ fill: '#6b7280', fontSize: 10 }}
                tickFormatter={xFormatter}
                interval="preserveStartEnd"
                tickCount={tickCount}
                minTickGap={28}
              />
              <YAxis
                tick={{ fill: '#6b7280', fontSize: 10 }}
                tickFormatter={(v) => Number(v).toLocaleString('en-IN')}
                domain={['auto', 'auto']}
                width={62}
              />
              <Tooltip
                contentStyle={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  fontSize: 12,
                  color: '#0f172a',
                  padding: '10px 14px',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                }}
                labelStyle={{ color: '#0f172a', fontWeight: 600, marginBottom: 4 }}
                itemStyle={{ color: '#0f172a' }}
                formatter={(v) => [Number(v).toLocaleString('en-IN'), 'Close']}
                labelFormatter={(l) => isDateKey ? formatDateLabel(l, range) : `Session ${l}`}
              />
              {supportLevels.map((l, i) => (
                <ReferenceLine key={`s-${i}`} y={l} stroke="#10b981" strokeWidth={1.5} strokeDasharray="4 4" />
              ))}
              {resistanceLevels.map((l, i) => (
                <ReferenceLine key={`r-${i}`} y={l} stroke="#f97316" strokeWidth={1.5} strokeDasharray="4 4" />
              ))}
              {buyLevels.map((l, i) => (
                <ReferenceLine key={`b-${i}`} y={l} stroke="#f0c040" strokeWidth={1.5} />
              ))}
              <Area
                type="monotone"
                dataKey="close"
                stroke="#2dd4bf"
                strokeWidth={2}
                fill={`url(#fill-live-${instrumentId})`}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0, fill: '#2dd4bf' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      <div className="mt-2 flex gap-3 text-xs text-muted flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-green-400 inline-block rounded" />Support
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-orange-400 inline-block rounded" />Resistance
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-accent inline-block rounded" />Buy the dip
        </span>
        <span className="ml-auto">Source: Yahoo Finance</span>
      </div>
    </div>
  );
}
