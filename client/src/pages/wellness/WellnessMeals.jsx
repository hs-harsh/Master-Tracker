import { useState, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import {
  CheckSquare, Utensils, Dumbbell,
  ChevronLeft, ChevronRight,
  Plus, X, Check, Save, Sparkles, Copy,
  Coffee, Sun, Moon, Apple,
  ChevronDown, ChevronUp, RefreshCw, Mail,
} from 'lucide-react';
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

const MAX_PREFERENCES = 8;

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

/** Mobile / PDF day title e.g. "Mon, 6 Apr" */
function fmtDayLine(ds) {
  const h = fmtDayHeader(ds);
  return `${h.wd}, ${h.day} ${h.mo}`;
}

/**
 * Split notes into macro badges (first line, pipe-separated) + description body.
 * Matches AI format: "P 22g | C 35g | F 8g" or "Protein: 22g | …"
 */
function parseMealNotes(notes) {
  const raw = (notes || '').trim();
  if (!raw) return { macroLabels: [], description: '' };
  const lines = raw.split('\n');
  const first = (lines[0] || '').trim();
  const body = lines.slice(1).join('\n').trim();
  const looksMacro =
    first.includes('|') &&
    /\b(protein|carbs?|fat|P\s*[\d.:]|C\s*[\d.:]|F\s*[\d.:])/i.test(first);
  if (!looksMacro) {
    return { macroLabels: [], description: raw };
  }
  const segs = first.split('|').map((s) => s.trim()).filter(Boolean);
  const macroLabels = segs.map((seg) => {
    const s = seg.trim();
    let m = s.match(/^protein:?\s*(.+)$/i);
    if (m) return `Protein: ${m[1].trim()}`;
    m = s.match(/^P:?\s*(.+)$/i);
    if (m) return `Protein: ${m[1].trim()}`;
    m = s.match(/^carbs?:?\s*(.+)$/i);
    if (m) return `Carbs: ${m[1].trim()}`;
    if (/^C\b/i.test(s)) return `Carbs: ${s.replace(/^C\s*:?\s*/i, '').trim()}`;
    m = s.match(/^fat:?\s*(.+)$/i);
    if (m) return `Fat: ${m[1].trim()}`;
    if (/^F\b/i.test(s)) return `Fat: ${s.replace(/^F\s*:?\s*/i, '').trim()}`;
    return s;
  });
  return { macroLabels, description: body };
}

/** Shared meal body: title, kcal + macro badges, description (matches mobile card layout). */
function MealPlanCardContent({ entry, compact }) {
  const { macroLabels, description } = parseMealNotes(entry?.notes || '');
  const tTitle = compact ? 'text-xs' : 'text-sm';
  return (
    <>
      <p className={`text-white font-semibold leading-snug break-words ${tTitle}`}>{entry.title}</p>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {entry.calories ? (
          <span className="px-2 py-0.5 rounded-md text-[11px] font-mono border border-accent/45 text-accent bg-accent/10">
            {entry.calories} kcal
          </span>
        ) : null}
        {macroLabels.map((lab, i) => (
          <span
            key={i}
            className="px-2 py-0.5 rounded-md text-[11px] font-mono border border-emerald-500/45 text-emerald-300 bg-emerald-500/10"
          >
            {lab}
          </span>
        ))}
      </div>
      {description ? (
        <p className="text-muted text-xs mt-2 leading-relaxed whitespace-pre-line break-words">{description}</p>
      ) : null}
    </>
  );
}

function eKey(date, mealType) {
  return `${String(date).slice(0,10)}_${mealType}`;
}

// ── Preference helpers — localStorage cache + DB persistence ─────────────────
function lsKey(person) { return `meal_prompts_${person || 'default'}`; }
function loadPreferences(person) {
  try { return JSON.parse(localStorage.getItem(lsKey(person)) || '[]'); } catch { return []; }
}
function cachePreferences(person, prefs) {
  try { localStorage.setItem(lsKey(person), JSON.stringify(prefs)); } catch {}
}

function nutritionTagClass(tag) {
  const t = String(tag).toLowerCase();
  if (t.includes('protein')) return 'bg-teal-500/15 text-teal-300 border-teal-500/30';
  if (t.includes('fibre') || t.includes('fiber')) return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  if (t.includes('healthy fat')) return 'bg-amber-500/15 text-amber-200 border-amber-500/30';
  if (t.includes('iron')) return 'bg-rose-500/15 text-rose-200 border-rose-500/30';
  if (t.includes('calcium')) return 'bg-sky-500/15 text-sky-200 border-sky-500/30';
  if (t.includes('complex') || t.includes('carb')) return 'bg-violet-500/15 text-violet-200 border-violet-500/30';
  if (t.includes('vitamin')) return 'bg-lime-500/15 text-lime-200 border-lime-500/30';
  return 'bg-white/5 text-muted border-white/10';
}

// ─── component ────────────────────────────────────────────────────────────────
const MEAL_NOTIFY_EMAIL = 'harshsingh.iitd@gmail.com';

export default function WellnessMeals() {
  const { personName, activePerson } = useAuth();
  const currentPerson = activePerson || personName;

  // planner state
  const [view,      setView]      = useState('ideas');
  const [weekStart, setWeekStart] = useState(() => getMonday(todayStr()));
  const [plan,      setPlan]      = useState(null);
  const [entries,   setEntries]   = useState({});
  const [loading,    setLoading]   = useState(false);
  const [saving,     setSaving]    = useState(false);
  const [accepting,  setAccepting] = useState(false);
  const [generating, setGenerating]= useState(false);
  const [aiError,    setAiError]   = useState('');
  const [resetting,  setResetting] = useState(false);
  const [reasoning,  setReasoning] = useState('');
  const [showReasoning, setShowReasoning] = useState(false);

  // Prompt state (top-level — never inside inner functions)
  const [aiPrompt,     setAiPrompt]    = useState('');
  const [preferences,  setPreferences] = useState(() => loadPreferences(activePerson || personName));
  const [copiedPref,   setCopiedPref]  = useState(null);

  const [refreshingCell, setRefreshingCell] = useState(null); // 'date_mealtype' key

  // cell edit modal
  const [editCell, setEditCell] = useState(null);
  const [editData, setEditData] = useState({ title: '', notes: '', calories: '' });
  const [editMode, setEditMode] = useState(false);
  const [nutritionByKey, setNutritionByKey] = useState({});
  const [nutritionLoadingKey, setNutritionLoadingKey] = useState(null);
  const [emailSending, setEmailSending] = useState(false);

  // healthy ideas state
  const [ideas, setIdeas] = useState({ breakfast_snacks: [], lunch_dinner: [] });
  const [ideasLoading, setIdeasLoading] = useState(false);
  const [ideaDrafts, setIdeaDrafts] = useState({ breakfast_snacks: '', lunch_dinner: '' });
  const [ideaSaving, setIdeaSaving] = useState(null); // category being saved
  const [expandedIdeaSections, setExpandedIdeaSections] = useState(new Set(['breakfast_snacks', 'lunch_dinner']));

  // Reload preferences when person changes — instant from cache, then hydrate from DB
  useEffect(() => {
    const cached = loadPreferences(currentPerson);
    setPreferences(cached);
    setAiPrompt('');
    api.get(`/settings/wellness-prefs?type=meal&person=${encodeURIComponent(currentPerson || '')}`)
      .then(r => {
        const dbPrefs = r.data?.prefs;
        if (Array.isArray(dbPrefs) && dbPrefs.length > 0) {
          // DB has data — use it as source of truth
          setPreferences(dbPrefs);
          cachePreferences(currentPerson, dbPrefs);
        } else if (cached.length > 0) {
          // DB is empty but localStorage has prefs — push them up to DB
          api.put('/settings/wellness-prefs', { type: 'meal', person: currentPerson || '', prefs: cached }).catch(() => {});
        }
      })
      .catch(() => {}); // silently keep cache on network error
  }, [currentPerson]);

  // ── load week ──────────────────────────────────────────────────────────────
  const loadWeek = useCallback(async (ws, person) => {
    setLoading(true);
    try {
      const { data } = await api.get(`/meals/week?week_start=${ws}&person=${encodeURIComponent(person || '')}`);
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

  useEffect(() => { loadWeek(weekStart, currentPerson); }, [weekStart, currentPerson, loadWeek]);

  // ── healthy ideas ────────────────────────────────────────────────────────────
  const loadIdeas = useCallback(async (person) => {
    setIdeasLoading(true);
    try {
      const { data } = await api.get(`/meals/ideas?person=${encodeURIComponent(person || '')}`);
      setIdeas({ breakfast_snacks: data.breakfast_snacks || [], lunch_dinner: data.lunch_dinner || [] });
    } catch (err) {
      console.error(err);
    } finally {
      setIdeasLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === 'ideas') loadIdeas(currentPerson);
  }, [view, currentPerson, loadIdeas]);

  const toggleIdeaSection = (category) => setExpandedIdeaSections(prev => {
    const next = new Set(prev);
    next.has(category) ? next.delete(category) : next.add(category);
    return next;
  });

  const addIdea = async (category) => {
    const text = (ideaDrafts[category] || '').trim();
    if (!text) return;
    setIdeaSaving(category);
    try {
      const { data } = await api.post('/meals/ideas', { person: currentPerson || '', category, text });
      setIdeas(prev => ({ ...prev, [category]: [data, ...prev[category]] }));
      setIdeaDrafts(prev => ({ ...prev, [category]: '' }));
    } catch (err) {
      console.error(err);
    } finally {
      setIdeaSaving(null);
    }
  };

  const deleteIdea = async (category, id) => {
    setIdeas(prev => ({ ...prev, [category]: prev[category].filter(i => i.id !== id) }));
    try {
      await api.delete(`/meals/ideas/${id}`);
    } catch (err) {
      console.error(err);
      loadIdeas(currentPerson); // resync on failure
    }
  };

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

  function savePrefsToDBAsync(person, prefs) {
    api.put('/settings/wellness-prefs', { type: 'meal', person: person || '', prefs }).catch(() => {});
  }

  function addPreference(text) {
    if (!text.trim()) return;
    const next = [text, ...preferences.filter(p => p !== text)].slice(0, MAX_PREFERENCES);
    setPreferences(next);
    cachePreferences(currentPerson, next);
    savePrefsToDBAsync(currentPerson, next);
  }
  function deletePreference(text) {
    const next = preferences.filter(p => p !== text);
    setPreferences(next);
    cachePreferences(currentPerson, next);
    savePrefsToDBAsync(currentPerson, next);
  }

  async function generatePlan() {
    if (!plan) return;
    setGenerating(true); setAiError(''); setReasoning(''); setShowReasoning(false);
    const combined = aiPrompt.trim() || 'Healthy balanced diet';
    if (aiPrompt.trim()) addPreference(aiPrompt.trim());
    try {
      const { data } = await api.post(`/meals/week/${plan.id}/generate`, { prompt: combined || 'Balanced healthy diet' });
      const map = {};
      (data.entries || []).forEach(e => {
        map[eKey(e.entry_date, e.meal_type)] = {
          title: e.title || '', notes: e.notes || '',
          calories: e.calories != null ? String(e.calories) : '',
        };
      });
      setEntries(map);
      if (data.reasoning) { setReasoning(data.reasoning); setShowReasoning(true); }
    } catch (err) {
      setAiError(err.response?.data?.error || 'Generation failed. Check your API key in Settings.');
    } finally { setGenerating(false); }
  }

  async function resetPlan() {
    if (!plan || !confirm('Reset this plan to draft? You can then edit or regenerate it.')) return;
    setResetting(true);
    try {
      const { data } = await api.post(`/meals/week/${plan.id}/reset`);
      setPlan(data.plan);
    } catch (err) { console.error(err); } finally { setResetting(false); }
  }

  function shiftWeek(dir) {
    const d = new Date(weekStart + 'T12:00:00');
    d.setDate(d.getDate() + dir * 7);
    setWeekStart(d.toISOString().slice(0, 10));
  }

  function openCell(date, mealType) {
    const existing = entries[eKey(date, mealType)];
    if (plan?.status === 'accepted' && !existing?.title) return;
    const readOnly = plan?.status === 'accepted';
    setEditCell({ date, mealType, readOnly });
    setEditData(existing || { title: '', notes: '', calories: '' });
    setEditMode(!existing?.title && !readOnly);
  }

  function saveCell() {
    if (!editCell || editCell.readOnly) return;
    const key  = eKey(editCell.date, editCell.mealType);
    const next = { ...entries, [key]: { ...editData } };
    setEntries(next); setEditCell(null);
  }

  function clearCell() {
    if (!editCell || editCell.readOnly) return;
    const key  = eKey(editCell.date, editCell.mealType);
    const next = { ...entries }; delete next[key];
    setEntries(next); setEditCell(null);
  }

  async function refreshEntry(date, mealType) {
    if (!plan || plan.status === 'accepted') return;
    const key = eKey(date, mealType);
    setRefreshingCell(key);
    // Build current week entries from local state to send as context
    const currentEntriesPayload = Object.entries(entries).map(([k, v]) => ({
      entry_date: k.slice(0, 10),
      meal_type: k.slice(11),
      title: v.title,
    })).filter(e => e.title);
    try {
      const { data } = await api.post(`/meals/week/${plan.id}/regenerate-entry`, {
        entry_date: date,
        meal_type: mealType,
        current_entries: currentEntriesPayload,
        current_meal: entries[key]?.title || null,
      });
      if (data?.entry) {
        setEntries(prev => ({ ...prev, [key]: { title: data.entry.title || '', notes: data.entry.notes || '', calories: data.entry.calories != null ? String(data.entry.calories) : '' } }));
      }
    } catch (err) {
      console.error('refresh entry failed', err);
    } finally {
      setRefreshingCell(null);
    }
  }

  async function fetchNutritionBreakdown() {
    if (!editCell || !editData.title?.trim()) return;
    const key = eKey(editCell.date, editCell.mealType);
    setNutritionLoadingKey(key);
    try {
      const { data } = await api.post('/meals/nutrition-breakdown', {
        title: editData.title.trim(),
        notes: editData.notes || '',
      });
      setNutritionByKey((prev) => ({ ...prev, [key]: data }));
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Could not fetch nutrition');
    } finally {
      setNutritionLoadingKey(null);
    }
  }

  async function sendMealPlanEmail() {
    if (!plan) return;
    setEmailSending(true);
    try {
      if (plan.status !== 'accepted') await saveEntries();
      const { data } = await api.post(`/meals/week/${plan.id}/send-email`, {});
      alert(`Meal plan emailed to ${data.sentTo || MEAL_NOTIFY_EMAIL} (PDF attached).`);
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Failed to send email');
    } finally {
      setEmailSending(false);
    }
  }

  const today    = todayStr();
  const weekDays = getWeekDays(weekStart);
  const isAccepted = plan?.status === 'accepted';

  const hasPlanContent = weekDays.some((ds) =>
    MEAL_TYPES.some((mt) => (entries[eKey(ds, mt.key)]?.title || '').trim().length > 0),
  );

  // ── planner ────────────────────────────────────────────────────────────────
  function Planner() {
    return (
      <div className="card fade-up-1 overflow-hidden">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between p-4 border-b border-white/5">
          <div className="flex items-center justify-center sm:justify-start gap-2 min-w-0">
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
          <div className="flex flex-col items-stretch gap-3 w-full sm:w-auto sm:items-end">
            <div className="flex gap-2 flex-wrap justify-center sm:justify-end items-center w-full">
              {isAccepted ? (
                <>
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-400/10 text-emerald-400 text-xs font-semibold border border-emerald-400/20">
                    <Check size={13} /> Plan Accepted — saved to calendar
                  </span>
                  <button onClick={resetPlan} disabled={resetting}
                    title="Reset to draft so you can edit or regenerate"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                      border border-white/15 text-soft hover:text-white hover:border-white/30 transition-colors disabled:opacity-50">
                    <RefreshCw size={12} />{resetting ? 'Resetting…' : 'Reset Plan'}
                  </button>
                  {hasPlanContent && (
                    <button
                      type="button"
                      onClick={sendMealPlanEmail}
                      disabled={emailSending}
                      title={`Email plan + PDF to ${MEAL_NOTIFY_EMAIL}`}
                      className="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5 shrink-0 disabled:opacity-40"
                    >
                      <Mail size={12} />
                      {emailSending ? 'Sending…' : 'Send email'}
                    </button>
                  )}
                </>
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
                  {hasPlanContent && (
                    <button
                      type="button"
                      onClick={sendMealPlanEmail}
                      disabled={emailSending}
                      title={`Email plan + PDF to ${MEAL_NOTIFY_EMAIL}`}
                      className="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5 shrink-0 disabled:opacity-40"
                    >
                      <Mail size={12} />
                      {emailSending ? 'Sending…' : 'Send email'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {!isAccepted && (
          <div className="p-3 border-b border-white/5 bg-white/[0.02] space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex items-center gap-1.5 text-xs text-purple-400 font-semibold shrink-0">
                <Sparkles size={13} />AI
              </div>
              <input
                className="input w-full flex-1 text-xs py-2 sm:py-1.5 min-w-0"
                placeholder="e.g. High protein Indian diet, low carb, vegetarian…"
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); generatePlan(); } }}
              />
              <button onClick={generatePlan} disabled={generating}
                className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg text-xs font-semibold
                  bg-purple-500/20 text-purple-300 border border-purple-500/30
                  hover:bg-purple-500/30 transition-colors disabled:opacity-50">
                <Sparkles size={12} />{generating ? 'Generating…' : 'Generate'}
              </button>
            </div>
            {/* Saved Preferences chips — all always sent to AI; × to remove */}
            {preferences.length > 0 && (
              <div>
                <p className="text-[10px] text-muted uppercase tracking-widest font-mono mb-1.5">Saved Preferences <span className="normal-case text-purple-400/60">(all applied on generate)</span></p>
                <div className="flex flex-wrap gap-1.5">
                  {preferences.map((pref, i) => (
                    <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300 text-xs group">
                      <button
                        onClick={() => { navigator.clipboard.writeText(pref); setCopiedPref(pref); setTimeout(() => setCopiedPref(null), 1500); }}
                        className="truncate max-w-[160px] text-left hover:text-white transition-colors"
                        title="Click to copy">
                        {copiedPref === pref
                          ? <span className="flex items-center gap-1 text-teal-400"><Check size={10} />Copied</span>
                          : <span className="flex items-center gap-1">{pref}<Copy size={9} className="opacity-0 group-hover:opacity-50 flex-shrink-0" /></span>
                        }
                      </button>
                      <button
                        onClick={() => deletePreference(pref)}
                        className="text-purple-400/60 hover:text-red-400 transition-colors ml-0.5 flex-shrink-0"
                        title="Remove preference">
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {aiError && <p className="text-xs text-red-400">{aiError}</p>}
            {/* Reasoning panel */}
            {reasoning && (
              <div className="rounded-lg overflow-hidden border border-white/8">
                <button
                  onClick={() => setShowReasoning(r => !r)}
                  className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center gap-2">
                    <Sparkles size={12} className="text-purple-400" />
                    <span className="text-xs text-purple-300 font-semibold uppercase tracking-wider">AI Reasoning</span>
                  </div>
                  {showReasoning ? <ChevronUp size={13} className="text-muted" /> : <ChevronDown size={13} className="text-muted" />}
                </button>
                {showReasoning && (
                  <div className="px-3 pb-3 text-xs text-soft leading-relaxed border-t border-white/5">
                    {reasoning}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Desktop: classic week grid */}
        <div className="hidden lg:block overflow-x-auto">
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
                  <span className={`text-xs font-semibold ${mt.color}`}>{mt.label}</span>
                </div>
                {weekDays.map(ds => {
                  const key   = eKey(ds, mt.key);
                  const entry = entries[key];
                  const isT   = ds === today;
                  const cellInteractive = !isAccepted || !!entry?.title;
                  return (
                    <div key={ds} onClick={() => openCell(ds, mt.key)}
                      className={`group relative p-2.5 border-l border-white/5 min-h-[128px] align-top transition-colors
                        ${isT ? 'bg-accent/5' : ''}
                        ${cellInteractive ? 'cursor-pointer hover:bg-white/[0.04]' : 'cursor-default'}`}>
                      {entry?.title ? (
                        <div className="pr-0.5">
                          <MealPlanCardContent entry={entry} compact />
                          {!isAccepted && (
                            <button
                              onClick={e => { e.stopPropagation(); refreshEntry(ds, mt.key); }}
                              disabled={!!refreshingCell}
                              className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md bg-white/5 hover:bg-white/10 text-muted hover:text-white"
                              title="Get a different meal">
                              <RefreshCw size={11} className={refreshingCell === key ? 'animate-spin text-purple-400' : ''} />
                            </button>
                          )}
                        </div>
                      ) : (
                        !isAccepted && (
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                          <Plus size={16} className="text-muted" />
                        </div>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Mobile / tablet: day stacks with meal cards (screenshot-style) */}
        <div className="lg:hidden px-3 py-4 space-y-8 bg-[#0c0c0c]">
          {weekDays.map((ds) => {
            const isT = ds === today;
            return (
              <section key={ds} className="space-y-3">
                <h3 className={`text-base font-bold font-display tracking-tight ${isT ? 'text-accent' : 'text-[#e8bc3d]'}`}>
                  {fmtDayLine(ds)}
                </h3>
                <div className="space-y-3">
                  {MEAL_TYPES.map((mt) => {
                    const key = eKey(ds, mt.key);
                    const entry = entries[key];
                    const cellInteractive = !isAccepted || !!entry?.title;
                    if (entry?.title) {
                      return (
                        <div
                          key={mt.key}
                          role="button"
                          tabIndex={0}
                          onClick={() => openCell(ds, mt.key)}
                          onKeyDown={(ev) => {
                            if (ev.key === 'Enter' || ev.key === ' ') {
                              ev.preventDefault();
                              openCell(ds, mt.key);
                            }
                          }}
                          className={`rounded-xl border border-white/10 bg-[#141414] p-3.5 shadow-[0_1px_0_rgba(255,255,255,0.04)] ${
                            cellInteractive ? 'cursor-pointer active:bg-white/[0.03]' : 'cursor-default'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <mt.icon size={17} className={`shrink-0 ${mt.color}`} />
                            <span className="text-[10px] uppercase tracking-[0.12em] text-muted font-semibold flex-1">
                              {mt.label}
                            </span>
                            {!isAccepted && (
                              <button
                                onClick={e => { e.stopPropagation(); refreshEntry(ds, mt.key); }}
                                disabled={!!refreshingCell}
                                className="p-1 rounded-md text-muted hover:text-white hover:bg-white/10 transition-colors"
                                title="Get a different meal">
                                <RefreshCw size={12} className={refreshingCell === eKey(ds, mt.key) ? 'animate-spin text-purple-400' : ''} />
                              </button>
                            )}
                          </div>
                          <MealPlanCardContent entry={entry} />
                        </div>
                      );
                    }
                    if (!isAccepted) {
                      return (
                        <button
                          key={mt.key}
                          type="button"
                          onClick={() => openCell(ds, mt.key)}
                          className="w-full rounded-xl border border-dashed border-white/15 bg-white/[0.02] py-5 flex flex-col items-center justify-center gap-1.5 text-muted text-xs hover:border-white/25 hover:bg-white/[0.04] transition-colors"
                        >
                          <Plus size={18} strokeWidth={1.75} />
                          <span>Add {mt.label}</span>
                        </button>
                      );
                    }
                    return (
                      <div
                        key={mt.key}
                        className="rounded-xl border border-white/5 bg-white/[0.02] py-5 text-center text-muted text-xs"
                      >
                        —
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    );
  }

  // ── healthy ideas ───────────────────────────────────────────────────────────
  const IDEA_SECTIONS = [
    { key: 'breakfast_snacks', label: 'Breakfast / Snacks' },
    { key: 'lunch_dinner',     label: 'Lunch / Dinner' },
  ];

  function HealthyIdeas() {
    if (ideasLoading) return <div className="text-center py-10 text-muted text-sm fade-up-1">Loading…</div>;
    return (
      <div className="space-y-4 fade-up-1">
        <p className="text-muted text-xs">Jot down healthy meal ideas as they come to you, grouped by when you'd eat them — refer back whenever you're planning the week.</p>
        {IDEA_SECTIONS.map(({ key, label }) => {
          const open = expandedIdeaSections.has(key);
          const list = ideas[key] || [];
          return (
            <div key={key} className="card overflow-hidden">
              <button
                type="button"
                onClick={() => toggleIdeaSection(key)}
                className="w-full flex items-center justify-between py-3 px-4 hover:bg-surface/40 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {open ? <ChevronDown size={14} className="text-muted" /> : <ChevronRight size={14} className="text-muted" />}
                  <span className="font-display text-sm font-semibold text-white">{label}</span>
                </div>
                <span className="text-muted text-xs font-mono">{list.length}</span>
              </button>
              {open && (
                <div className="px-4 pb-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={ideaDrafts[key]}
                      onChange={e => setIdeaDrafts(prev => ({ ...prev, [key]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') addIdea(key); }}
                      placeholder="Add a new idea…"
                      className="input flex-1 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => addIdea(key)}
                      disabled={ideaSaving === key || !ideaDrafts[key]?.trim()}
                      className="btn-primary flex items-center gap-1 px-3 py-2 text-sm disabled:opacity-40"
                    >
                      <Plus size={14} /> Add
                    </button>
                  </div>
                  {list.length === 0 ? (
                    <p className="text-muted text-xs py-2">No ideas yet — add your first one above.</p>
                  ) : (
                    <ul className="divide-y divide-border/40">
                      {list.map(idea => (
                        <li key={idea.id} className="flex items-center justify-between gap-3 py-2">
                          <span className="text-soft text-sm">{idea.text}</span>
                          <button
                            type="button"
                            onClick={() => deleteIdea(key, idea.id)}
                            className="text-muted hover:text-rose transition-colors shrink-0"
                            title="Remove idea"
                          >
                            <X size={14} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ── edit modal ─────────────────────────────────────────────────────────────
  function EditModal() {
    if (!editCell) return null;
    const mt = MEAL_MAP[editCell.mealType];
    const d  = parseD(editCell.date);
    const readOnly = !!editCell.readOnly;

    const notesLines  = (editData.notes || '').split('\n');
    const firstLine   = notesLines[0] || '';
    const hasMacros   = /protein|carbs|fat/i.test(firstLine);
    const macroChips  = hasMacros ? firstLine.split('|').map(s => s.trim()).filter(Boolean) : [];
    const ingredients = hasMacros ? notesLines.slice(1).join('\n').trim() : editData.notes;

    const nutKey = eKey(editCell.date, editCell.mealType);
    const nut = nutritionByKey[nutKey];
    const nutLoading = nutritionLoadingKey === nutKey;

    const showDetailView = editData.title && (!editMode || readOnly);

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(9,9,14,0.75)', backdropFilter: 'blur(6px)' }}>
        <div className="card w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className={`flex items-center gap-2 ${mt.color}`}>
                <mt.icon size={16} /><span className="font-semibold text-sm">{mt.label}</span>
              </div>
              <p className="text-muted text-xs mt-0.5">
                {d?.toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'short' })}
                {readOnly && <span className="ml-2 text-amber-400/80">· View only</span>}
              </p>
            </div>
            <button onClick={() => setEditCell(null)} className="text-muted hover:text-white transition-colors">
              <X size={16} />
            </button>
          </div>

          {showDetailView ? (
            <>
              <p className="text-white text-base font-bold leading-snug mb-3 break-words">{editData.title}</p>
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
              {(ingredients || (!hasMacros && editData.notes)) && (
                <div className="mb-3">
                  <p className="text-[10px] text-muted uppercase tracking-wider mb-1">Ingredients / Notes</p>
                  <p className="text-soft text-xs leading-relaxed whitespace-pre-line break-words">
                    {ingredients || editData.notes}
                  </p>
                </div>
              )}

              <div className="mt-4 border-t border-white/10 pt-3 space-y-2">
                <button
                  type="button"
                  onClick={fetchNutritionBreakdown}
                  disabled={nutLoading || !editData.title?.trim()}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold
                    bg-purple-500/15 text-purple-200 border border-purple-500/30 hover:bg-purple-500/25 transition-colors disabled:opacity-50"
                >
                  <Sparkles size={12} />
                  {nutLoading ? 'Fetching nutrition…' : 'Fetch nutrition (AI)'}
                </button>
                <p className="text-[10px] text-muted leading-snug">
                  Portions, macros, small add-ons (e.g. ghee), and nutrient tags (protein / fibre rich, etc.). Approximate values.
                </p>
                {nut?.items?.length > 0 && (
                  <div className="overflow-x-auto rounded-lg border border-white/10 mt-2">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="text-muted uppercase border-b border-white/10">
                          <th className="py-2 pr-2 pl-2">Item</th>
                          <th className="py-2 pr-2">Portion</th>
                          <th className="py-2 pr-2 min-w-[100px]">Tags</th>
                          <th className="py-2 pr-2 text-right">kcal</th>
                          <th className="py-2 pr-2 text-right">P</th>
                          <th className="py-2 pr-2 text-right">C</th>
                          <th className="py-2 pr-2 text-right">F</th>
                        </tr>
                      </thead>
                      <tbody>
                        {nut.items.flatMap((row, i) => {
                          const comps = Array.isArray(row.components) ? row.components : [];
                          const main = (
                            <tr key={`m-${i}`} className="border-b border-white/5 bg-white/[0.03]">
                              <td className="py-1.5 pr-2 pl-2 text-soft font-medium">{row.name}</td>
                              <td className="py-1.5 pr-2 text-muted max-w-[120px]">{row.portion || '—'}</td>
                              <td className="py-1.5 pr-2">
                                <div className="flex flex-wrap gap-1">
                                  {(row.tags || []).map((tg, j) => (
                                    <span
                                      key={j}
                                      className={`px-1.5 py-0.5 rounded border text-[10px] leading-tight ${nutritionTagClass(tg)}`}
                                    >
                                      {tg}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td className="py-1.5 pr-2 text-right font-mono">{row.calories ?? '—'}</td>
                              <td className="py-1.5 pr-2 text-right font-mono">{row.protein_g ?? '—'}</td>
                              <td className="py-1.5 pr-2 text-right font-mono">{row.carbs_g ?? '—'}</td>
                              <td className="py-1.5 pr-2 text-right font-mono">{row.fat_g ?? '—'}</td>
                            </tr>
                          );
                          const sub = comps.map((c, k) => (
                            <tr key={`c-${i}-${k}`} className="border-b border-white/5">
                              <td className="py-1 pr-2 pl-5 text-muted text-[11px]">
                                <span className="text-muted/60 mr-1">↳</span>
                                {c.name}
                              </td>
                              <td className="py-1 pr-2 text-muted text-[11px]">{c.portion || '—'}</td>
                              <td className="py-1 pr-2 text-muted/50 text-[10px]">—</td>
                              <td className="py-1 pr-2 text-right font-mono text-[11px]">{c.calories ?? '—'}</td>
                              <td className="py-1 pr-2 text-right font-mono text-[11px]">{c.protein_g ?? '—'}</td>
                              <td className="py-1 pr-2 text-right font-mono text-[11px]">{c.carbs_g ?? '—'}</td>
                              <td className="py-1 pr-2 text-right font-mono text-[11px]">{c.fat_g ?? '—'}</td>
                            </tr>
                          ));
                          return [main, ...sub];
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {nut?.mealTotal && (
                  <div className={`flex flex-wrap gap-3 text-xs font-mono px-2 py-2 rounded-lg border ${mt.ring} ${mt.color}`}>
                    <span>Meal total: {nut.mealTotal.calories ?? '—'} kcal</span>
                    <span>P {nut.mealTotal.protein_g ?? '—'}g</span>
                    <span>C {nut.mealTotal.carbs_g ?? '—'}g</span>
                    <span>F {nut.mealTotal.fat_g ?? '—'}g</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2 mt-4">
                {!readOnly && (
                  <>
                    <button type="button" onClick={clearCell} className="flex-1 py-2 text-sm rounded-xl border border-red-400/20 text-red-400 hover:bg-red-400/10 transition-colors">Clear</button>
                    <button type="button" onClick={() => setEditMode(true)} className="btn-primary flex-1 text-sm py-2">Edit</button>
                  </>
                )}
                {readOnly && (
                  <button type="button" onClick={() => setEditCell(null)} className="btn-primary flex-1 text-sm py-2">Close</button>
                )}
              </div>
            </>
          ) : readOnly ? null : (
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
                <button type="button" onClick={clearCell} className="flex-1 py-2 text-sm rounded-xl border border-red-400/20 text-red-400 hover:bg-red-400/10 transition-colors">Clear</button>
                <button type="button" onClick={saveCell} className="btn-primary flex-1 text-sm py-2">Save</button>
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
          <p className="text-muted text-xs mt-1 uppercase tracking-widest font-mono">Weekly meal planner</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1 p-1 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            {[{ key: 'ideas', label: 'Healthy Ideas' }, { key: 'planner', label: 'Plan Week' }].map(({ key, label }) => (
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

      {loading && view === 'planner' && <div className="text-center py-10 text-muted text-sm fade-up-1">Loading…</div>}

      {!loading && view === 'planner'  && Planner()}
      {           view === 'ideas'     && HealthyIdeas()}

      {EditModal()}
    </div>
  );
}
