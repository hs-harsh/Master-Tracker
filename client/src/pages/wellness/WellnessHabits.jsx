import { useState, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import {
  CheckSquare, Utensils, Dumbbell,
  ChevronLeft, ChevronRight,
  Star, Leaf, Activity, Trophy, X,
} from 'lucide-react';
import api from '../../lib/api';

// ─── nav ──────────────────────────────────────────────────────────────────────
const SUB_TABS = [
  { to: '/wellness/habits',   label: 'Habits',   icon: CheckSquare },
  { to: '/wellness/meals',    label: 'Meals',    icon: Utensils    },
  { to: '/wellness/workouts', label: 'Workouts', icon: Dumbbell    },
];

// ─── habit types ──────────────────────────────────────────────────────────────
const HABIT_TYPES = [
  { key: 'clean_food', label: 'Clean Food', icon: Leaf,      color: 'text-amber-400',  dot: 'bg-amber-400',  ring: 'bg-amber-400/10 border-amber-400/25'   },
  { key: 'walk',       label: 'Walk',       icon: Activity,  color: 'text-teal-400',   dot: 'bg-teal-400',   ring: 'bg-teal-400/10 border-teal-400/25'     },
  { key: 'gym',        label: 'Gym',        icon: Dumbbell,  color: 'text-blue-400',   dot: 'bg-blue-400',   ring: 'bg-blue-400/10 border-blue-400/25'     },
  { key: 'sports',     label: 'Sports',     icon: Trophy,    color: 'text-purple-400', dot: 'bg-purple-400', ring: 'bg-purple-400/10 border-purple-400/25' },
];

const PERIODS = ['1W', '1M', '3M', '6M', '1Y'];
const PERIOD_DAYS = { '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 365 };

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

function fmtMonthYear(date) {
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function firstDayOffset(year, month) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1; // Mon=0
}

// ─── component ────────────────────────────────────────────────────────────────
export default function WellnessHabits() {
  const [view,      setView]      = useState('planner');
  const [weekStart, setWeekStart] = useState(() => getMonday(todayStr()));
  const [entries,   setEntries]   = useState({}); // date -> {clean_food, walk, gym, sports}
  const [saving,    setSaving]    = useState({}); // date -> bool
  const [loading,   setLoading]   = useState(false);

  // calendar state
  const [calMonth,   setCalMonth]  = useState(new Date());
  const [calEntries, setCalEntries]= useState({}); // date -> entry
  const [calLoading, setCalLoading]= useState(false);
  const [selDate,    setSelDate]   = useState(null);

  // stats state
  const [period,  setPeriod]  = useState('1M');
  const [stats,   setStats]   = useState(null);

  // ── load week ──────────────────────────────────────────────────────────────
  const loadWeek = useCallback(async (ws) => {
    setLoading(true);
    try {
      const days = getWeekDays(ws);
      const from = days[0];
      const to   = days[6];
      const { data } = await api.get(`/habits?from=${from}&to=${to}`);
      const map = {};
      (data || []).forEach(e => {
        const ds = String(e.date).slice(0, 10);
        map[ds] = {
          clean_food: e.clean_food ?? null,
          walk:       e.walk       ?? null,
          gym:        e.gym        ?? null,
          sports:     e.sports     ?? null,
        };
      });
      setEntries(map);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadWeek(weekStart); }, [weekStart, loadWeek]);

  // ── load calendar ──────────────────────────────────────────────────────────
  const loadCalendar = useCallback(async (month) => {
    setCalLoading(true);
    try {
      const y = month.getFullYear(), m = month.getMonth();
      const from = `${y}-${String(m+1).padStart(2,'0')}-01`;
      const last = new Date(y, m+1, 0).getDate();
      const to   = `${y}-${String(m+1).padStart(2,'0')}-${String(last).padStart(2,'0')}`;
      const { data } = await api.get(`/habits?from=${from}&to=${to}`);
      const map = {};
      (data || []).forEach(e => { map[String(e.date).slice(0,10)] = e; });
      setCalEntries(map);
    } catch (err) {
      console.error(err);
    } finally {
      setCalLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === 'calendar') loadCalendar(calMonth);
  }, [view, calMonth, loadCalendar]);

  // ── load stats ─────────────────────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    try {
      const { data } = await api.get(`/habits/stats?period=${period}`);
      setStats(data);
    } catch (err) { setStats(null); }
  }, [period]);

  useEffect(() => {
    if (view === 'calendar') loadStats();
  }, [view, period, loadStats]);

  // ── set habit (auto-save) ──────────────────────────────────────────────────
  async function setHabit(date, habitKey, value) {
    const current = entries[date] || {};
    const newVal  = current[habitKey] === value ? null : value; // toggle off if same
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

  // ── week nav ───────────────────────────────────────────────────────────────
  function shiftWeek(dir) {
    const d = new Date(weekStart + 'T12:00:00');
    d.setDate(d.getDate() + dir * 7);
    setWeekStart(d.toISOString().slice(0, 10));
  }

  const today    = todayStr();
  const weekDays = getWeekDays(weekStart);

  // ── planner ────────────────────────────────────────────────────────────────
  function Planner() {
    return (
      <div className="card fade-up-1 overflow-hidden">
        {/* week header */}
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

        {/* grid */}
        <div className="overflow-x-auto">
          <div className="min-w-[680px]">
            {/* day-header row */}
            <div className="grid grid-cols-8 border-b border-white/5">
              <div className="p-3" />
              {weekDays.map(ds => {
                const h = fmtDayHeader(ds);
                const isT = ds === today;
                return (
                  <div key={ds}
                    className={`p-3 text-center border-l border-white/5 ${isT ? 'bg-accent/5' : ''}`}>
                    <p className={`text-xs font-mono uppercase ${isT ? 'text-accent' : 'text-muted'}`}>{h.wd}</p>
                    <p className={`text-xl font-bold font-display ${isT ? 'text-accent' : 'text-white'}`}>{h.day}</p>
                    <p className="text-xs text-muted font-mono">{h.mo}</p>
                  </div>
                );
              })}
            </div>

            {/* habit rows */}
            {HABIT_TYPES.map(ht => (
              <div key={ht.key} className="grid grid-cols-8 border-b border-white/5 last:border-0">
                {/* row label */}
                <div className={`flex items-center gap-2 p-3 border-r border-white/5 ${ht.ring.split(' ')[0]}`}>
                  <ht.icon size={14} className={ht.color} />
                  <span className={`text-xs font-semibold ${ht.color} hidden sm:block`}>{ht.label}</span>
                </div>

                {/* star cells */}
                {weekDays.map(ds => {
                  const val = entries[ds]?.[ht.key] ?? 0;
                  const isT = ds === today;
                  const isSav = saving[ds];
                  return (
                    <div key={ds}
                      className={`px-1 py-2 border-l border-white/5 min-h-[72px] flex flex-col justify-center
                        ${isT ? 'bg-accent/5' : ''}`}>
                      <div className="flex gap-px flex-wrap">
                        {[1,2,3,4,5].map(n => (
                          <button key={n}
                            onClick={() => setHabit(ds, ht.key, n)}
                            className="p-px transition-transform hover:scale-110 active:scale-95">
                            <Star size={11}
                              className={n <= val
                                ? `fill-current ${ht.color} ${isSav ? 'opacity-60' : ''}`
                                : 'text-white/15 hover:text-white/30 transition-colors'} />
                          </button>
                        ))}
                      </div>
                      {val > 0 && (
                        <p className={`text-[9px] font-mono mt-0.5 ${ht.color} opacity-70`}>{val}/5</p>
                      )}
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

  // ── calendar ───────────────────────────────────────────────────────────────
  function HabitCalendar() {
    const year   = calMonth.getFullYear();
    const month  = calMonth.getMonth();
    const dim    = new Date(year, month + 1, 0).getDate();
    const offset = firstDayOffset(year, month);
    const cells  = Math.ceil((offset + dim) / 7) * 7;

    return (
      <>
        {/* stats */}
        <div className="card fade-up-1 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted uppercase tracking-widest font-mono">Habits overview</p>
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
          </div>
          {stats ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl bg-surface/50 px-4 py-3">
                <p className="text-[10px] text-muted uppercase tracking-wider">Overall avg</p>
                <p className="font-mono text-xl font-bold text-white">
                  {stats.stats.avgOverall != null ? `${stats.stats.avgOverall}/5` : '—'}
                </p>
              </div>
              <div className="rounded-xl bg-surface/50 px-4 py-3">
                <p className="text-[10px] text-muted uppercase tracking-wider">Days logged</p>
                <p className="font-mono text-xl font-bold text-white">{stats.stats.daysLogged}</p>
              </div>
              {HABIT_TYPES.map(ht => {
                const key = `avg${ht.key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()).replace(/^./, s => s.toUpperCase())}`;
                const statKey = { clean_food: 'avgCleanFood', walk: 'avgWalk', gym: 'avgGym', sports: 'avgSports' }[ht.key];
                const val = stats.stats[statKey];
                return (
                  <div key={ht.key} className={`rounded-xl px-4 py-3 border ${ht.ring}`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <ht.icon size={11} className={ht.color} />
                      <p className={`text-[10px] uppercase tracking-wider ${ht.color}`}>{ht.label}</p>
                    </div>
                    <p className={`font-mono text-lg font-bold ${ht.color}`}>
                      {val != null ? `${val}/5` : '—'}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted text-sm">No habit data yet. Log habits in the planner.</p>
          )}
        </div>

        {/* monthly calendar */}
        <div className="card fade-up-1">
          <div className="flex items-center justify-between p-4 border-b border-white/5">
            <button
              onClick={() => setCalMonth(d => new Date(d.getFullYear(), d.getMonth()-1, 1))}
              className="p-1.5 rounded-lg hover:bg-white/5 text-soft hover:text-white transition-colors">
              <ChevronLeft size={18} />
            </button>
            <h3 className="font-display text-sm font-bold text-white">{fmtMonthYear(calMonth)}</h3>
            <button
              onClick={() => setCalMonth(d => new Date(d.getFullYear(), d.getMonth()+1, 1))}
              className="p-1.5 rounded-lg hover:bg-white/5 text-soft hover:text-white transition-colors">
              <ChevronRight size={18} />
            </button>
          </div>

          {/* weekday headers */}
          <div className="grid grid-cols-7 border-b border-white/5">
            {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
              <div key={d} className="p-2 text-center text-xs font-mono text-muted uppercase">{d}</div>
            ))}
          </div>

          {/* day cells */}
          <div className="grid grid-cols-7">
            {Array.from({ length: cells }, (_, i) => {
              const dayNum = i - offset + 1;
              if (dayNum < 1 || dayNum > dim) {
                return <div key={i} className="border border-white/5 min-h-[80px]" />;
              }
              const ds      = `${year}-${String(month+1).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`;
              const entry   = calEntries[ds];
              const isT     = ds === today;
              const hasData = !!entry;
              const isSel   = selDate === ds;
              const loggedCount = entry
                ? [entry.clean_food, entry.walk, entry.gym, entry.sports].filter(v => v != null).length
                : 0;

              return (
                <div key={i} onClick={() => setSelDate(isSel ? null : ds)}
                  className={`border border-white/5 p-2 min-h-[80px] cursor-pointer transition-colors
                    ${isT ? 'ring-1 ring-inset ring-accent/40 bg-accent/5' : ''}
                    ${hasData && !isT ? 'bg-emerald-400/5' : ''}
                    ${isSel ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'}`}>
                  <p className={`text-xs font-bold mb-1.5 ${isT ? 'text-accent' : hasData ? 'text-emerald-400' : 'text-soft'}`}>
                    {dayNum}
                  </p>
                  {/* habit dots */}
                  <div className="flex flex-wrap gap-0.5 mb-1">
                    {HABIT_TYPES.map(ht => {
                      const val = entry?.[ht.key];
                      return val != null
                        ? <span key={ht.key} className={`w-1.5 h-1.5 rounded-full ${ht.dot}`} title={ht.label} />
                        : null;
                    })}
                  </div>
                  {/* logged count */}
                  {loggedCount > 0 && (
                    <p className="text-[10px] text-muted font-mono">{loggedCount}/4</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* selected-date detail panel */}
          {selDate && calEntries[selDate] && (
            <div className="border-t border-white/5 p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-display text-sm font-bold text-white">
                  {parseD(selDate)?.toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long' })}
                </h4>
                <button onClick={() => setSelDate(null)} className="text-muted hover:text-white transition-colors">
                  <X size={14} />
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {HABIT_TYPES.map(ht => {
                  const val = calEntries[selDate]?.[ht.key];
                  return (
                    <div key={ht.key} className={`rounded-xl p-3 border ${ht.ring}`}>
                      <div className="flex items-center gap-1.5 mb-2">
                        <ht.icon size={12} className={ht.color} />
                        <span className={`text-xs font-semibold ${ht.color}`}>{ht.label}</span>
                      </div>
                      {val != null ? (
                        <>
                          <div className="flex gap-0.5">
                            {[1,2,3,4,5].map(n => (
                              <Star key={n} size={12}
                                className={n <= val ? `fill-current ${ht.color}` : 'text-white/15'} />
                            ))}
                          </div>
                          <p className={`text-xs font-mono mt-1 ${ht.color}`}>{val}/5</p>
                        </>
                      ) : (
                        <p className="text-muted text-xs">—</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* empty state */}
          {!calLoading && Object.keys(calEntries).length === 0 && (
            <div className="p-8 text-center text-muted text-sm">
              No habits logged this month.<br />
              <span className="text-xs">Use <strong className="text-white">Plan Week</strong> to log your habits.</span>
            </div>
          )}
        </div>
      </>
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
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">Habits</h1>
          <p className="text-muted text-xs mt-1 uppercase tracking-widest font-mono">Weekly habit tracker & calendar</p>
        </div>
        <div className="flex gap-1 p-1 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {[{ key: 'planner', label: 'Plan Week' }, { key: 'calendar', label: 'Calendar' }].map(({ key, label }) => (
            <button key={key} onClick={() => setView(key)}
              className={`px-4 py-2 rounded-lg text-sm font-body transition-all ${
                view === key ? 'bg-accent text-ink font-semibold' : 'text-soft hover:text-white'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* loading */}
      {(loading || calLoading) && (
        <div className="text-center py-10 text-muted text-sm fade-up-1">Loading…</div>
      )}

      {/* content */}
      {!loading    && view === 'planner'  && <Planner />}
      {!calLoading && view === 'calendar' && <HabitCalendar />}
    </div>
  );
}
