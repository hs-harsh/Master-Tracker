import { useState, useEffect, useCallback } from 'react';
import {
  Dumbbell,
  ChevronLeft, ChevronRight, X,
  Check, Sparkles, AlertTriangle,
  Flame, Target, TrendingUp, Award,
  Plus, Trash2, Pencil,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import api from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { parseD, todayStr, getMonday, getWeekDays, fmtWeekRange } from '../../lib/utils';
import { MUSCLE_GROUPS, muscleLabel } from '../../lib/muscles';
import MuscleBodyMap from '../../components/MuscleBodyMap';
import PageHeader from '../../components/PageHeader';
import SegmentedToggle from '../../components/SegmentedToggle';
import RangeChips from '../../components/RangeChips';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const PERIODS = ['1M', '3M', '1Y'];
const WELLNESS_PERIOD_KEY = 'wellness_analytics_period';
const TRENDS_EXERCISE_KEY = 'wellness_trends_exercise_filter';
const VIEWS = [
  { key: 'log',       label: 'Log' },
  { key: 'muscles',   label: 'Muscles' },
  { key: 'analytics', label: 'Analytics' },
];
const CHART_PALETTE = ['#f59e0b', '#60a5fa', '#34d399', '#f472b6', '#a78bfa', '#fb923c', '#22d3ee', '#facc15', '#f87171', '#94a3b8'];

// ─── helpers ──────────────────────────────────────────────────────────────────
function dateRangeFor(period) {
  const to = todayStr();
  const d  = new Date(to + 'T12:00:00');
  const days = { '1M': 30, '3M': 90, '1Y': 365 }[period] || 30;
  d.setDate(d.getDate() - days);
  return { from: d.toISOString().slice(0, 10), to };
}

// Parse exercises from legacy notes field (JSON array or plain text fallback)
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

function fmtShort(ds) {
  return parseD(ds).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function uniqJoin(vals) {
  const u = [...new Set(vals.filter(v => v != null && v !== ''))];
  return u.length ? u.join('/') : null;
}

// Structured exercise → display row {weight, sets, reps}
function summarizeStructured(ex) {
  const sets = Array.isArray(ex.sets) ? ex.sets : [];
  return {
    weight: uniqJoin(sets.map(s => s.weight_raw ?? (s.weight_kg != null ? String(s.weight_kg) : null))),
    sets: sets.length || null,
    reps: uniqJoin(sets.map(s => s.reps)),
  };
}

// Legacy notes exercise → structured draft (for editing pre-rebuild entries)
function legacyToStructured(exs) {
  return exs.map(ex => {
    const n = parseInt(ex.sets, 10) || 1;
    const w = ex.weight != null && ex.weight !== '' ? parseFloat(String(ex.weight)) : NaN;
    const reps = parseInt(ex.reps, 10);
    return {
      name: ex.name || '',
      category: 'strength',
      muscles: [],
      sets: Array.from({ length: n }, (_, i) => ({
        set: i + 1,
        weight_kg: isFinite(w) ? w : null,
        weight_raw: ex.weight != null && ex.weight !== '' ? String(ex.weight) : null,
        reps: isFinite(reps) ? reps : null,
      })),
      duration_min: null,
    };
  });
}

// ─── component ────────────────────────────────────────────────────────────────
export default function WellnessWorkouts() {
  const { personName, activePerson } = useAuth();
  const currentPerson = activePerson || personName;

  const [view, setViewRaw] = useState(() => {
    const v = localStorage.getItem('wellness_workouts_view');
    if (!v || v === 'planner') return 'log'; // migrate retired planner view
    return VIEWS.some(x => x.key === v) ? v : 'log';
  });
  const setView = (v) => { setViewRaw(v); localStorage.setItem('wellness_workouts_view', v); };

  const [weekStart, setWeekStart] = useState(() => getMonday(todayStr()));
  const [plan,      setPlan]      = useState(null);
  const [entries,   setEntries]   = useState([]);
  const [loading,   setLoading]   = useState(false);

  // Day strip selection — clicking a day box opens that day's logger/detail
  const [logDate,   setLogDate]   = useState(null);
  const [relogOpen, setRelogOpen] = useState(false);

  // AI log panel (scoped to logDate)
  const [aiLogPrompt,  setAiLogPrompt]  = useState('');
  const [aiLogParsing, setAiLogParsing] = useState(false);
  const [aiLogError,   setAiLogError]   = useState('');
  const [aiLogPreview, setAiLogPreview] = useState(null); // { entry, exercises }
  const [aiLogSaving,  setAiLogSaving]  = useState(false);

  // Per-day edit state
  const [editEntryId, setEditEntryId] = useState(null);
  const [editDraft,   setEditDraft]   = useState(null); // { entry_date, workout_type, title, duration, exercises }
  const [editSaving,  setEditSaving]  = useState(false);
  const [editError,   setEditError]   = useState('');

  // Muscles view
  const [muscleData,     setMuscleData]     = useState(null);
  const [mLoading,       setMLoading]       = useState(false);
  const [selectedMuscle, setSelectedMuscle] = useState(null);
  const [rec,        setRec]        = useState(null);
  const [recLoading, setRecLoading] = useState(false);
  const [recError,   setRecError]   = useState('');

  // Analytics view
  const [period, setPeriodRaw] = useState(() => localStorage.getItem(WELLNESS_PERIOD_KEY) || '1M');
  const setPeriod = (p) => { setPeriodRaw(p); localStorage.setItem(WELLNESS_PERIOD_KEY, p); };
  const [analytics, setAnalytics] = useState(null);
  const [aLoading,  setALoading]  = useState(false);
  const [trends,        setTrends]        = useState(null);
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [trendExercise, setTrendExerciseRaw] = useState(() => localStorage.getItem(TRENDS_EXERCISE_KEY) || '');
  const setTrendExercise = (v) => { setTrendExerciseRaw(v); localStorage.setItem(TRENDS_EXERCISE_KEY, v); };

  const today    = todayStr();
  const weekDays = getWeekDays(weekStart);

  // ── load week ──────────────────────────────────────────────────────────────
  const loadWeek = useCallback(async (ws, person) => {
    setLoading(true);
    try {
      const { data } = await api.get(`/workouts/week?week_start=${ws}&person=${encodeURIComponent(person || '')}`);
      setPlan(data.plan);
      setEntries(data.entries || []);
      setEditEntryId(null);
      setEditDraft(null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWeek(weekStart, currentPerson);
  }, [weekStart, currentPerson, loadWeek]);

  // ── load muscle map ────────────────────────────────────────────────────────
  const loadMuscles = useCallback(async (ws, person) => {
    setMLoading(true);
    try {
      const { data } = await api.get(`/workouts/muscle-week?week_start=${ws}&person=${encodeURIComponent(person || '')}`);
      setMuscleData(data.muscles || {});
    } catch {
      setMuscleData({});
    } finally {
      setMLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === 'muscles') loadMuscles(weekStart, currentPerson);
  }, [view, weekStart, currentPerson, loadMuscles]);

  // ── load analytics + trends ────────────────────────────────────────────────
  const loadAnalytics = useCallback(async (p, person) => {
    setALoading(true);
    setTrendsLoading(true);
    const { from, to } = dateRangeFor(p);
    try {
      const { data } = await api.get(`/workouts/calendar?from=${from}&to=${to}&person=${encodeURIComponent(person || '')}`);
      setAnalytics(data.entries || []);
    } catch {
      setAnalytics([]);
    } finally {
      setALoading(false);
    }
    try {
      const { data } = await api.get(`/workouts/trends?from=${from}&to=${to}&person=${encodeURIComponent(person || '')}`);
      setTrends(data);
    } catch {
      setTrends(null);
    } finally {
      setTrendsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === 'analytics') loadAnalytics(period, currentPerson);
  }, [view, period, currentPerson, loadAnalytics]);

  function shiftWeek(dir) {
    const d = new Date(weekStart + 'T12:00:00');
    d.setDate(d.getDate() + dir * 7);
    setWeekStart(d.toISOString().slice(0, 10));
    setSelectedMuscle(null);
    closeDay();
  }

  const entryFor = (ds) => entries.find(e => String(e.entry_date).slice(0, 10) === ds) || null;

  // Open a day box: pre-scopes the AI logger (or the day's detail) to that date.
  function openDay(ds) {
    if (logDate === ds) { closeDay(); return; }
    setLogDate(ds);
    setRelogOpen(false);
    setAiLogPrompt('');
    setAiLogPreview(null);
    setAiLogError('');
    setEditEntryId(null);
    setEditDraft(null);
  }

  function closeDay() {
    setLogDate(null);
    setRelogOpen(false);
    setAiLogPrompt('');
    setAiLogPreview(null);
    setAiLogError('');
  }

  // Insert/replace a saved entry into local state (no page refresh)
  function upsertEntry(saved) {
    setEntries(prev => {
      const next = prev.filter(e => String(e.entry_date).slice(0, 10) !== String(saved.entry_date).slice(0, 10));
      next.push(saved);
      next.sort((a, b) => String(a.entry_date).localeCompare(String(b.entry_date)));
      return next;
    });
  }

  // ── AI log panel actions ───────────────────────────────────────────────────
  async function parseAiLog() {
    if (!plan || !logDate || !aiLogPrompt.trim()) return;
    setAiLogParsing(true); setAiLogError(''); setAiLogPreview(null);
    try {
      const { data } = await api.post(`/workouts/week/${plan.id}/ai-log`, {
        prompt: aiLogPrompt.trim(),
        entry_date: logDate,
      });
      setAiLogPreview({ entry: data.entry, exercises: data.exercises || [] });
    } catch (err) {
      setAiLogError(err.response?.data?.error || 'Parsing failed. Check your API key in Settings.');
    } finally {
      setAiLogParsing(false);
    }
  }

  async function saveAiLog() {
    if (!plan || !aiLogPreview) return;
    setAiLogSaving(true); setAiLogError('');
    try {
      const { data } = await api.post(`/workouts/week/${plan.id}/log-entry`, {
        entry_date: aiLogPreview.entry.entry_date,
        workout_type: aiLogPreview.entry.workout_type,
        title: aiLogPreview.entry.title,
        duration: aiLogPreview.entry.duration,
        exercises: aiLogPreview.exercises,
      });
      upsertEntry(data.entry);
      setAiLogPreview(null);
      setAiLogPrompt('');
      setLogDate(null);
    } catch (err) {
      setAiLogError(err.response?.data?.error || 'Save failed');
    } finally {
      setAiLogSaving(false);
    }
  }

  // ── per-day edit / delete ──────────────────────────────────────────────────
  function startEdit(entry) {
    const structured = entry.exercise_logs?.length
      ? entry.exercise_logs.map(l => ({
          name: l.exercise_name,
          category: l.category,
          muscles: Array.isArray(l.muscles) ? l.muscles : [],
          sets: Array.isArray(l.sets) ? l.sets : [],
          duration_min: l.duration_min,
        }))
      : legacyToStructured(parseExercises(entry.notes));
    setEditEntryId(entry.id);
    setEditError('');
    setEditDraft({
      entry_date: String(entry.entry_date).slice(0, 10),
      workout_type: entry.workout_type || 'strength',
      title: entry.title || '',
      duration: entry.duration,
      exercises: structured,
    });
  }

  async function saveEdit() {
    if (!plan || !editDraft) return;
    setEditSaving(true); setEditError('');
    try {
      const { data } = await api.post(`/workouts/week/${plan.id}/log-entry`, editDraft);
      upsertEntry(data.entry);
      setEditEntryId(null);
      setEditDraft(null);
    } catch (err) {
      setEditError(err.response?.data?.error || 'Save failed');
    } finally {
      setEditSaving(false);
    }
  }

  async function deleteEntry(entry) {
    if (!confirm(`Delete the ${fmtShort(String(entry.entry_date).slice(0, 10))} workout?`)) return;
    try {
      await api.delete(`/workouts/entries/${entry.id}`);
      setEntries(prev => prev.filter(e => e.id !== entry.id));
      if (logDate === String(entry.entry_date).slice(0, 10)) closeDay();
    } catch (err) {
      console.error(err);
    }
  }

  // ── recommendation (F3) ────────────────────────────────────────────────────
  async function generateRec() {
    setRecLoading(true); setRecError('');
    try {
      const { data } = await api.post('/workouts/recommend-next', { person: currentPerson || '' });
      setRec(data);
    } catch (err) {
      setRecError(err.response?.data?.error || 'Recommendation failed. Check your API key in Settings.');
    } finally {
      setRecLoading(false);
    }
  }

  function useRecInLog() {
    if (!rec) return;
    const text = `${rec.focus}: ` + rec.exercises.map(e => {
      const parts = [e.name];
      if (e.sets) parts.push(`${e.sets} sets`);
      if (e.reps) parts.push(`x ${e.reps}`);
      if (e.suggested_weight) parts.push(`@ ${e.suggested_weight}`);
      return parts.join(' ');
    }).join(', ');
    setLogDate(weekDays.includes(today) ? today : weekDays[0]);
    setRelogOpen(true);
    setAiLogPrompt(text);
    setAiLogPreview(null);
    setAiLogError('');
    setView('log');
  }

  // ── shared week header ─────────────────────────────────────────────────────
  function WeekHeader() {
    return (
      <div className="card p-4">
        <div className="flex items-center gap-2">
          <button onClick={() => shiftWeek(-1)}
            className="p-1.5 rounded-lg hover:bg-white/5 text-soft hover:text-white transition-colors">
            <ChevronLeft size={18} />
          </button>
          <p className="text-white text-sm font-semibold font-body flex-1 text-center sm:text-left">{fmtWeekRange(weekStart)}</p>
          <button onClick={() => shiftWeek(1)}
            className="p-1.5 rounded-lg hover:bg-white/5 text-soft hover:text-white transition-colors">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    );
  }

  // ── clickable weekly day strip (Log view) ──────────────────────────────────
  // Mirrors the Habits planner weekly header: chevron week navigator + range
  // label top-left, hint top-right, then seven day columns. Clicking a column
  // opens the AI logger (or the logged day's detail) pre-scoped to that date.
  function WeekDayStrip() {
    const currentWeekStart = getMonday(today);
    const isCurrentWeek = weekStart === currentWeekStart;
    return (
      <div className="card p-3 sm:p-4 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5">
            <button onClick={() => shiftWeek(-1)} title="Previous week"
              className="p-1.5 rounded-lg hover:bg-white/5 text-soft hover:text-white transition-colors">
              <ChevronLeft size={18} />
            </button>
            <p className="text-white text-sm font-semibold font-body">{fmtWeekRange(weekStart)}</p>
            <button onClick={() => shiftWeek(1)} title="Next week"
              className="p-1.5 rounded-lg hover:bg-white/5 text-soft hover:text-white transition-colors">
              <ChevronRight size={18} />
            </button>
            {!isCurrentWeek && (
              <button onClick={() => { setWeekStart(currentWeekStart); closeDay(); }}
                className="px-2.5 py-1 rounded-lg text-xs font-mono bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-colors">
                Today
              </button>
            )}
          </div>
          <p className="text-[10px] sm:text-xs text-muted font-mono">Tap a day to log or edit it</p>
        </div>

        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {weekDays.map((ds, i) => {
            const entry    = entryFor(ds);
            const isT      = ds === today;
            const isSel    = logDate === ds;
            const logged   = !!entry;
            const setCount = entry?.exercise_logs?.length
              ? entry.exercise_logs.reduce((s, l) => s + (Array.isArray(l.sets) ? l.sets.length : 0), 0)
              : countSets(parseExercises(entry?.notes));
            return (
              <button key={ds} onClick={() => openDay(ds)}
                title={logged ? `${entry.title || 'Workout'} — tap to view or edit` : 'Tap to log a workout'}
                className={`min-h-[68px] rounded-xl border px-0.5 py-2 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                  isSel
                    ? 'border-accent bg-accent/15'
                    : logged
                      ? 'border-accent/30 bg-accent/[0.07] hover:bg-accent/15'
                      // border-border + accent hover: both are theme-aware, unlike
                      // white/N tints which vanish on a white light-mode card.
                      : 'border-dashed border-border hover:bg-accent/10'
                } ${isT && !isSel ? 'ring-1 ring-accent/30' : ''}`}>
                <span className={`text-[9px] sm:text-[10px] font-mono uppercase tracking-wide ${isT ? 'text-accent' : 'text-muted'}`}>
                  {DAY_LABELS[i]}
                </span>
                <span className={`text-lg sm:text-xl font-bold font-display leading-none ${isT ? 'text-accent' : logged ? 'text-white' : 'text-soft'}`}>
                  {parseD(ds).getDate()}
                </span>
                <span className="text-[9px] text-muted font-mono leading-none">
                  {parseD(ds).toLocaleDateString('en-IN', { month: 'short' })}
                </span>
                {logged ? (
                  <span className="flex items-center gap-0.5 text-[9px] font-mono text-accent leading-none mt-0.5">
                    <Check size={8} />{setCount || ''}
                  </span>
                ) : (
                  <Plus size={10} className="text-muted/40 mt-0.5" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── structured exercise editor (shared by AI preview + day edit) ───────────
  function ExercisesEditor({ exercises, onChange }) {
    const update = (i, patch) => onChange(exercises.map((ex, j) => j === i ? { ...ex, ...patch } : ex));
    const updateSet = (i, si, patch) =>
      update(i, { sets: exercises[i].sets.map((s, j) => j === si ? { ...s, ...patch } : s) });

    return (
      <div className="space-y-3">
        {exercises.map((ex, i) => (
          <div key={i} className="rounded-xl border border-white/8 bg-white/[0.02] p-3 space-y-2">
            <div className="flex items-center gap-2">
              <input
                className="bg-transparent text-white text-sm font-semibold flex-1 min-w-0 outline-none placeholder-white/20"
                value={ex.name}
                onChange={e => update(i, { name: e.target.value })}
                placeholder="Exercise name"
              />
              <select
                className="input text-xs py-1 w-auto"
                value={ex.category}
                onChange={e => update(i, { category: e.target.value })}>
                <option value="strength">Strength</option>
                <option value="cardio">Cardio</option>
                <option value="flexibility">Flexibility</option>
              </select>
              <button onClick={() => onChange(exercises.filter((_, j) => j !== i))}
                className="text-muted hover:text-red-400 transition-colors p-1">
                <Trash2 size={13} />
              </button>
            </div>

            {/* muscle chips — every category, cardio included, so no muscle
                group is silently uncovered */}
            <div className="flex flex-wrap items-center gap-1.5">
                  {ex.muscles.map((m, mi) => (
                    <span key={m.muscle}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-mono cursor-pointer transition-colors ${
                        m.role === 'primary'
                          ? 'bg-accent/15 border-accent/40 text-accent'
                          : 'border-white/15 text-soft'
                      }`}
                      title={`${muscleLabel(m.muscle)} — ${m.role} (click to toggle role)`}
                      onClick={() => update(i, {
                        muscles: ex.muscles.map((mm, mj) => mj === mi
                          ? { ...mm, role: mm.role === 'primary' ? 'secondary' : 'primary' } : mm),
                      })}>
                      {muscleLabel(m.muscle)}{m.role === 'secondary' ? ' ·2°' : ''}
                      <button onClick={e => { e.stopPropagation(); update(i, { muscles: ex.muscles.filter((_, mj) => mj !== mi) }); }}
                        className="text-current opacity-60 hover:opacity-100">
                        <X size={9} />
                      </button>
                    </span>
                  ))}
                  <select
                    className="bg-transparent border border-white/15 rounded-full text-[10px] text-muted px-2 py-0.5 outline-none cursor-pointer"
                    value=""
                    onChange={e => {
                      const id = e.target.value;
                      if (id && !ex.muscles.some(m => m.muscle === id)) {
                        update(i, { muscles: [...ex.muscles, { muscle: id, role: 'primary' }] });
                      }
                    }}>
                    <option value="">+ muscle</option>
                    {MUSCLE_GROUPS.filter(g => !ex.muscles.some(m => m.muscle === g.id)).map(g => (
                      <option key={g.id} value={g.id}>{g.label}</option>
                    ))}
                  </select>
            </div>

            {ex.category === 'strength' && (
              <>
                {/* per-set table */}
                <div className="overflow-x-auto rounded-lg border border-white/8">
                  <table className="w-full text-xs min-w-[320px]">
                    <thead>
                      <tr className="border-b border-white/5">
                        <th className="text-left px-3 py-1.5 text-muted font-mono uppercase tracking-wider text-[10px]">Set</th>
                        <th className="text-center px-2 py-1.5 text-muted font-mono uppercase tracking-wider text-[10px]">Weight (kg)</th>
                        <th className="text-center px-2 py-1.5 text-muted font-mono uppercase tracking-wider text-[10px]">Reps</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {ex.sets.map((s, si) => (
                        <tr key={si} className="border-b border-white/[0.03] last:border-0">
                          <td className="px-3 py-1 text-muted font-mono">{si + 1}</td>
                          <td className="px-2 py-1">
                            <input type="number" step="0.5"
                              className="bg-transparent text-soft text-xs text-center w-16 outline-none font-mono focus:text-white"
                              value={s.weight_kg ?? ''}
                              onChange={e => updateSet(i, si, {
                                weight_kg: e.target.value === '' ? null : Number(e.target.value),
                                weight_raw: e.target.value === '' ? null : e.target.value,
                              })}
                              placeholder="—"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input type="number"
                              className="bg-transparent text-soft text-xs text-center w-12 outline-none font-mono focus:text-white"
                              value={s.reps ?? ''}
                              onChange={e => updateSet(i, si, { reps: e.target.value === '' ? null : parseInt(e.target.value, 10) })}
                              placeholder="—"
                            />
                          </td>
                          <td className="px-1">
                            <button onClick={() => update(i, { sets: ex.sets.filter((_, j) => j !== si) })}
                              className="text-muted hover:text-red-400 transition-colors p-1">
                              <X size={11} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  onClick={() => update(i, { sets: [...ex.sets, { set: ex.sets.length + 1, weight_kg: null, weight_raw: null, reps: null }] })}
                  className="text-accent hover:opacity-80 text-xs flex items-center gap-1">
                  <Plus size={11} />Add set
                </button>
              </>
            )}

            {ex.category !== 'strength' && (
              <div className="flex items-center gap-2 text-xs text-soft">
                <span className="text-muted font-mono uppercase text-[10px]">Duration (min)</span>
                <input type="number"
                  className="input w-20 text-xs py-1 text-center font-mono"
                  value={ex.duration_min ?? ''}
                  onChange={e => update(i, { duration_min: e.target.value === '' ? null : parseInt(e.target.value, 10) })}
                />
              </div>
            )}
          </div>
        ))}
        <button
          onClick={() => onChange([...exercises, { name: '', category: 'strength', muscles: [], sets: [{ set: 1, weight_kg: null, weight_raw: null, reps: null }], duration_min: null }])}
          className="text-accent hover:opacity-80 text-xs flex items-center gap-1.5">
          <Plus size={12} />Add exercise
        </button>
      </div>
    );
  }

  // ── AI log panel — always scoped to the day picked in the strip ────────────
  function AiLogPanel({ dateStr, relog = false }) {
    const dayIdx = weekDays.indexOf(dateStr);
    return (
      <div className="card border-accent/30 bg-gradient-to-br from-accent/5 to-transparent">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles size={16} className="text-accent shrink-0" />
            <span className="font-display font-semibold text-white text-sm truncate">
              {relog ? 'Re-log' : 'Log'} {dayIdx >= 0 ? `${DAY_LABELS[dayIdx]} · ` : ''}{fmtShort(dateStr)}
            </span>
            <span className="text-xs text-muted hidden sm:inline">— describe what you did, AI structures it</span>
          </div>
          <button onClick={closeDay} title="Close"
            className="p-1.5 rounded-lg text-muted hover:text-white hover:bg-white/5 transition-colors shrink-0">
            <X size={14} />
          </button>
        </div>

        <div className="mt-4 space-y-3">
            {relog && (
              <p className="text-[11px] text-amber-300/80">
                Saving will replace the workout already logged for this day.
              </p>
            )}
            <div>
              <label className="text-[10px] text-muted uppercase tracking-widest font-mono mb-1.5 block">What did you do?</label>
              <textarea
                className="input w-full text-sm py-2 min-h-[80px] resize-none"
                placeholder="e.g. Leg day — Steppers 5 min, Leg press 109-127-155, Squats 15kg 3 sets, Stretching"
                value={aiLogPrompt}
                onChange={e => setAiLogPrompt(e.target.value)}
              />
            </div>

            {aiLogError && <p className="text-xs text-red-400">{aiLogError}</p>}

            {!aiLogPreview && (
              <button onClick={parseAiLog} disabled={aiLogParsing || !aiLogPrompt.trim()}
                className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50">
                <Sparkles size={14} />{aiLogParsing ? 'Parsing…' : 'Parse with AI'}
              </button>
            )}

            {aiLogPreview && (
              <div className="space-y-3 border-t border-white/8 pt-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted uppercase tracking-widest font-mono mb-1 block">Title</label>
                    <input
                      className="input w-full text-sm py-1.5"
                      value={aiLogPreview.entry.title || ''}
                      onChange={e => setAiLogPreview(prev => ({ ...prev, entry: { ...prev.entry, title: e.target.value } }))}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted uppercase tracking-widest font-mono mb-1 block">Type</label>
                    <select
                      className="input w-full text-sm py-1.5"
                      value={aiLogPreview.entry.workout_type}
                      onChange={e => setAiLogPreview(prev => ({ ...prev, entry: { ...prev.entry, workout_type: e.target.value } }))}>
                      <option value="strength">Strength</option>
                      <option value="cardio">Cardio</option>
                      <option value="flexibility">Flexibility</option>
                      <option value="rest">Rest</option>
                    </select>
                  </div>
                </div>

                {ExercisesEditor({
                  exercises: aiLogPreview.exercises,
                  onChange: (exs) => setAiLogPreview(prev => ({ ...prev, exercises: exs })),
                })}

                <div className="flex gap-2 pt-1">
                  <button onClick={() => setAiLogPreview(null)} className="btn-ghost text-xs px-3 py-1.5 flex-1">
                    Back
                  </button>
                  <button onClick={saveAiLog} disabled={aiLogSaving}
                    className="btn-primary text-xs px-3 py-1.5 flex-1 flex items-center justify-center gap-1.5">
                    <Check size={13} />{aiLogSaving ? 'Saving…' : 'Save Workout'}
                  </button>
                </div>
              </div>
            )}
        </div>
      </div>
    );
  }

  // ── day card (read-only + edit/delete) ─────────────────────────────────────
  function DayCard(entry) {
    const ds = String(entry.entry_date).slice(0, 10);
    const dayIdx = weekDays.indexOf(ds);
    const isT = ds === today;
    const structured = entry.exercise_logs?.length ? entry.exercise_logs : null;
    const legacy = structured ? null : parseExercises(entry.notes);
    const isEditing = editEntryId === entry.id;

    const totalSets = structured
      ? structured.reduce((s, l) => s + (Array.isArray(l.sets) ? l.sets.length : 0), 0)
      : countSets(legacy || []);
    const exCount = structured ? structured.length : (legacy?.length || 0);

    return (
      <div key={entry.id} className={`card overflow-hidden ${isT ? 'ring-1 ring-accent/30' : ''}`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-accent/5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="text-center min-w-[42px]">
              <p className={`text-[10px] font-mono uppercase ${isT ? 'text-accent' : 'text-muted'}`}>
                {dayIdx >= 0 ? DAY_LABELS[dayIdx] : ''}
              </p>
              <p className={`text-2xl font-bold font-display leading-none ${isT ? 'text-accent' : 'text-white'}`}>
                {parseD(ds).getDate()}
              </p>
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm text-white truncate">{entry.title || 'Workout'}</p>
              <p className="text-[10px] text-muted mt-0.5">
                {entry.workout_type}{exCount ? ` · ${exCount} exercises` : ''}{totalSets ? ` · ${totalSets} sets` : ''}
                {entry.duration ? ` · ${entry.duration} min` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!isEditing && (
              <button onClick={() => startEdit(entry)} title="Edit"
                className="p-2 rounded-lg text-muted hover:text-white hover:bg-white/5 transition-colors">
                <Pencil size={14} />
              </button>
            )}
            <button onClick={() => deleteEntry(entry)} title="Delete"
              className="p-2 rounded-lg text-muted hover:text-red-400 hover:bg-white/5 transition-colors">
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {isEditing && editDraft ? (
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <input
                className="input w-full text-sm py-1.5"
                value={editDraft.title}
                onChange={e => setEditDraft(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Title"
              />
              <select
                className="input w-full text-sm py-1.5"
                value={editDraft.workout_type}
                onChange={e => setEditDraft(prev => ({ ...prev, workout_type: e.target.value }))}>
                <option value="strength">Strength</option>
                <option value="cardio">Cardio</option>
                <option value="flexibility">Flexibility</option>
                <option value="rest">Rest</option>
              </select>
            </div>
            {ExercisesEditor({
              exercises: editDraft.exercises,
              onChange: (exs) => setEditDraft(prev => ({ ...prev, exercises: exs })),
            })}
            {editError && <p className="text-xs text-red-400">{editError}</p>}
            <div className="flex gap-2">
              <button onClick={() => { setEditEntryId(null); setEditDraft(null); }} className="btn-ghost text-xs px-3 py-1.5 flex-1">
                Cancel
              </button>
              <button onClick={saveEdit} disabled={editSaving}
                className="btn-primary text-xs px-3 py-1.5 flex-1 flex items-center justify-center gap-1.5">
                <Check size={13} />{editSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          (structured || legacy?.length) ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[420px]">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-left px-4 py-2 text-muted font-mono uppercase tracking-wider text-[10px]">Exercise</th>
                    <th className="text-center px-3 py-2 text-muted font-mono uppercase tracking-wider text-[10px]">Weight</th>
                    <th className="text-center px-3 py-2 text-muted font-mono uppercase tracking-wider text-[10px]">Sets</th>
                    <th className="text-center px-3 py-2 text-muted font-mono uppercase tracking-wider text-[10px]">Reps</th>
                    <th className="text-left px-3 py-2 text-muted font-mono uppercase tracking-wider text-[10px]">Muscles</th>
                  </tr>
                </thead>
                <tbody>
                  {(structured || legacy).map((ex, j) => {
                    const s = structured ? summarizeStructured(ex) : { weight: ex.weight, sets: ex.sets, reps: ex.reps };
                    const name = structured ? ex.exercise_name : ex.name;
                    const cat = structured ? ex.category : null;
                    const muscles = structured && Array.isArray(ex.muscles) ? ex.muscles : [];
                    return (
                      <tr key={j} className="border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02]">
                        <td className="px-4 py-2 text-soft">
                          {name}
                          {cat === 'cardio' && ex.duration_min ? <span className="text-muted font-mono"> · {ex.duration_min} min</span> : null}
                          {cat && cat !== 'strength' && <span className="ml-1.5 text-[9px] font-mono uppercase text-muted/70">{cat}</span>}
                        </td>
                        <td className="px-3 py-2 text-center text-soft font-mono whitespace-nowrap">{s.weight ?? '—'}</td>
                        <td className="px-3 py-2 text-center">
                          <span className="inline-block min-w-[28px] text-center font-mono font-semibold text-accent bg-accent/10 rounded px-1.5 py-0.5">
                            {s.sets ?? '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center text-soft font-mono whitespace-nowrap">{s.reps ?? '—'}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {muscles.map(m => (
                              <span key={m.muscle}
                                className={`px-1.5 py-0.5 rounded-full text-[9px] font-mono border ${
                                  m.role === 'primary' ? 'bg-accent/10 border-accent/30 text-accent' : 'border-white/10 text-muted'
                                }`}>
                                {muscleLabel(m.muscle)}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null
        )}
      </div>
    );
  }

  // ── Log view ───────────────────────────────────────────────────────────────
  function LogView() {
    const sorted = [...entries].sort((a, b) => String(a.entry_date).localeCompare(String(b.entry_date)));
    const selected = logDate ? entryFor(logDate) : null;

    return (
      <div className="space-y-4 fade-up-1">
        {WeekDayStrip()}

        {/* A day is picked in the strip → log it, or view/edit what's logged */}
        {logDate && !selected && AiLogPanel({ dateStr: logDate })}
        {logDate && selected && (
          <>
            {DayCard(selected)}
            {relogOpen
              ? AiLogPanel({ dateStr: logDate, relog: true })
              : (
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => { setRelogOpen(true); setAiLogPreview(null); setAiLogError(''); }}
                    className="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5">
                    <Sparkles size={13} />Re-log this day with AI
                  </button>
                  <button onClick={closeDay} className="btn-ghost text-xs px-3 py-1.5">
                    Close
                  </button>
                </div>
              )}
          </>
        )}

        {/* Nothing picked → overview of everything logged this week */}
        {!logDate && (
          sorted.length === 0
            ? (
              <div className="card p-8 text-center text-muted text-sm">
                Nothing logged this week — tap a day above to log a workout.
              </div>
            )
            : sorted.map(entry => DayCard(entry))
        )}
      </div>
    );
  }

  // ── Muscles view ───────────────────────────────────────────────────────────
  function RecommendCard() {
    return (
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs text-muted uppercase tracking-widest font-mono">Next session recommendation</p>
          <button onClick={generateRec} disabled={recLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
              bg-purple-500/20 text-purple-300 border border-purple-500/30
              hover:bg-purple-500/30 transition-colors disabled:opacity-50">
            <Sparkles size={12} />{recLoading ? 'Thinking…' : (rec ? 'Regenerate' : 'Generate')}
          </button>
        </div>
        {recError && <p className="text-xs text-red-400">{recError}</p>}
        {rec && (
          <div className="space-y-3">
            <div>
              <p className="text-white text-sm font-semibold font-body">{rec.focus}</p>
              <p className="text-xs text-soft leading-relaxed mt-1">{rec.rationale}</p>
            </div>
            <div className="overflow-x-auto rounded-lg border border-white/8">
              <table className="w-full text-xs min-w-[420px]">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-left px-3 py-2 text-muted font-mono uppercase tracking-wider text-[10px]">Exercise</th>
                    <th className="text-center px-2 py-2 text-muted font-mono uppercase tracking-wider text-[10px]">Sets</th>
                    <th className="text-center px-2 py-2 text-muted font-mono uppercase tracking-wider text-[10px]">Reps</th>
                    <th className="text-center px-2 py-2 text-muted font-mono uppercase tracking-wider text-[10px]">Weight</th>
                    <th className="text-left px-3 py-2 text-muted font-mono uppercase tracking-wider text-[10px]">Muscles</th>
                  </tr>
                </thead>
                <tbody>
                  {rec.exercises.map((e, i) => (
                    <tr key={i} className="border-b border-white/[0.03] last:border-0">
                      <td className="px-3 py-2 text-soft">{e.name}</td>
                      <td className="px-2 py-2 text-center text-soft font-mono">{e.sets ?? '—'}</td>
                      <td className="px-2 py-2 text-center text-soft font-mono">{e.reps ?? '—'}</td>
                      <td className="px-2 py-2 text-center text-soft font-mono whitespace-nowrap">{e.suggested_weight ?? '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {e.muscles.map(m => (
                            <span key={m} className="px-1.5 py-0.5 rounded-full text-[9px] font-mono border border-white/10 text-muted">
                              {muscleLabel(m)}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={useRecInLog} className="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5">
              <Dumbbell size={13} />Use in log
            </button>
          </div>
        )}
        {!rec && !recError && !recLoading && (
          <p className="text-xs text-muted/70">Generate a recommendation for your next gym session based on what you've trained recently.</p>
        )}
      </div>
    );
  }

  function MusclesView() {
    return (
      <div className="space-y-4 fade-up-1">
        {WeekHeader()}
        {RecommendCard()}
        {mLoading
          ? <div className="card h-72 animate-pulse bg-white/[0.03]" />
          : <MuscleBodyMap muscles={muscleData} selected={selectedMuscle} onSelect={(id) => setSelectedMuscle(prev => prev === id ? null : id)} />}
      </div>
    );
  }

  // ── analytics helpers ──────────────────────────────────────────────────────
  function buildWeeklyData(list) {
    if (!list?.length) return null;
    const weekMap = {};
    list.forEach(e => {
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
        week: fmtShort(ws),
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
            <span style={{ color: p.fill || p.color || p.stroke }}>{p.name}</span>
            <span className="text-white font-mono">{p.value}</span>
          </div>
        ))}
      </div>
    );
  }

  // ── trends (F4) ────────────────────────────────────────────────────────────
  function TrendsSection() {
    if (trendsLoading) return <div className="card h-56 animate-pulse bg-white/[0.03]" />;
    if (!trends?.exercises?.length) {
      return (
        <div className="card p-6 text-center text-muted text-sm">
          No structured exercise logs in this period yet — log workouts with AI to see strength trends.
        </div>
      );
    }

    const names = trends.exercises.map(e => e.name);
    const active = names.includes(trendExercise) ? trendExercise : names[0];
    const activeEx = trends.exercises.find(e => e.name === active);
    const chartData = (activeEx?.sessions || []).map(s => ({
      date: fmtShort(s.date),
      'Top set (kg)': s.top_set_kg,
      'Volume (kg)': s.volume_kg,
      Sets: s.sets,
    }));
    const hasLoad = chartData.some(d => d['Top set (kg)'] != null);

    const prs = trends.exercises.filter(e => e.pr)
      .sort((a, b) => b.pr.date.localeCompare(a.pr.date))
      .slice(0, 8);

    // per-muscle weekly stacked bars — muscles present in the period, capped to 8 by volume
    const muscleTotals = {};
    for (const w of trends.muscle_weekly || []) {
      for (const [m, sets] of Object.entries(w.muscles)) muscleTotals[m] = (muscleTotals[m] || 0) + sets;
    }
    const topMuscles = Object.entries(muscleTotals).sort(([, a], [, b]) => b - a).slice(0, 8).map(([m]) => m);
    const muscleBars = (trends.muscle_weekly || []).map(w => {
      const row = { week: fmtShort(w.week_start) };
      for (const m of topMuscles) row[muscleLabel(m)] = w.muscles[m] || 0;
      return row;
    });

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-muted uppercase tracking-widest font-mono">Strength & load trends</p>
          <select className="input text-xs py-1.5 w-auto" value={active} onChange={e => setTrendExercise(e.target.value)}>
            {names.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        {prs.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {prs.map(e => (
              <span key={e.name}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/10 border border-accent/25 text-accent text-[11px] font-mono">
                <Award size={11} />{e.name} PR: {e.pr.weight_kg} kg · {fmtShort(e.pr.date)}
              </span>
            ))}
          </div>
        )}

        <div className="card p-4">
          <p className="text-xs text-muted uppercase tracking-widest font-mono mb-4">{active} — top set & volume</p>
          {hasLoad ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} />
                <YAxis yAxisId="w" tick={{ fontSize: 10, fill: '#6b7280' }} />
                <YAxis yAxisId="v" orientation="right" tick={{ fontSize: 10, fill: '#6b7280' }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line yAxisId="w" type="monotone" dataKey="Top set (kg)" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                <Line yAxisId="v" type="monotone" dataKey="Volume (kg)" stroke="#60a5fa" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-muted py-8 text-center">
              Bodyweight exercise — {chartData.reduce((s, d) => s + (d.Sets || 0), 0)} sets logged across {chartData.length} session{chartData.length === 1 ? '' : 's'}, no load to chart.
            </p>
          )}
        </div>

        {muscleBars.length > 0 && (
          <div className="card p-4">
            <p className="text-xs text-muted uppercase tracking-widest font-mono mb-1">Weekly weighted sets per muscle</p>
            <p className="text-[10px] text-muted/60 font-mono mb-3">primary set = 1 · secondary set = 0.25</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={muscleBars} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#6b7280' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#6b7280' }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {topMuscles.map((m, i) => (
                  <Bar key={m} dataKey={muscleLabel(m)} stackId="m" fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    );
  }

  // ── Analytics view ─────────────────────────────────────────────────────────
  function AnalyticsView() {
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
      <div className="space-y-4 fade-up-1">
        <div className="card p-8 text-center">
          <p className="text-muted text-sm">No workouts logged in this period yet.</p>
          <button onClick={() => setView('log')}
            className="mt-4 text-xs text-accent underline hover:opacity-80 transition-opacity">
            Go to Log →
          </button>
        </div>
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

        {TrendsSection()}
      </div>
    );
  }

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="stack">
      <PageHeader
        className="fade-up"
        title={currentPerson ? `${currentPerson}'s Workouts` : 'Workouts'}
        eyebrow="Training log, muscle map & analytics"
        actions={<>
          {view === 'analytics' && (
            <RangeChips options={PERIODS} value={period} onChange={setPeriod} />
          )}
          <SegmentedToggle options={VIEWS} value={view} onChange={setView} />
        </>}
      />

      {loading && view === 'log' && (
        <div className="stack-tight fade-up-1">
          <div className="card h-24 animate-pulse bg-white/[0.03]" />
          <div className="card h-48 animate-pulse bg-white/[0.03]" />
        </div>
      )}

      {!loading && view === 'log'      && LogView()}
      {           view === 'muscles'   && MusclesView()}
      {           view === 'analytics' && AnalyticsView()}
    </div>
  );
}
