import { useState, useEffect, useCallback, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import {
  CheckSquare, Utensils, Dumbbell,
  ChevronLeft, ChevronRight,
  Star, Leaf, Activity, Trophy, AlertTriangle, TrendingUp,
  Settings, Plus, X, Heart, Zap, Moon, Coffee, Book, Music, Apple, Droplets, Sun,
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

// ─── icon map ─────────────────────────────────────────────────────────────────
const ICON_MAP = {
  Leaf, Activity, Dumbbell, Trophy, Heart, Zap, Moon, Coffee, Book, Music, Apple, Droplets, Sun,
};

const PRESET_ICONS = ['Leaf', 'Activity', 'Dumbbell', 'Trophy', 'Heart', 'Zap', 'Moon', 'Coffee', 'Book', 'Music', 'Apple', 'Droplets', 'Sun'];

// ─── color palette rotation ───────────────────────────────────────────────────
const COLOR_PALETTE = [
  { color: 'text-amber-400',   dot: 'bg-amber-400',   ring: 'bg-amber-400/10 border-amber-400/25',   stroke: '#fbbf24' },
  { color: 'text-teal-400',    dot: 'bg-teal-400',    ring: 'bg-teal-400/10 border-teal-400/25',     stroke: '#2dd4bf' },
  { color: 'text-blue-400',    dot: 'bg-blue-400',    ring: 'bg-blue-400/10 border-blue-400/25',     stroke: '#60a5fa' },
  { color: 'text-purple-400',  dot: 'bg-purple-400',  ring: 'bg-purple-400/10 border-purple-400/25', stroke: '#c084fc' },
  { color: 'text-pink-400',    dot: 'bg-pink-400',    ring: 'bg-pink-400/10 border-pink-400/25',     stroke: '#f472b6' },
  { color: 'text-orange-400',  dot: 'bg-orange-400',  ring: 'bg-orange-400/10 border-orange-400/25', stroke: '#fb923c' },
  { color: 'text-green-400',   dot: 'bg-green-400',   ring: 'bg-green-400/10 border-green-400/25',   stroke: '#4ade80' },
  { color: 'text-red-400',     dot: 'bg-red-400',     ring: 'bg-red-400/10 border-red-400/25',       stroke: '#f87171' },
];

const DEFAULT_HABITS = [
  { key: 'clean_food', label: 'Clean Food', icon: 'Leaf',     ...COLOR_PALETTE[0] },
  { key: 'walk',       label: 'Walk',       icon: 'Activity', ...COLOR_PALETTE[1] },
  { key: 'gym',        label: 'Gym',        icon: 'Dumbbell', ...COLOR_PALETTE[2] },
  { key: 'sports',     label: 'Sports',     icon: 'Trophy',   ...COLOR_PALETTE[3] },
];
const DEFAULT_DAILY_TARGET = 10;

const PERIODS = ['1M', '3M', '1Y', 'Max'];
const PERIOD_MAP = { '1M': '1M', '3M': '3M', '1Y': '1Y', 'Max': '1Y' };

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

function generateKey(label) {
  return label.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') + '_' + Date.now();
}

// ─── component ────────────────────────────────────────────────────────────────
export default function WellnessHabits() {
  const { personName, activePerson } = useAuth();
  const currentPerson = activePerson || personName;

  const [view,      setViewRaw]   = useState(() => localStorage.getItem('wellness_habits_view') || 'planner');
  const setView = (v) => { setViewRaw(v); localStorage.setItem('wellness_habits_view', v); };
  const [weekStart, setWeekStart] = useState(() => getMonday(todayStr()));
  const [entries,   setEntries]   = useState({});
  const [saving,    setSaving]    = useState({});
  const [loading,   setLoading]   = useState(false);

  // habit config state
  const [habitTypes,    setHabitTypes]    = useState(DEFAULT_HABITS);
  const [dailyTarget,   setDailyTarget]   = useState(DEFAULT_DAILY_TARGET);
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving,  setConfigSaving]  = useState(false);

  // manage habits modal
  const [showManage,   setShowManage]   = useState(false);
  const [newHabitName, setNewHabitName] = useState('');
  const [newHabitIcon, setNewHabitIcon] = useState('Heart');
  const [targetInput,  setTargetInput]  = useState(String(DEFAULT_DAILY_TARGET));

  // analytics state
  const [period,  setPeriod]  = useState('1M');
  const [stats,   setStats]   = useState(null);
  const [aLoading,setALoading]= useState(false);

  // ── load habit config ───────────────────────────────────────────────────────
  const loadConfig = useCallback(async (person) => {
    setConfigLoading(true);
    try {
      const { data } = await api.get(`/habits/config?person=${encodeURIComponent(person || '')}`);
      const habits = (data.habits || DEFAULT_HABITS).map((h, i) => ({
        ...COLOR_PALETTE[i % COLOR_PALETTE.length],
        ...h,
      }));
      setHabitTypes(habits);
      setDailyTarget(data.daily_target ?? DEFAULT_DAILY_TARGET);
      setTargetInput(String(data.daily_target ?? DEFAULT_DAILY_TARGET));
    } catch {
      setHabitTypes(DEFAULT_HABITS);
      setDailyTarget(DEFAULT_DAILY_TARGET);
    } finally {
      setConfigLoading(false);
    }
  }, []);

  useEffect(() => { loadConfig(currentPerson); }, [currentPerson, loadConfig]);

  // ── load week ──────────────────────────────────────────────────────────────
  const loadWeek = useCallback(async (ws, person) => {
    setLoading(true);
    try {
      const days = getWeekDays(ws);
      const { data } = await api.get(`/habits?from=${days[0]}&to=${days[6]}&person=${encodeURIComponent(person || '')}`);
      const map = {};
      (data || []).forEach(e => {
        map[String(e.date).slice(0, 10)] = e.scores || {};
      });
      setEntries(map);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadWeek(weekStart, currentPerson); }, [weekStart, currentPerson, loadWeek]);

  // ── load analytics ─────────────────────────────────────────────────────────
  const loadStats = useCallback(async (p, person) => {
    setALoading(true);
    try {
      const apiPeriod = PERIOD_MAP[p] || '1Y';
      const { data } = await api.get(`/habits/stats?period=${apiPeriod}&person=${encodeURIComponent(person || '')}`);
      setStats(data);
    } catch {
      setStats(null);
    } finally {
      setALoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === 'analytics') loadStats(period, currentPerson);
  }, [view, period, currentPerson, loadStats]);

  // ── scroll today to leftmost visible column ────────────────────────────────
  const scrollRef = useRef(null);
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const todayEl = container.querySelector('[data-today-col="true"]');
    if (!todayEl) return;
    const labelCol = container.querySelector('[data-label-col="true"]');
    const labelWidth = labelCol ? labelCol.offsetWidth : 0;
    const containerLeft = container.getBoundingClientRect().left;
    const todayLeft = todayEl.getBoundingClientRect().left;
    const currentScroll = container.scrollLeft;
    container.scrollLeft = currentScroll + (todayLeft - containerLeft) - labelWidth;
  }, [weekStart, loading]);

  // ── set habit ──────────────────────────────────────────────────────────────
  async function setHabit(date, habitKey, value) {
    const current = entries[date] || {};
    const newVal  = current[habitKey] === value ? null : value;
    const next    = { ...current, [habitKey]: newVal };
    setEntries(e => ({ ...e, [date]: next }));
    setSaving(s => ({ ...s, [date]: true }));
    try {
      await api.put('/habits', { date, scores: next, person: currentPerson || '' });
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

  // ── manage habits ──────────────────────────────────────────────────────────
  function openManage() {
    setTargetInput(String(dailyTarget));
    setNewHabitName('');
    setNewHabitIcon('Heart');
    setShowManage(true);
  }

  function addHabit() {
    const label = newHabitName.trim();
    if (!label) return;
    const idx    = habitTypes.length;
    const colors = COLOR_PALETTE[idx % COLOR_PALETTE.length];
    const key    = generateKey(label);
    setHabitTypes(prev => [...prev, { key, label, icon: newHabitIcon, ...colors }]);
    setNewHabitName('');
    setNewHabitIcon('Heart');
  }

  function deleteHabit(key) {
    setHabitTypes(prev => prev.filter(h => h.key !== key));
  }

  async function saveConfig() {
    const target = Math.max(1, Math.min(habitTypes.length * 5, parseInt(targetInput, 10) || DEFAULT_DAILY_TARGET));
    setConfigSaving(true);
    try {
      await api.put('/habits/config', {
        person:       currentPerson || '',
        habits:       habitTypes.map(({ key, label, icon, color, dot, ring, stroke }) => ({ key, label, icon, color, dot, ring, stroke })),
        daily_target: target,
      });
      setDailyTarget(target);
      setTargetInput(String(target));
      setShowManage(false);
    } catch (err) {
      console.error(err);
    } finally {
      setConfigSaving(false);
    }
  }

  const today    = todayStr();
  const weekDays = getWeekDays(weekStart);
  const maxTarget = habitTypes.length * 5;

  // ── build alerts ──────────────────────────────────────────────────────────
  function buildAlerts(statsData) {
    if (!statsData?.chartData?.length) return [];
    const alerts = [];
    const cd     = statsData.chartData;
    const last7  = cd.slice(-7);
    const ht     = statsData.habits || habitTypes;

    ht.forEach(h => {
      const vals = last7.map(d => d[h.key]).filter(v => v != null && v > 0);
      if (vals.length === 0) {
        alerts.push({ type: 'warn', msg: `${h.label} not logged in the last 7 days` });
      } else {
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        if (avg < 2) alerts.push({ type: 'warn', msg: `${h.label} average is very low (${avg.toFixed(1)}/5) this week` });
      }
    });

    const recentScores = last7.map(d => {
      const vals = ht.map(h => d[h.key]).filter(v => v != null && v > 0);
      return vals.reduce((a, b) => a + b, 0);
    });
    const avgScore = recentScores.reduce((a, b) => a + b, 0) / (recentScores.length || 1);
    if (avgScore < dailyTarget) {
      alerts.push({ type: 'warn', msg: `7-day avg daily score is ${avgScore.toFixed(1)}/${maxTarget} — below the ${dailyTarget} target` });
    } else {
      alerts.push({ type: 'good', msg: `On track! Avg daily score ${avgScore.toFixed(1)}/${maxTarget} this week` });
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

  // ── manage habits modal ────────────────────────────────────────────────────
  function ManageModal() {
    if (!showManage) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(9,9,14,0.80)', backdropFilter: 'blur(6px)' }}>
        <div className="card w-full max-w-md p-5 space-y-5 overflow-y-auto max-h-[90vh]">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold font-display text-lg">Manage Habits</h2>
            <button onClick={() => setShowManage(false)} className="text-muted hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>

          {/* Current habits list */}
          <div>
            <p className="text-xs text-muted uppercase tracking-widest font-mono mb-2">Current Habits</p>
            <div className="space-y-2">
              {habitTypes.map((ht, idx) => {
                const Icon = ICON_MAP[ht.icon] || Leaf;
                return (
                  <div key={ht.key} className="flex items-center gap-3 px-3 py-2 rounded-xl border border-white/8 bg-white/[0.02]">
                    <Icon size={14} className={ht.color} />
                    <span className={`text-sm flex-1 ${ht.color}`}>{ht.label}</span>
                    <button
                      onClick={() => deleteHabit(ht.key)}
                      className="text-muted/60 hover:text-red-400 transition-colors p-1">
                      <X size={13} />
                    </button>
                  </div>
                );
              })}
              {habitTypes.length === 0 && (
                <p className="text-xs text-muted/60 text-center py-4">No habits — add one below</p>
              )}
            </div>
          </div>

          {/* Add new habit */}
          <div>
            <p className="text-xs text-muted uppercase tracking-widest font-mono mb-2">Add Habit</p>
            <div className="space-y-2">
              <input
                className="input w-full text-sm"
                placeholder="Habit name (e.g. Meditation)"
                value={newHabitName}
                onChange={e => setNewHabitName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addHabit()}
              />
              <div className="flex flex-wrap gap-2">
                {PRESET_ICONS.map(iconName => {
                  const Icon = ICON_MAP[iconName];
                  return (
                    <button key={iconName} onClick={() => setNewHabitIcon(iconName)}
                      className={`p-2 rounded-lg border transition-all ${
                        newHabitIcon === iconName
                          ? 'border-accent/50 bg-accent/10 text-accent'
                          : 'border-white/10 text-muted hover:text-white hover:border-white/20'
                      }`}>
                      <Icon size={14} />
                    </button>
                  );
                })}
              </div>
              <button onClick={addHabit} disabled={!newHabitName.trim()}
                className="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-40">
                <Plus size={13} /> Add Habit
              </button>
            </div>
          </div>

          {/* Daily target */}
          <div>
            <p className="text-xs text-muted uppercase tracking-widest font-mono mb-2">
              Daily Target (max: {habitTypes.length * 5})
            </p>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="1"
                max={habitTypes.length * 5 || 1}
                className="input w-24 text-sm font-mono"
                value={targetInput}
                onChange={e => setTargetInput(e.target.value)}
              />
              <span className="text-xs text-muted">out of {habitTypes.length * 5} max</span>
            </div>
          </div>

          {/* Save */}
          <div className="flex gap-3 pt-1">
            <button onClick={() => setShowManage(false)}
              className="btn-ghost flex-1 text-sm py-2">Cancel</button>
            <button onClick={saveConfig} disabled={configSaving}
              className="btn-primary flex-1 text-sm py-2 disabled:opacity-50">
              {configSaving ? 'Saving…' : 'Save Config'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── planner ────────────────────────────────────────────────────────────────
  function Planner() {
    const currentWeekStart = getMonday(today);
    const isCurrentWeek = weekStart === currentWeekStart;
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
            {!isCurrentWeek && (
              <button onClick={() => setWeekStart(currentWeekStart)}
                className="px-2.5 py-1 rounded-lg text-xs font-mono bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-colors">
                Today
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-muted font-mono">Click stars to log — auto-saved</p>
              <p className="text-[10px] text-muted/50 font-mono">1 = low effort · 5 = excellent</p>
            </div>
            <button onClick={openManage}
              title="Manage habits"
              className="p-1.5 rounded-lg border border-white/10 text-muted hover:text-white hover:border-white/25 transition-colors">
              <Settings size={15} />
            </button>
          </div>
        </div>

        {configLoading ? (
          <div className="p-8 text-center text-muted text-sm">Loading habit config…</div>
        ) : habitTypes.length === 0 ? (
          <div className="p-8 text-center text-muted text-sm">
            No habits configured. <button onClick={openManage} className="text-accent underline ml-1">Add habits →</button>
          </div>
        ) : (
          <div className="overflow-x-auto" ref={scrollRef}>
            <div className="min-w-[680px]">
              <div className="grid border-b border-white/5" style={{ gridTemplateColumns: `minmax(100px,140px) repeat(7, 1fr)` }}>
                <div className="p-3" data-label-col="true"
                  style={{ position: 'sticky', left: 0, zIndex: 2, background: 'var(--surface, #1a1a1a)' }} />
                {weekDays.map(ds => {
                  const h = fmtDayHeader(ds);
                  const isT = ds === today;
                  return (
                    <div key={ds} data-today-col={isT ? 'true' : undefined} className={`p-3 text-center border-l border-white/5 ${isT ? 'bg-accent/5' : ''}`}>
                      <p className={`text-xs font-mono uppercase ${isT ? 'text-accent' : 'text-muted'}`}>{h.wd}</p>
                      <p className={`text-xl font-bold font-display ${isT ? 'text-accent' : 'text-white'}`}>{h.day}</p>
                      <p className="text-xs text-muted font-mono">{h.mo}</p>
                    </div>
                  );
                })}
              </div>

              {habitTypes.map(ht => {
                const Icon = ICON_MAP[ht.icon] || Leaf;
                return (
                  <div key={ht.key} className="grid border-b border-white/5 last:border-0"
                    style={{ gridTemplateColumns: `minmax(100px,140px) repeat(7, 1fr)` }}>
                    <div className={`flex items-center gap-2 p-3 border-r border-white/5 ${ht.ring.split(' ')[0]}`}
                      style={{ position: 'sticky', left: 0, zIndex: 2, background: 'var(--surface, #1a1a1a)' }}>
                      <Icon size={14} className={ht.color} />
                      <span className={`text-xs font-semibold ${ht.color} truncate max-w-[80px]`}>{ht.label}</span>
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
                                className="p-1 transition-transform hover:scale-110 active:scale-95">
                                <Star size={12} className={n <= val
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
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── analytics ──────────────────────────────────────────────────────────────
  function Analytics() {
    if (aLoading) return (
      <div className="space-y-3 fade-up-1">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[...Array(6)].map((_, i) => <div key={i} className="card h-20 animate-pulse bg-white/[0.03]" />)}
        </div>
        {[...Array(2)].map((_, i) => <div key={i} className="card h-56 animate-pulse bg-white/[0.03]" />)}
      </div>
    );
    if (!stats?.chartData?.length) return (
      <div className="card p-8 text-center fade-up-1">
        <p className="text-muted text-sm">No habit data yet for this period. Start logging habits in the planner.</p>
        <button onClick={() => setView('planner')}
          className="mt-4 text-xs text-accent underline hover:text-accent/80 transition-colors">
          Go to Planner →
        </button>
      </div>
    );

    const alerts = buildAlerts(stats);
    const ht     = stats.habits || habitTypes;

    // Chart data: per habit values + daily score
    const chartData = stats.chartData.map(d => {
      const entry = { date: fmtChartDate(d.date) };
      ht.forEach(h => { entry[h.label] = d[h.key]; });
      entry.Score = ht.map(h => d[h.key]).filter(v => v != null && v > 0).reduce((a, b) => a + b, 0) || null;
      return entry;
    });

    const s           = stats.stats;
    const habitsAvg   = s.habitsAvg || {};
    const healthPct   = s.avgOverall != null ? Math.round((s.avgOverall / 5) * 100) : null;
    const statMaxScore= ht.length * 5;

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
          {ht.slice(0, 4).map(h => {
            const Icon = ICON_MAP[h.icon] || Leaf;
            const val  = habitsAvg[h.key];
            return (
              <div key={h.key} className={`card px-4 py-3 border ${h.ring}`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon size={11} className={h.color} />
                  <p className={`text-[10px] uppercase tracking-wider ${h.color} truncate`}>{h.label}</p>
                </div>
                <p className={`font-mono text-xl font-bold ${h.color}`}>{val != null ? `${val}/5` : '—'}</p>
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
              {ht.map(h => (
                <Line key={h.key} type="monotone" dataKey={h.label}
                  stroke={h.stroke} strokeWidth={1.5} dot={false} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* line chart — daily total score vs target */}
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={14} className="text-accent" />
            <p className="text-xs text-muted uppercase tracking-widest font-mono">Daily total score vs target ({dailyTarget}/{statMaxScore})</p>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} interval="preserveStartEnd" />
              <YAxis domain={[0, statMaxScore]} tick={{ fontSize: 10, fill: '#6b7280' }} />
              <Tooltip content={<HabitTooltip />} />
              <ReferenceLine y={dailyTarget} stroke="#f59e0b" strokeDasharray="4 4"
                label={{ value: `Target ${dailyTarget}`, position: 'right', fontSize: 10, fill: '#f59e0b' }} />
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
      <ManageModal />

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

      {loading && view === 'planner' && (
        <div className="card fade-up-1 overflow-hidden animate-pulse">
          <div className="grid grid-cols-8 gap-0">
            {[...Array(8)].map((_, i) => (
              <div key={i} className={`h-20 ${i === 0 ? '' : 'border-l border-white/5'} bg-white/[0.03]`} />
            ))}
          </div>
          {[...Array(4)].map((_, r) => (
            <div key={r} className="grid grid-cols-8 border-t border-white/5">
              {[...Array(8)].map((_, i) => (
                <div key={i} className={`h-[72px] ${i === 0 ? '' : 'border-l border-white/5'} bg-white/[0.02]`} />
              ))}
            </div>
          ))}
        </div>
      )}

      {!loading && view === 'planner'  && Planner()}
      {           view === 'analytics' && Analytics()}
    </div>
  );
}
