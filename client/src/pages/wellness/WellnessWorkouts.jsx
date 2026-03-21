import { useState, useEffect, useCallback, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import {
  CheckSquare, Utensils, Dumbbell,
  ChevronLeft, ChevronRight,
  Plus, X, Check, Save, Sparkles,
  Zap, Activity, Wind, Moon, AlertTriangle,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, CartesianGrid,
} from 'recharts';
import api from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';

// ─── nav ──────────────────────────────────────────────────────────────────────
const SUB_TABS = [
  { to: '/wellness/habits',   label: 'Habits',   icon: CheckSquare },
  { to: '/wellness/meals',    label: 'Meals',    icon: Utensils    },
  { to: '/wellness/workouts', label: 'Workouts', icon: Dumbbell    },
];

// ─── workout types ────────────────────────────────────────────────────────────
const WORKOUT_TYPES = [
  { key: 'cardio',      label: 'Cardio',      icon: Zap,      color: 'text-orange-400', dot: 'bg-orange-400',  ring: 'bg-orange-400/10 border-orange-400/25',  stroke: '#fb923c' },
  { key: 'strength',    label: 'Strength',    icon: Dumbbell, color: 'text-red-400',    dot: 'bg-red-400',     ring: 'bg-red-400/10 border-red-400/25',        stroke: '#f87171' },
  { key: 'flexibility', label: 'Flexibility', icon: Wind,     color: 'text-teal-400',   dot: 'bg-teal-400',    ring: 'bg-teal-400/10 border-teal-400/25',      stroke: '#2dd4bf' },
  { key: 'rest',        label: 'Rest',        icon: Moon,     color: 'text-purple-400', dot: 'bg-purple-400',  ring: 'bg-purple-400/10 border-purple-400/25',  stroke: '#c084fc' },
];
const WORKOUT_MAP = Object.fromEntries(WORKOUT_TYPES.map(w => [w.key, w]));

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

function fmtDayHeader(ds) {
  const d = parseD(ds);
  return {
    wd:  d.toLocaleDateString('en-IN', { weekday: 'short' }),
    day: d.getDate(),
    mo:  d.toLocaleDateString('en-IN', { month: 'short' }),
  };
}

function eKey(date, workoutType) {
  return `${String(date).slice(0,10)}_${workoutType}`;
}

function dateRangeFor(period) {
  const to = todayStr();
  const d  = new Date(to + 'T12:00:00');
  const days = { '1M': 30, '3M': 90, '1Y': 365 }[period] || 30;
  d.setDate(d.getDate() - days);
  return { from: d.toISOString().slice(0, 10), to };
}

// ─── component ────────────────────────────────────────────────────────────────
export default function WellnessWorkouts() {
  const { personName, activePerson } = useAuth();
  const currentPerson = activePerson || personName;

  // planner state
  const [view,      setView]      = useState('planner');
  const [weekStart, setWeekStart] = useState(() => getMonday(todayStr()));
  const [plan,      setPlan]      = useState(null);
  const [entries,   setEntries]   = useState({});
  const [loading,    setLoading]   = useState(false);
  const [saving,     setSaving]    = useState(false);
  const [accepting,  setAccepting] = useState(false);
  const [generating, setGenerating]= useState(false);
  const [aiError,    setAiError]   = useState('');
  const aiInputRef = useRef(null);

  // cell edit modal
  const [editCell, setEditCell] = useState(null);
  const [editData, setEditData] = useState({ title: '', notes: '', duration: '' });
  const [editMode, setEditMode] = useState(false);

  // analytics state
  const [period,    setPeriod]    = useState('1M');
  const [analytics, setAnalytics] = useState(null);
  const [aLoading,  setALoading]  = useState(false);

  // ── load week ──────────────────────────────────────────────────────────────
  const loadWeek = useCallback(async (ws) => {
    setLoading(true);
    try {
      const { data } = await api.get(`/workouts/week?week_start=${ws}`);
      setPlan(data.plan);
      const map = {};
      (data.entries || []).forEach(e => {
        map[eKey(e.entry_date, e.workout_type)] = {
          title: e.title || '', notes: e.notes || '',
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

  // ── load analytics ─────────────────────────────────────────────────────────
  const loadAnalytics = useCallback(async (p) => {
    setALoading(true);
    try {
      const { from, to } = dateRangeFor(p);
      const { data } = await api.get(`/workouts/calendar?from=${from}&to=${to}`);
      setAnalytics(data.entries || []);
    } catch (err) {
      setAnalytics([]);
    } finally {
      setALoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === 'analytics') loadAnalytics(period);
  }, [view, period, loadAnalytics]);

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
    } catch (err) { console.error(err); } finally { setSaving(false); }
  }

  async function acceptPlan() {
    if (!plan) return;
    setAccepting(true);
    try {
      await saveEntries();
      const { data } = await api.post(`/workouts/week/${plan.id}/accept`);
      setPlan(data.plan);
    } catch (err) { console.error(err); } finally { setAccepting(false); }
  }

  async function generatePlan() {
    if (!plan) return;
    setGenerating(true); setAiError('');
    try {
      const { data } = await api.post(`/workouts/week/${plan.id}/generate`, { prompt: aiInputRef.current?.value || '' });
      const map = {};
      (data.entries || []).forEach(e => {
        map[eKey(e.entry_date, e.workout_type)] = {
          title: e.title || '', notes: e.notes || '',
          duration: e.duration != null ? String(e.duration) : '',
        };
      });
      setEntries(map);
    } catch (err) {
      setAiError(err.response?.data?.error || 'Generation failed. Check your API key in Settings.');
    } finally { setGenerating(false); }
  }

  function shiftWeek(dir) {
    const d = new Date(weekStart + 'T12:00:00');
    d.setDate(d.getDate() + dir * 7);
    setWeekStart(d.toISOString().slice(0, 10));
  }

  function openCell(date, workoutType) {
    if (plan?.status === 'accepted') return;
    const existing = entries[eKey(date, workoutType)];
    setEditCell({ date, workoutType });
    setEditData(existing || { title: '', notes: '', duration: '' });
    setEditMode(!existing?.title);
  }

  function saveCell() {
    if (!editCell) return;
    const key  = eKey(editCell.date, editCell.workoutType);
    const next = { ...entries, [key]: { ...editData } };
    setEntries(next); setEditCell(null);
  }

  function clearCell() {
    if (!editCell) return;
    const key  = eKey(editCell.date, editCell.workoutType);
    const next = { ...entries }; delete next[key];
    setEntries(next); setEditCell(null);
  }

  const today    = todayStr();
  const weekDays = getWeekDays(weekStart);
  const isAccepted = plan?.status === 'accepted';

  // ── analytics helpers ──────────────────────────────────────────────────────
  function buildWorkoutAnalytics(entries) {
    if (!entries?.length) return null;

    // Type counts + total duration
    const typeCounts  = {};
    const typeDuration= {};
    WORKOUT_TYPES.forEach(wt => { typeCounts[wt.key] = 0; typeDuration[wt.key] = 0; });
    entries.forEach(e => {
      typeCounts[e.workout_type]  = (typeCounts[e.workout_type]  || 0) + 1;
      typeDuration[e.workout_type]= (typeDuration[e.workout_type]|| 0) + (e.duration || 0);
    });

    // Weekly session counts
    const weekMap = {};
    entries.forEach(e => {
      const ws = getMonday(e.entry_date);
      weekMap[ws] = (weekMap[ws] || 0) + 1;
    });
    const weekData = Object.entries(weekMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ws, count]) => {
        const d = parseD(ws);
        return { week: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), Sessions: count };
      });

    // Pie data
    const pieData = WORKOUT_TYPES
      .filter(wt => typeCounts[wt.key] > 0)
      .map(wt => ({ name: wt.label, value: typeCounts[wt.key], fill: wt.stroke }));

    // Alerts
    const alerts = [];
    const thisWeekStart = getMonday(today);
    const thisWeekEntries = entries.filter(e => getMonday(e.entry_date) === thisWeekStart);
    const thisWeekTypes = new Set(thisWeekEntries.map(e => e.workout_type));
    ['cardio', 'strength'].forEach(t => {
      if (!thisWeekTypes.has(t)) {
        const wt = WORKOUT_MAP[t];
        alerts.push({ type: 'warn', msg: `No ${wt.label} logged this week` });
      }
    });
    if (thisWeekEntries.length === 0) {
      alerts.push({ type: 'warn', msg: 'No workouts logged this week yet' });
    }

    const totalSessions = entries.length;
    const totalDuration = Object.values(typeDuration).reduce((a, b) => a + b, 0);
    const avgDuration   = totalSessions ? Math.round(totalDuration / totalSessions) : 0;

    return { typeCounts, typeDuration, weekData, pieData, alerts, totalSessions, totalDuration, avgDuration };
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
          <div className="flex gap-2">
            {isAccepted ? (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-400/10 text-emerald-400 text-xs font-semibold border border-emerald-400/20">
                <Check size={13} /> Plan Accepted — saved to calendar
              </span>
            ) : (
              <>
                <button onClick={() => saveEntries()} disabled={saving}
                  className="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5">
                  <Save size={13} />{saving ? 'Saving…' : 'Save Draft'}
                </button>
                <button onClick={acceptPlan} disabled={accepting || saving}
                  className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5">
                  <Check size={13} />{accepting ? 'Saving…' : 'Accept Plan'}
                </button>
              </>
            )}
          </div>
        </div>

        {!isAccepted && (
          <div className="p-3 border-b border-white/5 bg-white/[0.02]">
            <div className="flex gap-2 items-center">
              <div className="flex items-center gap-1.5 text-xs text-purple-400 font-semibold shrink-0">
                <Sparkles size={13} />AI
              </div>
              <input ref={aiInputRef} className="input flex-1 text-xs py-1.5"
                placeholder="e.g. Push Pull Legs, 5-day PPL, home workout, weight loss…"
                defaultValue=""
                onKeyDown={e => e.key === 'Enter' && !generating && generatePlan()} />
              <button onClick={generatePlan} disabled={generating}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                  bg-purple-500/20 text-purple-300 border border-purple-500/30
                  hover:bg-purple-500/30 transition-colors disabled:opacity-50">
                <Sparkles size={12} />{generating ? 'Generating…' : 'Generate'}
              </button>
            </div>
            {aiError && <p className="text-xs text-red-400 mt-1.5">{aiError}</p>}
          </div>
        )}

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

            {WORKOUT_TYPES.map(wt => (
              <div key={wt.key} className="grid grid-cols-8 border-b border-white/5 last:border-0">
                <div className={`flex items-center gap-2 p-3 border-r border-white/5 ${wt.ring.split(' ')[0]}`}>
                  <wt.icon size={14} className={wt.color} />
                  <span className={`text-xs font-semibold ${wt.color} hidden sm:block`}>{wt.label}</span>
                </div>
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
                          {entry.duration &&
                            <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono ${wt.ring} ${wt.color}`}>
                              {entry.duration} min
                            </span>}
                          {entry.notes &&
                            <p className="text-muted text-[10px] mt-1 line-clamp-3 leading-snug">{entry.notes}</p>}
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

  // ── analytics ──────────────────────────────────────────────────────────────
  function Analytics() {
    if (aLoading) return <div className="text-center py-10 text-muted text-sm">Loading analytics…</div>;

    const data = buildWorkoutAnalytics(analytics);
    if (!data || data.totalSessions === 0) return (
      <div className="card p-8 text-center text-muted text-sm fade-up-1">
        No accepted workout data for this period. Accept a week plan to see analytics.
      </div>
    );

    return (
      <div className="space-y-4 fade-up-1">
        {/* alerts */}
        {data.alerts.length > 0 && (
          <div className="space-y-2">
            {data.alerts.map((a, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3 rounded-xl border bg-amber-400/5 border-amber-400/20 text-amber-300 text-sm">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />{a.msg}
              </div>
            ))}
          </div>
        )}

        {/* stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card px-4 py-3">
            <p className="text-[10px] text-muted uppercase tracking-wider">Total Sessions</p>
            <p className="font-mono text-2xl font-bold text-white">{data.totalSessions}</p>
          </div>
          <div className="card px-4 py-3">
            <p className="text-[10px] text-muted uppercase tracking-wider">Total Duration</p>
            <p className="font-mono text-2xl font-bold text-white">{data.totalDuration}<span className="text-sm text-muted"> min</span></p>
          </div>
          <div className="card px-4 py-3">
            <p className="text-[10px] text-muted uppercase tracking-wider">Avg Duration</p>
            <p className="font-mono text-2xl font-bold text-white">{data.avgDuration}<span className="text-sm text-muted"> min</span></p>
          </div>
          <div className="card px-4 py-3">
            <p className="text-[10px] text-muted uppercase tracking-wider">Weeks Active</p>
            <p className="font-mono text-2xl font-bold text-white">{data.weekData.length}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* weekly sessions bar */}
          <div className="card p-4">
            <p className="text-xs text-muted uppercase tracking-widest font-mono mb-4">Sessions per week</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.weekData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#6b7280' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#6b7280' }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Sessions" fill="#fb923c" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* type breakdown pie */}
          <div className="card p-4">
            <p className="text-xs text-muted uppercase tracking-widest font-mono mb-4">Workout type breakdown</p>
            {data.pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={data.pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                    dataKey="value" nameKey="name" paddingAngle={3}>
                    {data.pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="text-muted text-sm text-center py-8">No data</p>}
          </div>
        </div>

        {/* type session counts */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {WORKOUT_TYPES.map(wt => (
            <div key={wt.key} className={`card px-4 py-3 border ${wt.ring}`}>
              <div className="flex items-center gap-1.5 mb-1">
                <wt.icon size={11} className={wt.color} />
                <p className={`text-[10px] uppercase tracking-wider ${wt.color}`}>{wt.label}</p>
              </div>
              <p className={`font-mono text-xl font-bold ${wt.color}`}>{data.typeCounts[wt.key] || 0} <span className="text-xs font-normal">sessions</span></p>
              {data.typeDuration[wt.key] > 0 &&
                <p className="text-[10px] text-muted mt-0.5">{data.typeDuration[wt.key]} min total</p>}
            </div>
          ))}
        </div>
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
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className={`flex items-center gap-2 ${wt.color}`}>
                <wt.icon size={16} /><span className="font-semibold text-sm">{wt.label}</span>
              </div>
              <p className="text-muted text-xs mt-0.5">
                {d?.toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'short' })}
              </p>
            </div>
            <button onClick={() => setEditCell(null)} className="text-muted hover:text-white transition-colors">
              <X size={16} />
            </button>
          </div>

          {!editMode && editData.title ? (
            <>
              <p className="text-white text-base font-bold leading-snug mb-3">{editData.title}</p>
              {editData.duration && (
                <span className={`inline-flex items-center px-2.5 py-1 rounded-lg border text-sm font-mono font-semibold ${wt.ring} ${wt.color} mb-3`}>
                  {editData.duration} min
                </span>
              )}
              {editData.notes && (
                <div className="mb-3">
                  <p className="text-[10px] text-muted uppercase tracking-wider mb-1.5">Exercises / Notes</p>
                  <div className="space-y-1">
                    {editData.notes.split('\n').filter(Boolean).map((line, i) => (
                      <p key={i} className="text-soft text-xs leading-relaxed">{line}</p>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2 mt-2">
                <button onClick={clearCell} className="flex-1 py-2 text-sm rounded-xl border border-red-400/20 text-red-400 hover:bg-red-400/10 transition-colors">Clear</button>
                <button onClick={() => setEditMode(true)} className="btn-primary flex-1 text-sm py-2">Edit</button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-3">
                <div>
                  <label className="label">Workout</label>
                  <input className="input w-full mt-1" placeholder="e.g. Push Day — Chest & Triceps"
                    value={editData.title} autoFocus
                    onChange={e => setEditData(p => ({ ...p, title: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && saveCell()} />
                </div>
                <div>
                  <label className="label">Exercises / Notes <span className="text-muted/50">(optional)</span></label>
                  <textarea className="input w-full mt-1 resize-none h-24 text-xs"
                    placeholder={'Bench Press: 4x8 @ 80kg\nIncline DB Press: 3x10\nTricep Pushdowns: 3x12'}
                    value={editData.notes}
                    onChange={e => setEditData(p => ({ ...p, notes: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Duration (min) <span className="text-muted/50">(optional)</span></label>
                  <input className="input w-full mt-1" type="number" placeholder="e.g. 60"
                    value={editData.duration}
                    onChange={e => setEditData(p => ({ ...p, duration: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={clearCell} className="flex-1 py-2 text-sm rounded-xl border border-red-400/20 text-red-400 hover:bg-red-400/10 transition-colors">Clear</button>
                <button onClick={saveCell} className="btn-primary flex-1 text-sm py-2">Save</button>
              </div>
            </>
          )}
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
          <p className="text-muted text-xs mt-1 uppercase tracking-widest font-mono">Weekly workout planner & analytics</p>
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

      {!loading && view === 'planner'  && <Planner />}
      {           view === 'analytics' && <Analytics />}

      <EditModal />
    </div>
  );
}
