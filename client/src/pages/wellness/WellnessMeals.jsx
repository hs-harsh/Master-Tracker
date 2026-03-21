import { useState, useEffect, useCallback, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import {
  CheckSquare, Utensils, Dumbbell,
  ChevronLeft, ChevronRight,
  Plus, X, Check, Save, Sparkles,
  Coffee, Sun, Moon, Apple, AlertTriangle,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, ReferenceLine, Cell,
} from 'recharts';
import api from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';

// ─── nav ──────────────────────────────────────────────────────────────────────
const SUB_TABS = [
  { to: '/wellness/habits',   label: 'Habits',   icon: CheckSquare },
  { to: '/wellness/meals',    label: 'Meals',    icon: Utensils    },
  { to: '/wellness/workouts', label: 'Workouts', icon: Dumbbell    },
];

// ─── meal types ───────────────────────────────────────────────────────────────
const MEAL_TYPES = [
  { key: 'breakfast', label: 'Breakfast', icon: Coffee, color: 'text-amber-400',   dot: 'bg-amber-400',   ring: 'bg-amber-400/10 border-amber-400/25',   stroke: '#fbbf24' },
  { key: 'lunch',     label: 'Lunch',     icon: Sun,    color: 'text-emerald-400', dot: 'bg-emerald-400', ring: 'bg-emerald-400/10 border-emerald-400/25', stroke: '#34d399' },
  { key: 'dinner',    label: 'Dinner',    icon: Moon,   color: 'text-blue-400',    dot: 'bg-blue-400',    ring: 'bg-blue-400/10 border-blue-400/25',      stroke: '#60a5fa' },
  { key: 'snack',     label: 'Snack',     icon: Apple,  color: 'text-purple-400',  dot: 'bg-purple-400',  ring: 'bg-purple-400/10 border-purple-400/25',  stroke: '#c084fc' },
];
const MEAL_MAP = Object.fromEntries(MEAL_TYPES.map(m => [m.key, m]));

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

function eKey(date, mealType) {
  return `${String(date).slice(0,10)}_${mealType}`;
}

function dateRangeFor(period) {
  const to = todayStr();
  const d  = new Date(to + 'T12:00:00');
  const days = { '1M': 30, '3M': 90, '1Y': 365 }[period] || 30;
  d.setDate(d.getDate() - days);
  return { from: d.toISOString().slice(0, 10), to };
}

// ─── component ────────────────────────────────────────────────────────────────
export default function WellnessMeals() {
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
  const [editData, setEditData] = useState({ title: '', notes: '', calories: '' });
  const [editMode, setEditMode] = useState(false);

  // analytics state
  const [period,    setPeriod]    = useState('1M');
  const [analytics, setAnalytics] = useState(null);
  const [aLoading,  setALoading]  = useState(false);

  // ── load week ──────────────────────────────────────────────────────────────
  const loadWeek = useCallback(async (ws) => {
    setLoading(true);
    try {
      const { data } = await api.get(`/meals/week?week_start=${ws}`);
      setPlan(data.plan);
      const map = {};
      (data.entries || []).forEach(e => {
        map[eKey(e.entry_date, e.meal_type)] = {
          title: e.title || '', notes: e.notes || '',
          calories: e.calories != null ? String(e.calories) : '',
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
      const { data } = await api.get(`/meals/calendar?from=${from}&to=${to}`);
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
          const [date, mealType] = key.split('_');
          return { entry_date: date, meal_type: mealType, ...val };
        });
      await api.put(`/meals/week/${plan.id}`, { entries: toSave });
    } catch (err) { console.error(err); } finally { setSaving(false); }
  }

  async function acceptPlan() {
    if (!plan) return;
    setAccepting(true);
    try {
      await saveEntries();
      const { data } = await api.post(`/meals/week/${plan.id}/accept`);
      setPlan(data.plan);
    } catch (err) { console.error(err); } finally { setAccepting(false); }
  }

  async function generatePlan() {
    if (!plan) return;
    setGenerating(true); setAiError('');
    try {
      const { data } = await api.post(`/meals/week/${plan.id}/generate`, { prompt: aiInputRef.current?.value || '' });
      const map = {};
      (data.entries || []).forEach(e => {
        map[eKey(e.entry_date, e.meal_type)] = {
          title: e.title || '', notes: e.notes || '',
          calories: e.calories != null ? String(e.calories) : '',
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

  function openCell(date, mealType) {
    if (plan?.status === 'accepted') return;
    const existing = entries[eKey(date, mealType)];
    setEditCell({ date, mealType });
    setEditData(existing || { title: '', notes: '', calories: '' });
    setEditMode(!existing?.title);
  }

  function saveCell() {
    if (!editCell) return;
    const key  = eKey(editCell.date, editCell.mealType);
    const next = { ...entries, [key]: { ...editData } };
    setEntries(next); setEditCell(null);
  }

  function clearCell() {
    if (!editCell) return;
    const key  = eKey(editCell.date, editCell.mealType);
    const next = { ...entries }; delete next[key];
    setEntries(next); setEditCell(null);
  }

  const today    = todayStr();
  const weekDays = getWeekDays(weekStart);
  const isAccepted = plan?.status === 'accepted';

  // ── analytics helpers ──────────────────────────────────────────────────────
  function buildMealAnalytics(entries) {
    if (!entries?.length) return null;

    // Group by date
    const byDate = {};
    entries.forEach(e => {
      const ds = String(e.entry_date).slice(0, 10);
      (byDate[ds] = byDate[ds] || []).push(e);
    });

    const dates = Object.keys(byDate).sort();

    // Daily calories + meal count
    const dailyData = dates.map(ds => {
      const dayEntries = byDate[ds];
      const totalCal   = dayEntries.reduce((s, e) => s + (e.calories || 0), 0);
      const mealCount  = dayEntries.length;
      const d = parseD(ds);
      return {
        date: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        Calories: totalCal || null,
        Meals: mealCount,
      };
    });

    // Meal type counts
    const typeCounts = {};
    MEAL_TYPES.forEach(mt => { typeCounts[mt.key] = 0; });
    entries.forEach(e => { typeCounts[e.meal_type] = (typeCounts[e.meal_type] || 0) + 1; });

    const typeBar = MEAL_TYPES.map(mt => ({ name: mt.label, Count: typeCounts[mt.key], fill: mt.stroke }));

    // Avg calories per day (only days with calories logged)
    const calDays = dailyData.filter(d => d.Calories);
    const avgCal  = calDays.length ? Math.round(calDays.reduce((s, d) => s + d.Calories, 0) / calDays.length) : null;

    // Completion rate (% of days with all 4 meal types)
    const fullDays = dates.filter(ds => byDate[ds].length >= 4).length;
    const completionRate = dates.length ? Math.round((fullDays / dates.length) * 100) : 0;

    // Alerts
    const alerts = [];
    const thisWeekStart = getMonday(today);
    const thisWeekDates = dates.filter(ds => ds >= thisWeekStart);
    const thisWeekBreakfasts = thisWeekDates.filter(ds =>
      byDate[ds].some(e => e.meal_type === 'breakfast')
    );
    const skippedBreakfast = thisWeekDates.length - thisWeekBreakfasts.length;
    if (skippedBreakfast > 2) {
      alerts.push({ type: 'warn', msg: `Breakfast skipped ${skippedBreakfast} days this week` });
    }
    if (!calDays.length) {
      alerts.push({ type: 'info', msg: 'Calorie tracking not started — add calories to meal entries for insights' });
    } else if (avgCal < 1500) {
      alerts.push({ type: 'warn', msg: `Avg daily calories ${avgCal} kcal may be too low` });
    } else if (avgCal > 2800) {
      alerts.push({ type: 'warn', msg: `Avg daily calories ${avgCal} kcal is quite high` });
    }
    if (completionRate < 50) {
      alerts.push({ type: 'warn', msg: `Only ${completionRate}% of days have all 4 meals logged` });
    }

    return { dailyData, typeBar, avgCal, completionRate, totalDays: dates.length, fullDays, alerts };
  }

  function CustomTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    return (
      <div className="card p-3 text-xs space-y-1">
        <p className="text-muted font-mono mb-1">{label}</p>
        {payload.map(p => (
          <div key={p.name} className="flex justify-between gap-4">
            <span style={{ color: p.fill || p.color || p.stroke }}>{p.name}</span>
            <span className="text-white font-mono">{p.value ?? '—'}{p.name === 'Calories' ? ' kcal' : ''}</span>
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
                placeholder="e.g. High protein Indian diet, low carb, vegetarian…"
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

            {MEAL_TYPES.map(mt => (
              <div key={mt.key} className="grid grid-cols-8 border-b border-white/5 last:border-0">
                <div className={`flex items-center gap-2 p-3 border-r border-white/5 ${mt.ring.split(' ')[0]}`}>
                  <mt.icon size={14} className={mt.color} />
                  <span className={`text-xs font-semibold ${mt.color} hidden sm:block`}>{mt.label}</span>
                </div>
                {weekDays.map(ds => {
                  const key   = eKey(ds, mt.key);
                  const entry = entries[key];
                  const isT   = ds === today;
                  return (
                    <div key={ds} onClick={() => openCell(ds, mt.key)}
                      className={`group relative p-2 border-l border-white/5 min-h-[80px] transition-colors
                        ${isT ? 'bg-accent/5' : ''}
                        ${!isAccepted ? 'cursor-pointer hover:bg-white/[0.04]' : 'cursor-default'}`}>
                      {entry?.title ? (
                        <div>
                          <p className="text-white text-xs font-medium leading-snug line-clamp-2">{entry.title}</p>
                          {entry.notes &&
                            <p className="text-muted text-xs mt-0.5 line-clamp-1">{entry.notes}</p>}
                          {entry.calories &&
                            <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-xs font-mono ${mt.ring} ${mt.color}`}>
                              {entry.calories} kcal
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

  // ── analytics ──────────────────────────────────────────────────────────────
  function Analytics() {
    if (aLoading) return <div className="text-center py-10 text-muted text-sm">Loading analytics…</div>;

    const data = buildMealAnalytics(analytics);
    if (!data) return (
      <div className="card p-8 text-center text-muted text-sm fade-up-1">
        No accepted meal data for this period. Accept a week plan to see analytics.
      </div>
    );

    return (
      <div className="space-y-4 fade-up-1">
        {/* alerts */}
        {data.alerts.length > 0 && (
          <div className="space-y-2">
            {data.alerts.map((a, i) => (
              <div key={i} className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-sm ${
                a.type === 'info'
                  ? 'bg-blue-400/5 border-blue-400/20 text-blue-300'
                  : 'bg-amber-400/5 border-amber-400/20 text-amber-300'
              }`}>
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />{a.msg}
              </div>
            ))}
          </div>
        )}

        {/* stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card px-4 py-3">
            <p className="text-[10px] text-muted uppercase tracking-wider">Days Planned</p>
            <p className="font-mono text-2xl font-bold text-white">{data.totalDays}</p>
          </div>
          <div className="card px-4 py-3">
            <p className="text-[10px] text-muted uppercase tracking-wider">Full Days (4 meals)</p>
            <p className="font-mono text-2xl font-bold text-emerald-400">{data.fullDays}</p>
          </div>
          <div className="card px-4 py-3">
            <p className="text-[10px] text-muted uppercase tracking-wider">Completion Rate</p>
            <p className={`font-mono text-2xl font-bold ${data.completionRate >= 70 ? 'text-emerald-400' : data.completionRate >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
              {data.completionRate}%
            </p>
          </div>
          <div className="card px-4 py-3">
            <p className="text-[10px] text-muted uppercase tracking-wider">Avg Calories/Day</p>
            <p className="font-mono text-2xl font-bold text-white">
              {data.avgCal != null ? data.avgCal : '—'}
              {data.avgCal && <span className="text-sm text-muted"> kcal</span>}
            </p>
          </div>
        </div>

        {/* calorie trend */}
        {data.dailyData.some(d => d.Calories) && (
          <div className="card p-4">
            <p className="text-xs text-muted uppercase tracking-widest font-mono mb-4">Daily calorie intake</p>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={data.dailyData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={2000} stroke="#f59e0b" strokeDasharray="4 4"
                  label={{ value: '2000 kcal', position: 'right', fontSize: 10, fill: '#f59e0b' }} />
                <Line type="monotone" dataKey="Calories" stroke="#34d399" strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* meals logged per day */}
          <div className="card p-4">
            <p className="text-xs text-muted uppercase tracking-widest font-mono mb-4">Meals logged per day</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.dailyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} interval="preserveStartEnd" />
                <YAxis domain={[0, 4]} ticks={[0,1,2,3,4]} allowDecimals={false} tick={{ fontSize: 10, fill: '#6b7280' }} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={4} stroke="#6b7280" strokeDasharray="3 3" />
                <Bar dataKey="Meals" fill="#60a5fa" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* meal type distribution */}
          <div className="card p-4">
            <p className="text-xs text-muted uppercase tracking-widest font-mono mb-4">Meal type frequency</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.typeBar} layout="vertical" margin={{ top: 4, right: 8, left: 10, bottom: 0 }}>
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: '#6b7280' }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} width={70} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Count" radius={[0,3,3,0]}>
                  {data.typeBar.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* meal type cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {MEAL_TYPES.map(mt => {
            const count = data.typeBar.find(t => t.name === mt.label)?.Count || 0;
            return (
              <div key={mt.key} className={`card px-4 py-3 border ${mt.ring}`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <mt.icon size={11} className={mt.color} />
                  <p className={`text-[10px] uppercase tracking-wider ${mt.color}`}>{mt.label}</p>
                </div>
                <p className={`font-mono text-xl font-bold ${mt.color}`}>{count} <span className="text-xs font-normal">times</span></p>
                <p className="text-[10px] text-muted mt-0.5">
                  {data.totalDays ? `${Math.round((count / data.totalDays) * 100)}% of days` : ''}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── edit modal ─────────────────────────────────────────────────────────────
  function EditModal() {
    if (!editCell) return null;
    const mt = MEAL_MAP[editCell.mealType];
    const d  = parseD(editCell.date);

    const notesLines  = (editData.notes || '').split('\n');
    const firstLine   = notesLines[0] || '';
    const hasMacros   = /protein|carbs|fat/i.test(firstLine);
    const macroChips  = hasMacros ? firstLine.split('|').map(s => s.trim()).filter(Boolean) : [];
    const ingredients = hasMacros ? notesLines.slice(1).join('\n').trim() : editData.notes;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(9,9,14,0.75)', backdropFilter: 'blur(6px)' }}>
        <div className="card w-full max-w-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className={`flex items-center gap-2 ${mt.color}`}>
                <mt.icon size={16} /><span className="font-semibold text-sm">{mt.label}</span>
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
              {editData.calories && (
                <span className={`inline-flex items-center px-2.5 py-1 rounded-lg border text-sm font-mono font-semibold ${mt.ring} ${mt.color} mb-3`}>
                  {editData.calories} kcal
                </span>
              )}
              {macroChips.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {macroChips.map((chip, i) => (
                    <span key={i} className={`px-2 py-0.5 rounded-md text-xs font-mono border ${mt.ring} ${mt.color}`}>{chip}</span>
                  ))}
                </div>
              )}
              {ingredients && (
                <div className="mb-3">
                  <p className="text-[10px] text-muted uppercase tracking-wider mb-1">Ingredients / Notes</p>
                  <p className="text-soft text-xs leading-relaxed whitespace-pre-line">{ingredients}</p>
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
                  <label className="label">Meal</label>
                  <input className="input w-full mt-1" placeholder="e.g. Oatmeal with berries"
                    value={editData.title} autoFocus
                    onChange={e => setEditData(p => ({ ...p, title: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && saveCell()} />
                </div>
                <div>
                  <label className="label">Notes / Ingredients <span className="text-muted/50">(optional)</span></label>
                  <textarea className="input w-full mt-1 resize-none h-20 text-xs"
                    placeholder={'Protein: 30g | Carbs: 45g | Fat: 12g\nIngredients, prep notes…'}
                    value={editData.notes}
                    onChange={e => setEditData(p => ({ ...p, notes: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Calories <span className="text-muted/50">(optional)</span></label>
                  <input className="input w-full mt-1" type="number" placeholder="e.g. 350"
                    value={editData.calories}
                    onChange={e => setEditData(p => ({ ...p, calories: e.target.value }))} />
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
            {currentPerson ? `${currentPerson}'s Meals` : 'Meals'}
          </h1>
          <p className="text-muted text-xs mt-1 uppercase tracking-widest font-mono">Weekly meal planner & analytics</p>
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
