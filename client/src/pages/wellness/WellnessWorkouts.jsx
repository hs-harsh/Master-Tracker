import { useState, useEffect, useCallback, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import {
  CheckSquare, Utensils, Dumbbell,
  ChevronLeft, ChevronRight,
  Check, Save, Sparkles, AlertTriangle,
  RotateCcw, Flame, Target, TrendingUp,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import api from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';

// ─── nav ──────────────────────────────────────────────────────────────────────
const SUB_TABS = [
  { to: '/wellness/habits',   label: 'Habits',   icon: CheckSquare },
  { to: '/wellness/meals',    label: 'Meals',    icon: Utensils    },
  { to: '/wellness/workouts', label: 'Workouts', icon: Dumbbell    },
];

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const PERIODS = ['1M', '3M', '1Y'];

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

function dateRangeFor(period) {
  const to = todayStr();
  const d  = new Date(to + 'T12:00:00');
  const days = { '1M': 30, '3M': 90, '1Y': 365 }[period] || 30;
  d.setDate(d.getDate() - days);
  return { from: d.toISOString().slice(0, 10), to };
}

// Parse exercises from notes field (JSON array or plain text fallback)
function parseExercises(notes) {
  if (!notes) return [];
  try {
    const arr = JSON.parse(notes);
    if (Array.isArray(arr)) return arr;
  } catch {}
  return notes.split('\n').filter(Boolean).map(line => ({ name: line, sets: null, reps: null }));
}

function countSets(exercises) {
  return exercises.reduce((sum, ex) => sum + (Number(ex.sets) || 0), 0);
}

// ─── component ────────────────────────────────────────────────────────────────
export default function WellnessWorkouts() {
  const { personName, activePerson } = useAuth();
  const currentPerson = activePerson || personName;

  const [view,       setViewRaw]    = useState(() => localStorage.getItem('wellness_workouts_view') || 'planner');
  const setView = (v) => { setViewRaw(v); localStorage.setItem('wellness_workouts_view', v); };
  const [weekStart,  setWeekStart]  = useState(() => getMonday(todayStr()));
  const [plan,       setPlan]       = useState(null);
  const [gymDays,    setGymDays]    = useState(new Set());
  const [generated,  setGenerated]  = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [accepting,  setAccepting]  = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiError,    setAiError]    = useState('');
  const aiInputRef = useRef(null);

  const [period,    setPeriod]    = useState('1M');
  const [analytics, setAnalytics] = useState(null);
  const [aLoading,  setALoading]  = useState(false);

  const today    = todayStr();
  const weekDays = getWeekDays(weekStart);
  const isAccepted = plan?.status === 'accepted';

  // ── load week ──────────────────────────────────────────────────────────────
  const loadWeek = useCallback(async (ws, person) => {
    setLoading(true);
    try {
      const { data } = await api.get(`/workouts/week?week_start=${ws}&person=${encodeURIComponent(person || '')}`);
      setPlan(data.plan);
      const entries = data.entries || [];
      if (entries.length) {
        const wDays = getWeekDays(ws);
        const gymSet = new Set();
        entries.forEach(e => {
          const dayIdx = wDays.indexOf(String(e.entry_date).slice(0, 10));
          if (e.workout_type === 'strength' && dayIdx >= 0) gymSet.add(dayIdx);
        });
        setGymDays(gymSet);
        setGenerated(entries);
      } else {
        setGymDays(new Set());
        setGenerated(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWeek(weekStart, currentPerson);
  }, [weekStart, currentPerson, loadWeek]);

  // ── load analytics ─────────────────────────────────────────────────────────
  const loadAnalytics = useCallback(async (p, person) => {
    setALoading(true);
    try {
      const { from, to } = dateRangeFor(p);
      const { data } = await api.get(`/workouts/calendar?from=${from}&to=${to}&person=${encodeURIComponent(person || '')}`);
      setAnalytics(data.entries || []);
    } catch {
      setAnalytics([]);
    } finally {
      setALoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === 'analytics') loadAnalytics(period, currentPerson);
  }, [view, period, currentPerson, loadAnalytics]);

  // ── toggle gym day ─────────────────────────────────────────────────────────
  function toggleGymDay(idx) {
    if (isAccepted) return;
    setGymDays(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
    setGenerated(null);
  }

  // ── reset week ────────────────────────────────────────────────────────────
  async function resetWeek() {
    if (!plan) return;
    try {
      await api.put(`/workouts/week/${plan.id}`, { status: 'draft' });
      await loadWeek(weekStart, currentPerson);
    } catch (err) {
      console.error(err);
    }
  }

  // ── generate plan ─────────────────────────────────────────────────────────
  async function generatePlan() {
    if (!plan) {
      setAiError('Plan not loaded yet, please wait or refresh.');
      return;
    }
    setGenerating(true); setAiError('');
    try {
      const selectedDays = weekDays.filter((_, i) => gymDays.has(i));
      const { data } = await api.post(`/workouts/week/${plan.id}/generate`, {
        prompt: aiInputRef.current?.value || '',
        gym_days: selectedDays,
      });
      setGenerated(data.entries || []);
    } catch (err) {
      setAiError(err.response?.data?.error || 'Generation failed. Check your API key in Settings.');
    } finally {
      setGenerating(false);
    }
  }

  // ── save + accept ──────────────────────────────────────────────────────────
  async function saveEntries(entriesToSave) {
    if (!plan) return;
    setSaving(true);
    try {
      const src = entriesToSave ?? generated ?? [];
      const toSave = src
        .filter(e => e.title || e.notes)
        .map(e => ({
          entry_date: String(e.entry_date).slice(0, 10),
          workout_type: e.workout_type || 'rest',
          title: e.title || null,
          notes: typeof e.notes === 'string' ? e.notes : (e.notes ? JSON.stringify(e.notes) : null),
          duration: e.duration != null ? parseInt(e.duration, 10) : null,
        }));
      await api.put(`/workouts/week/${plan.id}`, { entries: toSave });
    } catch (err) { console.error(err); } finally { setSaving(false); }
  }

  async function acceptPlan() {
    if (!plan || !generated?.length) return;
    setAccepting(true);
    try {
      await saveEntries(generated);
      const { data } = await api.post(`/workouts/week/${plan.id}/accept`);
      setPlan(data.plan);
    } catch (err) { console.error(err); } finally { setAccepting(false); }
  }

  function shiftWeek(dir) {
    const d = new Date(weekStart + 'T12:00:00');
    d.setDate(d.getDate() + dir * 7);
    setWeekStart(d.toISOString().slice(0, 10));
  }

  // ── plan stats ─────────────────────────────────────────────────────────────
  function computePlanStats(entries) {
    if (!entries?.length) return null;
    const gymEntries = entries.filter(e => e.workout_type === 'strength');
    let totalSets = 0;
    let totalExercises = 0;
    gymEntries.forEach(e => {
      const exs = parseExercises(typeof e.notes === 'string' ? e.notes : JSON.stringify(e.notes || []));
      totalSets += countSets(exs);
      totalExercises += exs.length;
    });
    return { gymDays: gymEntries.length, totalSets, totalExercises };
  }

  // ── analytics helpers ──────────────────────────────────────────────────────
  function buildWeeklyData(entries) {
    if (!entries?.length) return null;
    const weekMap = {};
    entries.forEach(e => {
      if (e.workout_type !== 'strength') return;
      const ws = getMonday(String(e.entry_date).slice(0, 10));
      if (!weekMap[ws]) weekMap[ws] = { sessions: 0, sets: 0 };
      const exs = parseExercises(e.notes);
      weekMap[ws].sessions += 1;
      weekMap[ws].sets += countSets(exs);
    });
    return Object.entries(weekMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ws, d]) => ({
        week: parseD(ws).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        Sessions: d.sessions,
        Sets: d.sets,
      }));
  }

  function CustomTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    return (
      <div className="card p-3 text-xs space-y-1">
        <p className="text-muted font-mono mb-1">{label}</p>
        {payload.map(p => (
          <div key={p.name} className="flex justify-between gap-4">
            <span style={{ color: p.fill || p.color }}>{p.name}</span>
            <span className="text-white font-mono">{p.value}</span>
          </div>
        ))}
      </div>
    );
  }

  // ── planner view ───────────────────────────────────────────────────────────
  function Planner() {
    const planStats = computePlanStats(generated);

    return (
      <div className="space-y-4 fade-up-1">
        {/* Week header */}
        <div className="card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button onClick={() => shiftWeek(-1)}
                className="p-1.5 rounded-lg hover:bg-white/5 text-soft hover:text-white transition-colors">
                <ChevronLeft size={18} />
              </button>
              <div>
                <p className="text-white text-sm font-semibold font-body">{fmtWeekRange(weekStart)}</p>
                {isAccepted
                  ? <span className="flex items-center gap-1 text-xs text-emerald-400 font-mono"><Check size={10} /> Accepted</span>
                  : <span className="text-xs text-amber-400/60 font-mono">Draft</span>}
              </div>
              <button onClick={() => shiftWeek(1)}
                className="p-1.5 rounded-lg hover:bg-white/5 text-soft hover:text-white transition-colors">
                <ChevronRight size={18} />
              </button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {isAccepted && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-400/10 text-emerald-400 text-xs font-semibold border border-emerald-400/20">
                  <Check size={13} /> Plan Accepted
                </span>
              )}
              {isAccepted && (
                <button onClick={resetWeek}
                  className="text-xs px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors">
                  Reset Week
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Onboarding callout */}
        {!isAccepted && !generated && (
          <div className="px-4 py-3 rounded-xl border border-white/8 bg-white/[0.02] text-xs text-muted font-mono">
            <span className="text-white/70">① Pick gym days</span>
            {' → '}
            <span className="text-white/70">② Describe your workout style</span>
            {' → '}
            <span className="text-white/70">③ Generate &amp; accept your plan</span>
          </div>
        )}

        {/* Step 1: Gym Day Picker */}
        <div className="card p-4">
          <p className="text-xs text-muted uppercase tracking-widest font-mono mb-3">
            {isAccepted ? 'Gym Days This Week' : 'Step 1 — Pick Your Gym Days'}
          </p>
          <div className="grid grid-cols-7 gap-2">
            {weekDays.map((ds, i) => {
              const d     = parseD(ds);
              const isT   = ds === today;
              const isGym = gymDays.has(i);
              return (
                <button key={ds}
                  onClick={() => toggleGymDay(i)}
                  disabled={isAccepted}
                  className={`flex flex-col items-center gap-1 py-3 px-1 rounded-xl border transition-all
                    ${isGym
                      ? 'bg-accent/15 border-accent/40 text-accent'
                      : isT
                        ? 'bg-white/5 border-white/15 text-white'
                        : 'bg-transparent border-white/8 text-soft hover:border-white/20 hover:text-white'}
                    ${isAccepted ? 'cursor-default' : 'cursor-pointer'}`}>
                  <span className="text-[10px] font-mono uppercase">{DAY_LABELS[i]}</span>
                  <span className={`text-lg font-bold font-display ${isT && !isGym ? 'text-accent' : ''}`}>{d.getDate()}</span>
                  {isGym
                    ? <Dumbbell size={12} className="text-accent" />
                    : <span className="h-3 w-3 rounded-full border border-white/15" />}
                </button>
              );
            })}
          </div>
          {!isAccepted && gymDays.size === 0 && (
            <p className="text-xs text-muted/60 mt-3 text-center">Click days above to mark them as gym days</p>
          )}
          {!isAccepted && gymDays.size > 0 && !generated && (
            <p className="text-xs text-soft mt-3 text-center">
              {gymDays.size} gym {gymDays.size === 1 ? 'day' : 'days'} selected — generate your workout plan below
            </p>
          )}
          {isAccepted && (
            <p className="text-xs text-muted/60 font-mono mt-3 text-center">
              This week's plan is accepted. Navigate to another week to plan ahead.
            </p>
          )}
        </div>

        {/* Step 2: AI Generate */}
        {!isAccepted && gymDays.size > 0 && (
          <div className="card p-4">
            <p className="text-xs text-muted uppercase tracking-widest font-mono mb-3">Step 2 — Generate Workout Plan</p>
            <div className="flex gap-2 items-center">
              <div className="flex items-center gap-1.5 text-xs text-purple-400 font-semibold shrink-0">
                <Sparkles size={13} />AI
              </div>
              <input ref={aiInputRef} className="input flex-1 text-xs py-1.5"
                placeholder="e.g. Push Pull Legs, Upper Lower, 4-day split, chest focus…"
                defaultValue=""
                onKeyDown={e => e.key === 'Enter' && !generating && generatePlan()} />
              <button onClick={generatePlan} disabled={generating}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                  bg-purple-500/20 text-purple-300 border border-purple-500/30
                  hover:bg-purple-500/30 transition-colors disabled:opacity-50">
                <Sparkles size={12} />{generating ? 'Generating…' : 'Generate'}
              </button>
              {generated && !generating && (
                <button onClick={generatePlan} disabled={generating}
                  title="Regenerate"
                  className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs
                    text-muted hover:text-white border border-white/10 hover:border-white/20 transition-colors">
                  <RotateCcw size={12} />
                  <span>Retry</span>
                </button>
              )}
            </div>
            {aiError && <p className="text-xs text-red-400 mt-2">{aiError}</p>}
          </div>
        )}

        {/* Step 3: Generated Plan */}
        {generated && generated.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted uppercase tracking-widest font-mono">
                {isAccepted ? 'This Week\'s Plan' : 'Step 3 — Review & Accept'}
              </p>
              {!isAccepted && (
                <div className="flex gap-2">
                  <button onClick={() => saveEntries(generated)} disabled={saving}
                    className="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5">
                    <Save size={13} />{saving ? 'Saving…' : 'Save Draft'}
                  </button>
                  <button onClick={acceptPlan} disabled={accepting || saving}
                    className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5">
                    <Check size={13} />{accepting ? 'Accepting…' : 'Accept Plan'}
                  </button>
                </div>
              )}
            </div>

            {/* Stats banner */}
            {planStats && (
              <div className="grid grid-cols-3 gap-3">
                <div className="card px-4 py-3 flex items-center gap-3">
                  <Dumbbell size={18} className="text-accent shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted uppercase tracking-wider">Gym Days</p>
                    <p className="font-mono text-xl font-bold text-white">{planStats.gymDays}</p>
                  </div>
                </div>
                <div className="card px-4 py-3 flex items-center gap-3">
                  <Target size={18} className="text-blue-400 shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted uppercase tracking-wider">Total Sets</p>
                    <p className="font-mono text-xl font-bold text-white">{planStats.totalSets}</p>
                  </div>
                </div>
                <div className="card px-4 py-3 flex items-center gap-3">
                  <Flame size={18} className="text-orange-400 shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted uppercase tracking-wider">Exercises</p>
                    <p className="font-mono text-xl font-bold text-white">{planStats.totalExercises}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Per-day workout cards */}
            {weekDays.map((ds, i) => {
              const entry = generated.find(e => String(e.entry_date).slice(0, 10) === ds);
              if (!entry) return null;
              const isT   = ds === today;
              const isGym = entry.workout_type === 'strength';
              const exs   = isGym ? parseExercises(
                typeof entry.notes === 'string' ? entry.notes : JSON.stringify(entry.notes || [])
              ) : [];

              return (
                <div key={ds} className={`card overflow-hidden ${isT ? 'ring-1 ring-accent/30' : ''}`}>
                  <div className={`flex items-center justify-between px-4 py-3 border-b border-white/5
                    ${isGym ? 'bg-accent/5' : 'bg-white/[0.02]'}`}>
                    <div className="flex items-center gap-3">
                      <div className="text-center min-w-[42px]">
                        <p className={`text-[10px] font-mono uppercase ${isT ? 'text-accent' : 'text-muted'}`}>{DAY_LABELS[i]}</p>
                        <p className={`text-2xl font-bold font-display leading-none ${isT ? 'text-accent' : 'text-white'}`}>
                          {parseD(ds).getDate()}
                        </p>
                      </div>
                      <div>
                        <p className={`font-semibold text-sm ${isGym ? 'text-white' : 'text-soft'}`}>{entry.title || 'Rest Day'}</p>
                        {isGym && (
                          <p className="text-[10px] text-muted mt-0.5">
                            {exs.length} exercises · {countSets(exs)} sets
                            {entry.duration ? ` · ${entry.duration} min` : ''}
                          </p>
                        )}
                      </div>
                    </div>
                    {isGym
                      ? <Dumbbell size={16} className="text-accent/60 shrink-0" />
                      : <span className="text-[10px] text-muted/50 font-mono">REST</span>}
                  </div>

                  {isGym && exs.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-white/5">
                            <th className="text-left px-4 py-2 text-muted font-mono uppercase tracking-wider text-[10px]">Exercise</th>
                            <th className="text-center px-3 py-2 text-muted font-mono uppercase tracking-wider text-[10px]">Sets</th>
                            <th className="text-center px-3 py-2 text-muted font-mono uppercase tracking-wider text-[10px]">Reps</th>
                          </tr>
                        </thead>
                        <tbody>
                          {exs.map((ex, j) => (
                            <tr key={j} className="border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02]">
                              <td className="px-4 py-2.5 text-soft">{ex.name}</td>
                              <td className="px-3 py-2.5 text-center">
                                <span className="inline-block min-w-[28px] text-center font-mono font-semibold text-accent bg-accent/10 rounded px-1.5 py-0.5">
                                  {ex.sets ?? '—'}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-center text-soft font-mono">{ex.reps ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!generated && !loading && (
          <div className="card p-8 text-center text-muted text-sm">
            {gymDays.size === 0
              ? 'Select your gym days above to get started.'
              : 'Generate a workout plan to see your schedule.'}
          </div>
        )}
      </div>
    );
  }

  // ── analytics view ─────────────────────────────────────────────────────────
  function Analytics() {
    if (aLoading) return (
      <div className="space-y-3 fade-up-1">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="card h-20 animate-pulse bg-white/[0.03]" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(2)].map((_, i) => <div key={i} className="card h-56 animate-pulse bg-white/[0.03]" />)}
        </div>
      </div>
    );

    const weekData = buildWeeklyData(analytics);
    if (!weekData?.length) return (
      <div className="card p-8 text-center fade-up-1">
        <p className="text-muted text-sm">No accepted workout data for this period. Accept a week plan to see analytics.</p>
        <button onClick={() => setView('planner')}
          className="mt-4 text-xs text-accent underline hover:text-accent/80 transition-colors">
          Go to Planner →
        </button>
      </div>
    );

    const totalSessions = weekData.reduce((s, w) => s + w.Sessions, 0);
    const totalSets     = weekData.reduce((s, w) => s + w.Sets, 0);
    const weeksActive   = weekData.length;
    const avgSets       = weeksActive ? Math.round(totalSets / weeksActive) : 0;

    const thisWeekStart = getMonday(today);
    const thisWeekGym = (analytics || []).filter(e =>
      getMonday(String(e.entry_date).slice(0, 10)) === thisWeekStart && e.workout_type === 'strength'
    );
    const alerts = thisWeekGym.length === 0 ? ['No gym sessions logged this week yet'] : [];

    return (
      <div className="space-y-4 fade-up-1">
        {alerts.map((msg, i) => (
          <div key={i} className="flex items-start gap-3 px-4 py-3 rounded-xl border bg-amber-400/5 border-amber-400/20 text-amber-300 text-sm">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />{msg}
          </div>
        ))}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Sessions', value: totalSessions, icon: Dumbbell,    color: 'text-accent'      },
            { label: 'Total Sets',     value: totalSets,     icon: Target,      color: 'text-blue-400'    },
            { label: 'Avg Sets/Week',  value: avgSets,       icon: TrendingUp,  color: 'text-teal-400'    },
            { label: 'Weeks Active',   value: weeksActive,   icon: Flame,       color: 'text-orange-400'  },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="card px-4 py-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Icon size={11} className={color} />
                <p className="text-[10px] text-muted uppercase tracking-wider">{label}</p>
              </div>
              <p className={`font-mono text-2xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card p-4">
            <p className="text-xs text-muted uppercase tracking-widest font-mono mb-4">Sessions per week</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weekData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#6b7280' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#6b7280' }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Sessions" fill="#f59e0b" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="card p-4">
            <p className="text-xs text-muted uppercase tracking-widest font-mono mb-4">Sets per week</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weekData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#6b7280' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#6b7280' }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Sets" fill="#60a5fa" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  }

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex gap-1 p-1 rounded-xl flex-wrap"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
        {SUB_TABS.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to}
            className={({ isActive }) =>
              `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-body transition-all ${
                isActive ? 'bg-accent text-ink font-semibold' : 'text-soft hover:text-white'
              }`}>
            {Icon && <Icon size={16} />}{label}
          </NavLink>
        ))}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3 fade-up">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">
            {currentPerson ? `${currentPerson}'s Workouts` : 'Workouts'}
          </h1>
          <p className="text-muted text-xs mt-1 uppercase tracking-widest font-mono">Weekly gym planner & analytics</p>
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
        <div className="space-y-3 fade-up-1">
          <div className="card h-24 animate-pulse bg-white/[0.03]" />
          <div className="card h-48 animate-pulse bg-white/[0.03]" />
          <div className="card h-32 animate-pulse bg-white/[0.03]" />
        </div>
      )}

      {!loading && view === 'planner'  && <Planner />}
      {           view === 'analytics' && <Analytics />}
    </div>
  );
}
