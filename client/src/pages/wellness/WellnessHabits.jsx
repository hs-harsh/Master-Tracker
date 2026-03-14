import { useEffect, useState, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { CheckSquare, X, Star } from 'lucide-react';
import api from '../../lib/api';

const SUB_TABS = [
  { to: '/wellness/habits', label: 'Habits', icon: CheckSquare },
  { to: '/wellness/meals', label: 'Meals' },
  { to: '/wellness/workouts', label: 'Workouts' },
];

const PERIODS = ['1W', '1M', '3M', '6M', '1Y'];

const HABITS = [
  { key: 'clean_food', label: 'Clean food' },
  { key: 'walk', label: 'Walk' },
  { key: 'gym', label: 'Gym' },
  { key: 'sports', label: 'Sports' },
];

const TOOLTIP_STYLE = {
  background: '#0f1117',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  fontSize: 12,
  color: '#e2e8f0',
  boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
};

const HABIT_COLORS = { clean_food: '#f0c040', walk: '#2dd4bf', gym: '#60a5fa', sports: '#a78bfa' };

function parseDate(d) {
  if (!d) return null;
  if (d instanceof Date) return d;
  // Handles full ISO strings (2026-03-14T00:00:00.000Z) and plain YYYY-MM-DD
  return new Date(String(d).slice(0, 10) + 'T12:00:00');
}

function fmtDate(d) {
  const x = parseDate(d);
  if (!x || isNaN(x)) return '';
  return x.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtShort(d) {
  const x = parseDate(d);
  if (!x || isNaN(x)) return '';
  return x.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function Stars({ value, max = 5, size = 12 }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].slice(0, max).map(n => (
        <Star
          key={n}
          size={size}
          className={n <= (value || 0) ? 'fill-amber-400 text-amber-400' : 'text-muted/40'}
        />
      ))}
    </span>
  );
}

/* ── Date modal ───────────────────────────────────────────────────────────── */
function DateModal({ date, entry, onSave, onClose }) {
  const [form, setForm] = useState({
    clean_food: '',
    walk: '',
    gym: '',
    sports: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (entry) {
      setForm({
        clean_food: entry.clean_food ?? '',
        walk: entry.walk ?? '',
        gym: entry.gym ?? '',
        sports: entry.sports ?? '',
      });
    } else {
      setForm({ clean_food: '', walk: '', gym: '', sports: '' });
    }
  }, [entry, date]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/habits', {
        date,
        clean_food: form.clean_food ? Number(form.clean_food) : null,
        walk: form.walk ? Number(form.walk) : null,
        gym: form.gym ? Number(form.gym) : null,
        sports: form.sports ? Number(form.sports) : null,
      });
      onSave();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Escape' && onClose()}
    >
      <div className="card w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-bold text-white">{fmtDate(date)}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-muted hover:text-white rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {HABITS.map(({ key, label }) => (
            <div key={key}>
              <label className="label">{label}</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, [key]: f[key] === n ? '' : n }))}
                    className="p-1 rounded transition-colors hover:opacity-90"
                  >
                    <Star
                      size={28}
                      className={Number(form[key]) >= n ? 'fill-amber-400 text-amber-400' : 'text-muted/40'}
                    />
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={onClose} className="btn-ghost">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Calendar grid ───────────────────────────────────────────────────────── */
function CalendarGrid({ entries, onSelectDate }) {
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const today = todayStr();
  const entryMap = {};
  (entries || []).forEach(e => { entryMap[e.date] = e; });

  const start = new Date(viewMonth.year, viewMonth.month, 1);
  const end = new Date(viewMonth.year, viewMonth.month + 1, 0);
  const startPad = start.getDay();
  const daysInMonth = end.getDate();

  const days = [];
  for (let i = 0; i < startPad; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${viewMonth.year}-${String(viewMonth.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    days.push(date);
  }

  const prevMonth = () => {
    if (viewMonth.month === 0) setViewMonth({ year: viewMonth.year - 1, month: 11 });
    else setViewMonth({ year: viewMonth.year, month: viewMonth.month - 1 });
  };

  const nextMonth = () => {
    if (viewMonth.month === 11) setViewMonth({ year: viewMonth.year + 1, month: 0 });
    else setViewMonth({ year: viewMonth.year, month: viewMonth.month + 1 });
  };

  const monthLabel = new Date(viewMonth.year, viewMonth.month).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });

  const getCellStyle = (date) => {
    const hasEntry = !!entryMap[date];
    const isToday = date === today;
    const isPast = date < today;
    const isSkipped = isPast && !hasEntry;

    if (isToday && hasEntry) return 'ring-2 ring-blue-400 bg-emerald-500/40 text-white border-emerald-500/60';
    if (isToday) return 'ring-2 ring-blue-400 bg-blue-500/20 text-white border-blue-400/50';
    if (hasEntry) return 'bg-emerald-500/40 text-emerald-200 border-emerald-500/60';
    if (isSkipped) return 'bg-rose-500/35 text-rose-200 border-rose-500/50';
    return 'bg-surface/50 text-soft hover:bg-surface hover:text-white border border-transparent';
  };

  const getAvg = (entry) => {
    const arr = [entry.clean_food, entry.walk, entry.gym, entry.sports].filter(Boolean);
    return arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null;
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold text-white">Calendar</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={prevMonth}
            className="p-2 text-soft hover:text-white rounded-lg transition-colors"
          >
            ←
          </button>
          <span className="text-sm font-medium text-white min-w-[140px] text-center">
            {monthLabel}
          </span>
          <button
            type="button"
            onClick={nextMonth}
            className="p-2 text-soft hover:text-white rounded-lg transition-colors"
          >
            →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="text-[10px] text-muted font-medium py-1">
            {d}
          </div>
        ))}
        {days.map((date, i) => (
          <div key={i}>
            {date ? (
              <button
                type="button"
                onClick={() => onSelectDate(date)}
                className={`w-full aspect-square rounded-lg text-sm font-mono transition-all flex flex-col items-center justify-center gap-0.5 border ${getCellStyle(date)} hover:opacity-90`}
              >
                <span className="font-bold">{new Date(date + 'T12:00:00').getDate()}</span>
                {entryMap[date] && (() => {
                  const avg = getAvg(entryMap[date]);
                  const count = [entryMap[date].clean_food, entryMap[date].walk, entryMap[date].gym, entryMap[date].sports].filter(Boolean).length;
                  return (
                    <>
                      {avg != null && (
                        <span className="text-[11px] font-semibold leading-none">
                          ★ {avg.toFixed(1)}
                        </span>
                      )}
                      <span className="text-[9px] opacity-75 leading-none">{count}/4</span>
                    </>
                  );
                })()}
              </button>
            ) : (
              <div className="aspect-square" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────────────────────── */
export default function WellnessHabits() {
  const [period, setPeriod] = useState('1M');
  const [stats, setStats] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalDate, setModalDate] = useState(null);

  const loadStats = useCallback(async () => {
    try {
      const r = await api.get(`/habits/stats?period=${period}`);
      setStats(r.data);
    } catch (err) {
      setStats(null);
    }
  }, [period]);

  const loadEntries = useCallback(async () => {
    try {
      const from = new Date();
      from.setMonth(from.getMonth() - 6);
      const to = new Date();
      to.setMonth(to.getMonth() + 2);
      const r = await api.get(`/habits?from=${from.toISOString().slice(0, 10)}&to=${to.toISOString().slice(0, 10)}`);
      setEntries(r.data);
    } catch (err) {
      setEntries([]);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadStats(), loadEntries()]).finally(() => setLoading(false));
  }, [loadStats, loadEntries]);

  const refresh = useCallback(() => {
    loadStats();
    loadEntries();
  }, [loadStats, loadEntries]);

  const entryForDate = modalDate ? entries.find(e => e.date === modalDate) : null;

  if (loading && !stats) {
    return (
      <div className="p-4 sm:p-6 space-y-5">
        <div className="flex items-center justify-center py-12 text-muted">Loading…</div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Sub-tab bar */}
      <div
        className="flex gap-1 p-1 rounded-xl flex-wrap"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {SUB_TABS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-body transition-all ${
                isActive ? 'bg-accent text-ink font-semibold' : 'text-soft hover:text-white'
              }`
            }
          >
            {Icon && <Icon size={16} />}
            {label}
          </NavLink>
        ))}
      </div>

      {/* Page header */}
      <div className="fade-up">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">
          Habits
        </h1>
        <p className="text-muted text-xs mt-1 uppercase tracking-widest font-mono">
          Daily habits checklist
        </p>
      </div>

      {/* Stats dashboard */}
      <div className="card fade-up-1 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="stat-label mb-0">Habits overview</p>
          <div className="flex gap-1 rounded-lg overflow-hidden border border-border">
            {PERIODS.map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  period === p ? 'bg-accent text-ink' : 'text-soft hover:text-white bg-surface/50'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {stats && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl bg-surface/50 px-4 py-3">
                <p className="text-[10px] text-muted uppercase tracking-wider">Overall</p>
                <p className="font-mono text-xl font-bold text-white">
                  {stats.stats.avgOverall != null ? `${stats.stats.avgOverall}/5` : '—'}
                </p>
              </div>
              <div className="rounded-xl bg-surface/50 px-4 py-3">
                <p className="text-[10px] text-muted uppercase tracking-wider">Days logged</p>
                <p className="font-mono text-xl font-bold text-white">{stats.stats.daysLogged}</p>
              </div>
              <div className="rounded-xl bg-surface/50 px-4 py-3 sm:col-span-2">
                <p className="text-[10px] text-muted uppercase tracking-wider">Clean · Walk · Gym · Sports</p>
                <p className="font-mono text-sm font-medium text-soft flex items-center gap-2 mt-1">
                  {['avgCleanFood', 'avgWalk', 'avgGym', 'avgSports'].map((k, i) => (
                    <span key={k}>
                      {k.replace('avg', '')}: {stats.stats[k] != null ? stats.stats[k] : '—'}
                      {i < 3 && ' · '}
                    </span>
                  ))}
                </p>
              </div>
            </div>

            {stats.chartData.length > 0 && (
              <>
                <div>
                  <p className="stat-label mb-2">Overall rating trend</p>
                  <ResponsiveContainer width="100%" height={140}>
                    <LineChart data={stats.chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                      <XAxis dataKey="date" tick={{ fill: '#4b5563', fontSize: 10 }} tickFormatter={fmtShort} tickLine={false} axisLine={false} />
                      <YAxis domain={[0, 5]} tick={{ fill: '#4b5563', fontSize: 10 }} tickLine={false} axisLine={false} width={24} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: '#8b95a5' }} formatter={(v) => [v != null ? `${v}/5` : '—', 'Rating']} labelFormatter={fmtDate} />
                      <Line type="monotone" dataKey="overall" stroke="#f0c040" strokeWidth={2} dot={{ fill: '#f0c040', r: 3 }} connectNulls name="Overall" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div>
                  <p className="stat-label mb-2">Per-habit trend</p>
                  <ResponsiveContainer width="100%" height={140}>
                    <LineChart data={stats.chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                      <XAxis dataKey="date" tick={{ fill: '#4b5563', fontSize: 10 }} tickFormatter={fmtShort} tickLine={false} axisLine={false} />
                      <YAxis domain={[0, 5]} tick={{ fill: '#4b5563', fontSize: 10 }} tickLine={false} axisLine={false} width={24} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: '#8b95a5' }} formatter={(v, name) => [v != null ? `${v}/5` : '—', name?.replace('_', ' ') || '']} labelFormatter={fmtDate} />
                      <Line type="monotone" dataKey="clean_food" stroke={HABIT_COLORS.clean_food} strokeWidth={1.5} dot={false} connectNulls name="Clean food" />
                      <Line type="monotone" dataKey="walk" stroke={HABIT_COLORS.walk} strokeWidth={1.5} dot={false} connectNulls name="Walk" />
                      <Line type="monotone" dataKey="gym" stroke={HABIT_COLORS.gym} strokeWidth={1.5} dot={false} connectNulls name="Gym" />
                      <Line type="monotone" dataKey="sports" stroke={HABIT_COLORS.sports} strokeWidth={1.5} dot={false} connectNulls name="Sports" />
                      <Legend wrapperStyle={{ fontSize: 10 }} formatter={(v) => <span className="text-white text-xs">{v}</span>} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div>
                  <p className="stat-label mb-2">Daily completion (habits logged per day)</p>
                  <ResponsiveContainer width="100%" height={120}>
                    <BarChart data={stats.chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                      <XAxis dataKey="date" tick={{ fill: '#4b5563', fontSize: 10 }} tickFormatter={fmtShort} tickLine={false} axisLine={false} />
                      <YAxis domain={[0, 4]} tick={{ fill: '#4b5563', fontSize: 10 }} tickLine={false} axisLine={false} width={24} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: '#8b95a5' }} formatter={(v) => [v ?? 0, 'Habits']} labelFormatter={fmtDate} />
                      <Bar dataKey="count" fill="#2dd4bf" radius={[2, 2, 0, 0]} name="Habits" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </>
        )}

        {stats && stats.chartData.length === 0 && (
          <p className="text-muted text-sm">No habit data yet. Click a date in the calendar below to log.</p>
        )}
      </div>

      {/* Calendar */}
      <CalendarGrid entries={entries} onSelectDate={setModalDate} />

      {/* Date modal */}
      {modalDate && (
        <DateModal
          date={modalDate}
          entry={entryForDate}
          onSave={refresh}
          onClose={() => setModalDate(null)}
        />
      )}
    </div>
  );
}
