import { useState, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import {
  CheckSquare, Utensils, Dumbbell,
  ChevronLeft, ChevronRight,
  Plus, X, Check, Save, Sparkles,
  Zap, Activity, Wind, Moon,
} from 'lucide-react';
import api from '../../lib/api';

// ─── nav ──────────────────────────────────────────────────────────────────────
const SUB_TABS = [
  { to: '/wellness/habits',   label: 'Habits',   icon: CheckSquare },
  { to: '/wellness/meals',    label: 'Meals',    icon: Utensils    },
  { to: '/wellness/workouts', label: 'Workouts', icon: Dumbbell    },
];

// ─── workout types ────────────────────────────────────────────────────────────
const WORKOUT_TYPES = [
  { key: 'cardio',      label: 'Cardio',      icon: Zap,      color: 'text-orange-400', dot: 'bg-orange-400',  ring: 'bg-orange-400/10 border-orange-400/25'  },
  { key: 'strength',    label: 'Strength',    icon: Dumbbell, color: 'text-red-400',    dot: 'bg-red-400',     ring: 'bg-red-400/10 border-red-400/25'        },
  { key: 'flexibility', label: 'Flexibility', icon: Wind,     color: 'text-teal-400',   dot: 'bg-teal-400',    ring: 'bg-teal-400/10 border-teal-400/25'      },
  { key: 'rest',        label: 'Rest',        icon: Moon,     color: 'text-purple-400', dot: 'bg-purple-400',  ring: 'bg-purple-400/10 border-purple-400/25'  },
];
const WORKOUT_MAP = Object.fromEntries(WORKOUT_TYPES.map(w => [w.key, w]));

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

function eKey(date, workoutType) {
  return `${String(date).slice(0,10)}_${workoutType}`;
}

function firstDayOffset(year, month) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1; // Mon=0
}

// ─── component ────────────────────────────────────────────────────────────────
export default function WellnessWorkouts() {
  // planner state
  const [view,      setView]      = useState('planner');
  const [weekStart, setWeekStart] = useState(() => getMonday(todayStr()));
  const [plan,      setPlan]      = useState(null);
  const [entries,   setEntries]   = useState({}); // key -> {title,notes,duration}
  const [loading,    setLoading]   = useState(false);
  const [saving,     setSaving]    = useState(false);
  const [accepting,  setAccepting] = useState(false);
  const [aiPrompt,   setAiPrompt]  = useState('');
  const [generating, setGenerating]= useState(false);
  const [aiError,    setAiError]   = useState('');

  // cell edit modal
  const [editCell, setEditCell] = useState(null); // {date, workoutType}
  const [editData, setEditData] = useState({ title: '', notes: '', duration: '' });

  // calendar state
  const [calMonth,   setCalMonth]  = useState(new Date());
  const [calEntries, setCalEntries]= useState({}); // date -> entry[]
  const [calLoading, setCalLoading]= useState(false);
  const [selDate,    setSelDate]   = useState(null);

  // ── load week ──────────────────────────────────────────────────────────────
  const loadWeek = useCallback(async (ws) => {
    setLoading(true);
    try {
      const { data } = await api.get(`/workouts/week?week_start=${ws}`);
      setPlan(data.plan);
      const map = {};
      (data.entries || []).forEach(e => {
        map[eKey(e.entry_date, e.workout_type)] = {
          title:    e.title    || '',
          notes:    e.notes    || '',
          duration: e.duration != null ? String(e.duration) : '',
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
      const { data } = await api.get(`/workouts/calendar?from=${from}&to=${to}`);
      const map = {};
      (data.entries || []).forEach(e => {
        const ds = String(e.entry_date).slice(0,10);
        (map[ds] = map[ds] || []).push(e);
      });
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

  // ── save entries ───────────────────────────────────────────────────────────
  async function saveEntries(entriesOverride) {
    if (!plan) return;
    setSaving(true);
    try {
      const src = entriesOverride ?? entries;
      const toSave = Object.entries(src)
        .filter(([, v]) => v.title || v.notes)
        .map(([key, val]) => {
          const [date, workoutType] = key.split('_');
          return { entry_date: date, workout_type: workoutType, ...val };
        });
      await api.put(`/workouts/week/${plan.id}`, { entries: toSave });
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  // ── accept plan ────────────────────────────────────────────────────────────
  async function acceptPlan() {
    if (!plan) return;
    setAccepting(true);
    try {
      await saveEntries();
      const { data } = await api.post(`/workouts/week/${plan.id}/accept`);
      setPlan(data.plan);
    } catch (err) {
      console.error(err);
    } finally {
      setAccepting(false);
    }
  }

  // ── ai generate ────────────────────────────────────────────────────────────
  async function generatePlan() {
    if (!plan) return;
    setGenerating(true);
    setAiError('');
    try {
      const { data } = await api.post(`/workouts/week/${plan.id}/generate`, { prompt: aiPrompt });
      const map = {};
      (data.entries || []).forEach(e => {
        map[eKey(e.entry_date, e.workout_type)] = {
          title:    e.title    || '',
          notes:    e.notes    || '',
          duration: e.duration != null ? String(e.duration) : '',
        };
      });
      setEntries(map);
    } catch (err) {
      setAiError(err.response?.data?.error || 'Generation failed. Check your API key in Settings.');
    } finally {
      setGenerating(false);
    }
  }

  // ── week nav ───────────────────────────────────────────────────────────────
  function shiftWeek(dir) {
    const d = new Date(weekStart + 'T12:00:00');
    d.setDate(d.getDate() + dir * 7);
    setWeekStart(d.toISOString().slice(0, 10));
  }

  // ── cell modal ─────────────────────────────────────────────────────────────
  function openCell(date, workoutType) {
    if (plan?.status === 'accepted') return;
    setEditCell({ date, workoutType });
    setEditData(entries[eKey(date, workoutType)] || { title: '', notes: '', duration: '' });
  }

  function saveCell() {
    if (!editCell) return;
    const key = eKey(editCell.date, editCell.workoutType);
    const next = { ...entries, [key]: { ...editData } };
    setEntries(next);
    setEditCell(null);
  }

  function clearCell() {
    if (!editCell) return;
    const key = eKey(editCell.date, editCell.workoutType);
    const next = { ...entries };
    delete next[key];
    setEntries(next);
    setEditCell(null);
  }

  // ─────────────────────────────────────────────────────────────────────────
  const today    = todayStr();
  const weekDays = getWeekDays(weekStart);
  const isAccepted = plan?.status === 'accepted';

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
            <div>
              <p className="text-white text-sm font-semibold font-body">{fmtWeekRange(weekStart)}</p>
              {isAccepted
                ? <span className="flex items-center gap-1 text-xs text-emerald-400 font-mono">
                    <Check size={10} /> Accepted
                  </span>
                : <span className="text-xs text-amber-400/60 font-mono">Draft</span>
              }
            </div>
            <button onClick={() => shiftWeek(1)}
              className="p-1.5 rounded-lg hover:bg-white/5 text-soft hover:text-white transition-colors">
              <ChevronRight size={18} />
            </button>
          </div>

          {/* action buttons */}
          <div className="flex gap-2">
            {isAccepted ? (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-400/10 text-emerald-400 text-xs font-semibold border border-emerald-400/20">
                <Check size={13} /> Plan Accepted — saved to calendar
              </span>
            ) : (
              <>
                <button onClick={() => saveEntries()} disabled={saving}
                  className="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5">
                  <Save size={13} />
                  {saving ? 'Saving…' : 'Save Draft'}
                </button>
                <button onClick={acceptPlan} disabled={accepting || saving}
                  className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5">
                  <Check size={13} />
                  {accepting ? 'Saving…' : 'Accept Plan'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* AI prompt bar */}
        {!isAccepted && (
          <div className="p-3 border-b border-white/5 bg-white/[0.02]">
            <div className="flex gap-2 items-center">
              <div className="flex items-center gap-1.5 text-xs text-purple-400 font-semibold shrink-0">
                <Sparkles size={13} />
                AI
              </div>
              <input
                className="input flex-1 text-xs py-1.5"
                placeholder="e.g. Push Pull Legs, 5-day PPL, home workout, weight loss…"
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !generating && generatePlan()}
              />
              <button
                onClick={generatePlan}
                disabled={generating}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                  bg-purple-500/20 text-purple-300 border border-purple-500/30
                  hover:bg-purple-500/30 transition-colors disabled:opacity-50">
                <Sparkles size={12} />
                {generating ? 'Generating…' : 'Generate'}
              </button>
            </div>
            {aiError && <p className="text-xs text-red-400 mt-1.5">{aiError}</p>}
          </div>
        )}

        {/* grid — horizontally scrollable on mobile */}
        <div className="overflow-x-auto">
          <div className="min-w-[680px]">
            {/* day-header row */}
            <div className="grid grid-cols-8 border-b border-white/5">
              <div className="p-3" /> {/* corner */}
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

            {/* workout-type rows */}
            {WORKOUT_TYPES.map(wt => (
              <div key={wt.key} className="grid grid-cols-8 border-b border-white/5 last:border-0">
                {/* row label */}
                <div className={`flex items-center gap-2 p-3 border-r border-white/5 ${wt.ring.split(' ')[0]}`}>
                  <wt.icon size={14} className={wt.color} />
                  <span className={`text-xs font-semibold ${wt.color} hidden sm:block`}>{wt.label}</span>
                </div>

                {/* cells */}
                {weekDays.map(ds => {
                  const key   = eKey(ds, wt.key);
                  const entry = entries[key];
                  const isT   = ds === today;
                  return (
                    <div key={ds} onClick={() => openCell(ds, wt.key)}
                      className={`group relative p-2 border-l border-white/5 min-h-[80px] transition-colors
                        ${isT ? 'bg-accent/5' : ''}
                        ${!isAccepted ? 'cursor-pointer hover:bg-white/[0.04]' : 'cursor-default'}`}>
                      {entry?.title ? (
                        <div>
                          <p className="text-white text-xs font-medium leading-snug line-clamp-2">{entry.title}</p>
                          {entry.notes &&
                            <p className="text-muted text-xs mt-0.5 line-clamp-1">{entry.notes}</p>}
                          {entry.duration &&
                            <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-xs font-mono ${wt.ring} ${wt.color}`}>
                              {entry.duration} min
                            </span>}
                        </div>
                      ) : (
                        !isAccepted &&
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Plus size={16} className="text-muted" />
                        </div>
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
  function WorkoutCalendar() {
    const year  = calMonth.getFullYear();
    const month = calMonth.getMonth();
    const dim   = new Date(year, month + 1, 0).getDate();
    const offset= firstDayOffset(year, month);
    const cells = Math.ceil((offset + dim) / 7) * 7;

    return (
      <div className="card fade-up-1">
        {/* month nav */}
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
              return <div key={i} className="border border-white/5 min-h-[90px]" />;
            }
            const ds          = `${year}-${String(month+1).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`;
            const dayWorkouts = calEntries[ds] || [];
            const isT         = ds === today;
            const hasWorkouts = dayWorkouts.length > 0;
            const isSel       = selDate === ds;

            return (
              <div key={i} onClick={() => setSelDate(isSel ? null : ds)}
                className={`border border-white/5 p-2 min-h-[90px] cursor-pointer transition-colors
                  ${isT ? 'ring-1 ring-inset ring-accent/40 bg-accent/5' : ''}
                  ${hasWorkouts && !isT ? 'bg-orange-400/5' : ''}
                  ${isSel ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'}`}>
                <p className={`text-xs font-bold mb-1.5 ${isT ? 'text-accent' : hasWorkouts ? 'text-orange-400' : 'text-soft'}`}>
                  {dayNum}
                </p>
                {/* workout-type dots */}
                <div className="flex flex-wrap gap-1">
                  {WORKOUT_TYPES.map(wt => {
                    const has = dayWorkouts.some(e => e.workout_type === wt.key);
                    return has
                      ? <span key={wt.key}
                          className={`w-2 h-2 rounded-full ${wt.dot} flex-shrink-0`}
                          title={wt.label} />
                      : null;
                  })}
                </div>
                {/* first workout preview */}
                {dayWorkouts[0] &&
                  <p className="text-xs text-muted mt-1 line-clamp-2 leading-tight">{dayWorkouts[0].title}</p>}
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
              {WORKOUT_TYPES.map(wt => {
                const e = calEntries[selDate]?.find(x => x.workout_type === wt.key);
                return (
                  <div key={wt.key} className={`rounded-xl p-3 border ${wt.ring}`}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <wt.icon size={12} className={wt.color} />
                      <span className={`text-xs font-semibold ${wt.color}`}>{wt.label}</span>
                    </div>
                    {e ? (
                      <>
                        <p className="text-white text-xs font-medium">{e.title}</p>
                        {e.notes    && <p className="text-muted text-xs mt-0.5">{e.notes}</p>}
                        {e.duration && <p className={`text-xs mt-1 font-mono ${wt.color}`}>{e.duration} min</p>}
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
            No accepted workout plans this month.<br />
            <span className="text-xs">Plan a week and click <strong className="text-white">Accept Plan</strong> to save it here.</span>
          </div>
        )}
      </div>
    );
  }

  // ── edit modal ─────────────────────────────────────────────────────────────
  function EditModal() {
    if (!editCell) return null;
    const wt = WORKOUT_MAP[editCell.workoutType];
    const d  = parseD(editCell.date);
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(9,9,14,0.75)', backdropFilter: 'blur(6px)' }}>
        <div className="card w-full max-w-sm p-5">
          {/* header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className={`flex items-center gap-2 ${wt.color}`}>
                <wt.icon size={16} />
                <span className="font-semibold text-sm">{wt.label}</span>
              </div>
              <p className="text-muted text-xs mt-0.5">
                {d?.toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'short' })}
              </p>
            </div>
            <button onClick={() => setEditCell(null)} className="text-muted hover:text-white transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* fields */}
          <div className="space-y-3">
            <div>
              <label className="label">Workout</label>
              <input className="input w-full mt-1" placeholder="e.g. Morning run"
                value={editData.title} autoFocus
                onChange={e => setEditData(p => ({ ...p, title: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && saveCell()} />
            </div>
            <div>
              <label className="label">Notes <span className="text-muted/50">(optional)</span></label>
              <textarea className="input w-full mt-1 resize-none h-16 text-xs"
                placeholder="Sets, reps, distance, intensity…"
                value={editData.notes}
                onChange={e => setEditData(p => ({ ...p, notes: e.target.value }))} />
            </div>
            <div>
              <label className="label">Duration (min) <span className="text-muted/50">(optional)</span></label>
              <input className="input w-full mt-1" type="number" placeholder="e.g. 45"
                value={editData.duration}
                onChange={e => setEditData(p => ({ ...p, duration: e.target.value }))} />
            </div>
          </div>

          {/* actions */}
          <div className="flex gap-2 mt-4">
            <button onClick={clearCell}
              className="flex-1 py-2 text-sm rounded-xl border border-red-400/20 text-red-400 hover:bg-red-400/10 transition-colors">
              Clear
            </button>
            <button onClick={saveCell} className="btn-primary flex-1 text-sm py-2">
              Save
            </button>
          </div>
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
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">Workouts</h1>
          <p className="text-muted text-xs mt-1 uppercase tracking-widest font-mono">Weekly workout planner & calendar</p>
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
      {!calLoading && view === 'calendar' && <WorkoutCalendar />}

      {/* edit modal */}
      <EditModal />
    </div>
  );
}
