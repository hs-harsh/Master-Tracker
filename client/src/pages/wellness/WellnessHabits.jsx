import { useState, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import {
  CheckSquare, Utensils, Dumbbell,
  ChevronLeft, ChevronRight,
  Star, Leaf, Activity, Trophy, AlertTriangle, TrendingUp,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend, CartesianGrid,
} from 'recharts';
import api from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';

// ─── nav ──────────────────────────────────────────────────────────────────────
const SUB_TABS = [
  { to: '/wellness/habits',   label: 'Habits',   icon: CheckSquare },
  { to: '/wellness/meals',    label: 'Meals',    icon: Utensils    },
  { to: '/wellness/workouts', label: 'Workouts', icon: Dumbbell    },
];

// ─── habit types ──────────────────────────────────────────────────────────────
const HABIT_TYPES = [
  { key: 'clean_food', label: 'Clean Food', icon: Leaf,      color: 'text-amber-400',  dot: 'bg-amber-400',  ring: 'bg-amber-400/10 border-amber-400/25',  stroke: '#fbbf24' },
  { key: 'walk',       label: 'Walk',       icon: Activity,  color: 'text-teal-400',   dot: 'bg-teal-400',   ring: 'bg-teal-400/10 border-teal-400/25',    stroke: '#2dd4bf' },
  { key: 'gym',        label: 'Gym',        icon: Dumbbell,  color: 'text-blue-400',   dot: 'bg-blue-400',   ring: 'bg-blue-400/10 border-blue-400/25',    stroke: '#60a5fa' },
  { key: 'sports',     label: 'Sports',     icon: Trophy,    color: 'text-purple-400', dot: 'bg-purple-400', ring: 'bg-purple-400/10 border-purple-400/25', stroke: '#c084fc' },
];

const PERIODS = ['1M', '3M', '1Y', 'ALL'];
const PERIOD_MAP = { '1M': '1M', '3M': '3M', '1Y': '1Y', 'ALL': '1Y' }; // ALL uses max period supported
const DAILY_TARGET = 10; // out of 20 max (4 habits × 5)

// ─── helpers ──────────────────────────────────────────────────────────────────
function parseD(d) {
  if (!d) return null;
  if (d instanceof Date) return d;
  return new Date(String(d).slice(0, 10) + 'T12:00:00');
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getMonday(ds) {
  const d   = new Date(ds + 'T12:00:00');
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().slice(0, 10);
}

function getWeekDays(weekStart) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart + 'T12:00:00');
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

function fmtWeekRange(ws) {
  const s = parseD(ws);
  const e = new Date(ws + 'T12:00:00'); e.setDate(e.getDate() + 6);
  const opts = { day: 'numeric', month: 'short' };
  return `${s.toLocaleDateString('en-IN', opts)} – ${e.toLocaleDateString('en-IN', { ...opts, year: 'numeric' })}`;
}

function fmtDayHeader(ds) {
  const d = parseD(ds);
  return {
    wd:  d.toLocaleDateString('en-IN', { weekday: 'short' }),
    day: d.getDate(),
    mo:  d.toLocaleDateString('en-IN', { month: 'short' }),
  };
}

function fmtChartDate(ds) {
  const d = parseD(ds);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// ─── component ────────────────────────────────────────────────────────────────
export default function WellnessHabits() {
  const { personName, activePerson } = useAuth();
  const currentPerson = activePerson || personName;

  const [view,      setView]      = useState('planner');
  const [weekStart, setWeekStart] = useState(() => getMonday(todayStr()));
  const [entries,   setEntries]   = useState({});
  const [saving,    setSaving]    = useState({});
  const [loading,   setLoading]   = useState(false);

  // analytics state
  const [period,  setPeriod]  = useState('1M');
  const [stats,   setStats]   = useState(null);
  const [aLoading,setALoading]= useState(false);

  // ── load week ──────────────────────────────────────────────────────────────
  const loadWeek = useCallback(async (ws) => {
    setLoading(true);
    try {
      const days = getWeekDays(ws);
      const { data } = await api.get(`/habits?from=${days[0]}&to=${days[6]}`);
      const map = {};
      (data || []).forEach(e => {
        const ds = String(e.date).slice(0, 10);
        map[ds] = { clean_food: e.clean_food ?? null, walk: e.walk ?? null, gym: e.gym ?? null, sports: e.sports ?? null };
      });
      setEntries(map);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadWeek(weekStart); }, [weekStart, loadWeek]);

  // ── load analytics ─────────────────────────────────────────────────────────
  const loadStats = useCallback(async (p) => {
    setALoading(true);
    try {
      const apiPeriod = PERIOD_MAP[p] || '1Y';
      const { data } = await api.get(`/habits/stats?period=${apiPeriod}`);
      setStats(data);
    } catch (err) {
      setStats(null);
    } finally {
      setALoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === 'analytics') loadStats(period);
  }, [view, period, loadStats]);

  // ── set habit ──────────────────────────────────────────────────────────────
  async function setHabit(date, habitKey, value) {
    const current = entries[date] || {};
    const newVal  = current[habitKey] === value ? null : value;
    const next    = { ...current, [habitKey]: newVal };
    setEntries(e => ({ ...e, [date]: next }));
    setSaving(s => ({ ...s, [date]: true }));
    try {
      await api.put('/habits', { date, ...next });
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(s => ({ ...s, [date]: false }));
    }
  }

  function shiftWeek(dir) {
    const d = new Date(weekStart + 'T12:00:00');
    d.setDate(d.getDate() + dir * 7);
    setWeekStart(d.toISOString().slice(0, 10));
  }

  const today    = todayStr();
  const weekDays = getWeekDays(weekStart);

  // ── build alerts from stats ────────────────────────────────────────────────
  function buildAlerts(statsData) {
    if (!statsData?.chartData?.length) return [];
    const alerts = [];
    const cd = statsData.chartData;
    const last7 = cd.slice(-7);

    // Per-habit: if avg in last 7 days is 0 or null → not active
    HABIT_TYPES.forEach(ht => {
      const vals = last7.map(d => d[ht.key]).filter(v => v != null && v > 0);
      if (vals.length === 0) {
        alerts.push({ type: 'warn', msg: `${ht.label} not logged in the last 7 days` });
      } else {
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        if (avg < 2) alerts.push({ type: 'warn', msg: `${ht.label} average is very low (${avg.toFixed(1)}/5) this week` });
      }
    });

    // Daily total score vs target
    const recentScores = last7.map(d => {
      const vals = HABIT_TYPES.map(ht => d[ht.key]).filter(v => v != null);
      return vals.reduce((a, b) => a + b, 0);
    });
    const avgScore = recentScores.reduce((a, b) => a + b, 0) / (recentScores.length || 1);
    if (avgScore < DAILY_TARGET) {
      alerts.push({ type: 'warn', msg: `7-day avg daily score is ${avgScore.toFixed(1)}/20 — below the ${DAILY_TARGET} target` });
    } else {
      alerts.push({ type: 'good', msg: `On track! Avg daily score ${avgScore.toFixed(1)}/20 this week` });
    }

    return alerts;
  }

  // ── custom tooltip ─────────────────────────────────────────────────────────
  function HabitTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    return (
      <div className="card p-3 text-xs space-y-1 min-w-[140px]">
        <p className="text-muted font-mono mb-1">{label}</p>
        {payload.map(p => (
          <div key={p.dataKey} className="flex justify-between gap-4">
            <span style={{ color: p.color }}>{p.name}</span>
            <span className="text-white font-mono">{p.value ?? '—'}</span>
          </div>
        ))}
      </div>
    );
  }

  // ── planner ────────────────────────────────────────────────────────────────
  function Planner() {
    return (
      <div className="card fade-up-1 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <button onClick={() => shiftWeek(-1)}
              className="p-1.5 rounded-lg hover:bg-white/5 text-soft hover:text-white transition-colors">
              <ChevronLeft size={18} />
            </button>
            <p className="text-white text-sm font-semibold font-body">{fmtWeekRange(weekStart)}</p>
            <button onClick={() => shiftWeek(1)}
              className="p-1.5 rounded-lg hover:bg-white/5 text-soft hover:text-white transition-colors">
              <ChevronRight size={18} />
            </button>
          </div>
          <p className="text-xs text-muted font-mono">Click stars to log — auto-saved</p>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[680px]">
            <div className="grid grid-cols-8 border-b border-white/5">
              <div className="p-3" />
              {weekDays.map(ds => {
                const h = fmtDayHeader(ds);
                const isT = ds === today;
                return (
                  <div key={ds} className={`p-3 text-center border-l border-white/5 ${isT ? 'bg-accent/5' : ''}`}>
                    <p className={`text-xs font-mono uppercase ${isT ? 'text-accent' : 'text-muted'}`}>{h.wd}</p>
                    <p className={`text-xl font-bold font-display ${isT ? 'text-accent' : 'text-white'}`}>{h.day}</p>
                    <p className="text-xs text-muted font-mono">{h.mo}</p>
                  </div>
                );
              })}
            </div>

            {HABIT_TYPES.map(ht => (
              <div key={ht.key} className="grid grid-cols-8 border-b border-white/5 last:border-0">
                <div className={`flex items-center gap-2 p-3 border-r border-white/5 ${ht.ring.split(' ')[0]}`}>
                  <ht.icon size={14} className={ht.color} />
                  <span className={`text-xs font-semibold ${ht.color} hidden sm:block`}>{ht.label}</span>
                </div>
                {weekDays.map(ds => {
                  const val  = entries[ds]?.[ht.key] ?? 0;
                  const isT  = ds === today;
                  const isSav= saving[ds];
                  return (
                    <div key={ds}
                      className={`px-1 py-2 border-l border-white/5 min-h-[72px] flex flex-col justify-center ${isT ? 'bg-accent/5' : ''}`}>
                      <div className="flex gap-px flex-wrap">
                        {[1,2,3,4,5].map(n => (
                          <button key={n} onClick={() => setHabit(ds, ht.key, n)}
                            className="p-px transition-transform hover:scale-110 active:scale-95">
                            <Star size={11} className={n <= val
                              ? `fill-current ${ht.color} ${isSav ? 'opacity-60' : ''}`
                              : 'text-white/15 hover:text-white/30 transition-colors'} />
                          </button>
                        ))}
                      </div>
                      {val > 0 && <p className={`text-[9px] font-mono mt-0.5 ${ht.color} opacity-70`}>{val}/5</p>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── analytics ──────────────────────────────────────────────────────────────
  function Analytics() {
    if (aLoading) return <div className="text-center py-10 text-muted text-sm">Loading analytics…</div>;
    if (!stats?.chartData?.length) return (
      <div className="card p-8 text-center text-muted text-sm fade-up-1">
        No habit data yet for this period. Start logging habits in the planner.
      </div>
    );

    const alerts = buildAlerts(stats);

    // Chart data: daily score (sum of all habits) + per habit
    const chartData = stats.chartData.map(d => ({
      date: fmtChartDate(d.date),
      Score: [d.clean_food, d.walk, d.gym, d.sports].filter(v => v != null).reduce((a, b) => a + b, 0),
      'Clean Food': d.clean_food,
      Walk: d.walk,
      Gym: d.gym,
      Sports: d.sports,
    }));

    const s = stats.stats;
    const healthPct = s.avgOverall != null ? Math.round((s.avgOverall / 5) * 100) : null;

    return (
      <div className="space-y-4 fade-up-1">
        {/* alerts */}
        {alerts.length > 0 && (
          <div className="space-y-2">
            {alerts.map((a, i) => (
              <div key={i} className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-sm ${
                a.type === 'good'
                  ? 'bg-emerald-400/5 border-emerald-400/20 text-emerald-300'
                  : 'bg-amber-400/5 border-amber-400/20 text-amber-300'
              }`}>
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                {a.msg}
              </div>
            ))}
          </div>
        )}

        {/* stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="card px-4 py-3 col-span-2 sm:col-span-1">
            <p className="text-[10px] text-muted uppercase tracking-wider">Health Score</p>
            <p className={`font-mono text-2xl font-bold ${healthPct >= 60 ? 'text-emerald-400' : healthPct >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
              {healthPct != null ? `${healthPct}%` : '—'}
            </p>
            <p className="text-[10px] text-muted mt-0.5">avg/5 × 100</p>
          </div>
          <div className="card px-4 py-3">
            <p className="text-[10px] text-muted uppercase tracking-wider">Days Logged</p>
            <p className="font-mono text-2xl font-bold text-white">{s.daysLogged}</p>
          </div>
          {HABIT_TYPES.map(ht => {
            const statKey = { clean_food: 'avgCleanFood', walk: 'avgWalk', gym: 'avgGym', sports: 'avgSports' }[ht.key];
            const val = s[statKey];
            return (
              <div key={ht.key} className={`card px-4 py-3 border ${ht.ring}`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <ht.icon size={11} className={ht.color} />
                  <p className={`text-[10px] uppercase tracking-wider ${ht.color}`}>{ht.label}</p>
                </div>
                <p className={`font-mono text-xl font-bold ${ht.color}`}>{val != null ? `${val}/5` : '—'}</p>
              </div>
            );
          })}
        </div>

        {/* line chart — per habit */}
        <div className="card p-4">
          <p className="text-xs text-muted uppercase tracking-widest font-mono mb-4">Habit scores over time</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} interval="preserveStartEnd" />
              <YAxis domain={[0, 5]} ticks={[0,1,2,3,4,5]} tick={{ fontSize: 10, fill: '#6b7280' }} />
              <Tooltip content={<HabitTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {HABIT_TYPES.map(ht => (
                <Line key={ht.key} type="monotone" dataKey={ht.label === 'Clean Food' ? 'Clean Food' : ht.label}
                  stroke={ht.stroke} strokeWidth={1.5} dot={false} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* line chart — daily total score vs target */}
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={14} className="text-accent" />
            <p className="text-xs text-muted uppercase tracking-widest font-mono">Daily total score vs target ({DAILY_TARGET}/20)</p>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} interval="preserveStartEnd" />
              <YAxis domain={[0, 20]} ticks={[0, 5, 10, 15, 20]} tick={{ fontSize: 10, fill: '#6b7280' }} />
              <Tooltip content={<HabitTooltip />} />
              <ReferenceLine y={DAILY_TARGET} stroke="#f59e0b" strokeDasharray="4 4"
                label={{ value: `Target ${DAILY_TARGET}`, position: 'right', fontSize: 10, fill: '#f59e0b' }} />
              <Line type="monotone" dataKey="Score" stroke="#a78bfa" strokeWidth={2} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* sub-tab bar */}
      <div className="flex gap-1 p-1 rounded-xl flex-wrap"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
        {SUB_TABS.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to}
            className={({ isActive }) =>
              `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-body transition-all ${
                isActive ? 'bg-accent text-ink font-semibold' : 'text-soft hover:text-white'
              }`}>
            {Icon && <Icon size={16} />}
            {label}
          </NavLink>
        ))}
      </div>

      {/* page header + view toggle */}
      <div className="flex flex-wrap items-start justify-between gap-3 fade-up">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">
            {currentPerson ? `${currentPerson}'s Habits` : 'Habits'}
          </h1>
          <p className="text-muted text-xs mt-1 uppercase tracking-widest font-mono">Weekly habit tracker & analytics</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {view === 'analytics' && (
            <div className="flex gap-1 rounded-lg overflow-hidden border border-white/8">
              {PERIODS.map(p => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    period === p ? 'bg-accent text-ink' : 'text-soft hover:text-white bg-surface/50'
                  }`}>
                  {p}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-1 p-1 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            {[{ key: 'planner', label: 'Plan Week' }, { key: 'analytics', label: 'Analytics' }].map(({ key, label }) => (
              <button key={key} onClick={() => setView(key)}
                className={`px-4 py-2 rounded-lg text-sm font-body transition-all ${
                  view === key ? 'bg-accent text-ink font-semibold' : 'text-soft hover:text-white'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && <div className="text-center py-10 text-muted text-sm fade-up-1">Loading…</div>}

      {!loading && view === 'planner'   && <Planner />}
      {           view === 'analytics'  && <Analytics />}
    </div>
  );
}
