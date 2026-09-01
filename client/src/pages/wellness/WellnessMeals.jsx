import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronLeft, ChevronRight,
  Plus, X, Check, Save, Sparkles,
  ChevronDown, Lightbulb, UtensilsCrossed, ClipboardList,
  User,
} from 'lucide-react';
import api from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';
import SegmentedToggle from '../../components/SegmentedToggle';
import { parseD, todayStr, getMonday, getWeekDays, fmtWeekRange } from '../../lib/utils';

const MEAL_VIEWS = [
  { key: 'track', label: 'Track Meal' },
  { key: 'ideas', label: 'Healthy Ideas' },
];

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** How many weeks the week strip shows at once — one page of the strip. */
const STRIP_WEEKS = 6;

// ─── helpers ──────────────────────────────────────────────────────────────────
function shiftWeekStr(ws, weeks) {
  const d = new Date(ws + 'T12:00:00');
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

/** Compact label for a week cell, e.g. { range: '6–12', mo: 'Jan' } */
function weekCellLabel(ws) {
  const s = parseD(ws);
  const e = parseD(shiftWeekStr(ws, 1));
  e.setDate(e.getDate() - 1);
  const mo = s.toLocaleDateString('en-IN', { month: 'short' });
  const moEnd = e.toLocaleDateString('en-IN', { month: 'short' });
  return {
    range: `${s.getDate()}–${e.getDate()}`,
    mo: mo === moEnd ? mo : `${mo}/${moEnd}`,
  };
}

/** Day heading for a tracked day, e.g. 'Mon · 6 Jan' */
function fmtDayLabel(ds, i) {
  const d = parseD(ds);
  return `${DAY_LABELS[i]} · ${d.getDate()} ${d.toLocaleDateString('en-IN', { month: 'short' })}`;
}

// What the weekly analysis is written against. The user writes it as prose in
// the prompt window; the structured fields below are only read, not written —
// they are what an earlier version of this screen collected.
const LEGACY_CONTEXT_LABELS = {
  household: 'Who this covers', age: 'Age', sex: 'Sex',
  height_cm: 'Height (cm)', weight_kg: 'Weight (kg)',
  activity: 'Activity level', goal: 'Goal', diet: 'Dietary pattern',
  portions: 'Typical portions', staples: 'Everyday baseline',
  conditions: 'Medical conditions', allergies: 'Allergies / intolerances',
  notes: 'Other notes',
};

/** Read a saved context into the one text box, whichever shape it was saved in. */
function contextToText(saved) {
  if (!saved || typeof saved !== 'object') return '';
  if (saved.preferences) return saved.preferences;
  return Object.entries(LEGACY_CONTEXT_LABELS)
    .filter(([k]) => saved[k] !== undefined && saved[k] !== '')
    .map(([k, label]) => `${label}: ${saved[k]}`)
    .join('\n');
}

const PREFERENCE_PLACEHOLDER = `Tell the analysis who it is writing for, and how you want it written. For example:

We are two — my partner is vegetarian, I also eat eggs and chicken. Recommend vegetarian for her unless the log says otherwise.

Our rotis are a mixed atta: khapli wheat, barley, jowar, ragi, kala chana, soy, makka, oats. 2–2.5 per person with a little ghee — that ghee is normal, don't flag it. Normal sabzi is ~250g vegetables for two in a spoon of mustard oil.

Fruit bowl most mornings: Greek yogurt, banana, apple, chia, pumpkin seeds, oats, pomegranate or blueberries. 5 soaked almonds and 2 walnuts each, about 5 days a week. Don't tell us to add these — we already eat them.

I have borderline low haemoglobin, so watch iron.

Keep the report short. Skip anything about calories.`;

/**
 * The four states a nutrient can be in. "check" is deliberately not a failure:
 * B12 and vitamin D cannot be read off a food log at all, so showing them as a
 * gap would be wrong. Each state carries a fill level and a word as well as a
 * colour, so the grid is readable without colour and in greyscale.
 */
const NUTRIENT_STATES = {
  high:   { level: 3, hue: 'emerald', label: 'good',   dot: 'bg-hue-emerald' },
  medium: { level: 2, hue: 'amber',   label: 'ok',     dot: 'bg-hue-amber' },
  low:    { level: 1, hue: 'rose',    label: 'low',    dot: 'bg-hue-rose' },
  check:  { level: 0, hue: 'slate',   label: 'check',  dot: 'bg-muted/50' },
};
const stateOf = (status) => NUTRIENT_STATES[status] || NUTRIENT_STATES.check;

/** Legacy reports stored a 0–10 rating; map it onto the status vocabulary. */
const legacyStatus = (rating) => (rating >= 7 ? 'high' : rating >= 4 ? 'medium' : 'low');

/** Span covered by a run of weeks, e.g. '2 Dec – 12 Jan 2026' */
function fmtStripRange(firstWeek, lastWeek) {
  const s = parseD(firstWeek);
  const e = parseD(shiftWeekStr(lastWeek, 1));
  e.setDate(e.getDate() - 1);
  return `${s.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${
    e.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

export default function WellnessMeals() {
  const { personName, activePerson } = useAuth();
  const currentPerson = activePerson || personName;

  const [view, setView] = useState('track');

  // ── track state ────────────────────────────────────────────────────────────
  const today = todayStr();
  const thisWeek = getMonday(today);
  // First (leftmost) week of the visible strip page — the current week sits last.
  const [stripStart, setStripStart] = useState(() => shiftWeekStr(getMonday(todayStr()), -(STRIP_WEEKS - 1)));
  const [weekStart, setWeekStart] = useState(null); // null until a week is clicked
  const [dayLogs, setDayLogs] = useState({});       // { 'YYYY-MM-DD': 'text' }
  const [weekCounts, setWeekCounts] = useState({}); // { week_start: days_logged }
  const [trackLoading, setTrackLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  const [analysePrompt, setAnalysePrompt] = useState('');
  const [report, setReport] = useState(null);

  // Standing analysis context — entered once per profile, reused every week.
  const [context, setContext] = useState('');       // the saved preference text
  const [contextDraft, setContextDraft] = useState(''); // what is in the box
  const [contextSaved, setContextSaved] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [contextSaving, setContextSaving] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [analyseError, setAnalyseError] = useState('');

  // Latest day text, readable from async callbacks without stale closures.
  const dayLogsRef = useRef(dayLogs);
  useEffect(() => { dayLogsRef.current = dayLogs; }, [dayLogs]);
  // Snapshot of what the server already has, so blurring an untouched box is a no-op.
  const savedSnapshotRef = useRef('');

  // healthy ideas state
  const [ideas, setIdeas] = useState({ breakfast_snacks: [], lunch_dinner: [] });
  const [ideasLoading, setIdeasLoading] = useState(false);
  const [ideaDrafts, setIdeaDrafts] = useState({ breakfast_snacks: '', lunch_dinner: '' });
  const [ideaSaving, setIdeaSaving] = useState(null); // category being saved
  const [expandedIdeaSections, setExpandedIdeaSections] = useState(new Set(['breakfast_snacks', 'lunch_dinner']));

  // ── healthy ideas ───────────────────────────────────────────────────────────
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

  // ── track: week strip counts ────────────────────────────────────────────────
  const stripWeeks = Array.from({ length: STRIP_WEEKS }, (_, i) => shiftWeekStr(stripStart, i));

  const loadWeekCounts = useCallback(async (from, to, person) => {
    try {
      const { data } = await api.get(
        `/meals/track/weeks?person=${encodeURIComponent(person || '')}&from=${from}&to=${to}`
      );
      setWeekCounts(data.counts || {});
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    if (view !== 'track') return;
    loadWeekCounts(stripStart, shiftWeekStr(stripStart, STRIP_WEEKS - 1), currentPerson);
  }, [view, stripStart, currentPerson, loadWeekCounts]);

  // ── track: load one week ────────────────────────────────────────────────────
  const loadWeek = useCallback(async (ws, person) => {
    setTrackLoading(true);
    setAnalyseError('');
    try {
      const { data } = await api.get(
        `/meals/track?week_start=${ws}&person=${encodeURIComponent(person || '')}`
      );
      const map = {};
      getWeekDays(ws).forEach(d => { map[d] = ''; });
      (data.days || []).forEach(d => { map[d.entry_date] = d.meals || ''; });
      setDayLogs(map);
      dayLogsRef.current = map;
      // What we just loaded is exactly what the server holds.
      savedSnapshotRef.current = JSON.stringify(
        getWeekDays(ws).map(d => ({ entry_date: d, meals: map[d] || '' }))
      );
      setAnalysePrompt(data.report?.prompt || '');
      setReport(data.report?.report || null);
      setSavedAt(null);
    } catch (err) {
      console.error(err);
    } finally {
      setTrackLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view !== 'track' || !weekStart) return;
    loadWeek(weekStart, currentPerson);
  }, [view, weekStart, currentPerson, loadWeek]);

  // Switching profile closes the open week — its logs belong to the old person.
  useEffect(() => { setWeekStart(null); setReport(null); }, [currentPerson]);

  // ── track: the standing analysis context ───────────────────────────────────
  useEffect(() => {
    if (view !== 'track') return;
    let cancelled = false;
    api.get(`/meals/track/context?person=${encodeURIComponent(currentPerson || '')}`)
      .then(r => {
        if (cancelled) return;
        const text = contextToText(r.data?.context);
        setContext(text);
        setContextDraft(text);
        setContextSaved(!!text);
        // Unset: the box is the whole card. Set: collapsed until they open it.
        setContextOpen(!text);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [view, currentPerson]);

  async function saveContext() {
    setContextSaving(true);
    try {
      // Saving replaces the whole preference block, legacy fields included —
      // what is in the box is what the analysis will be given.
      const { data } = await api.put('/meals/track/context', {
        person: currentPerson || '',
        context: { preferences: contextDraft.trim() },
      });
      const text = contextToText(data?.context);
      setContext(text);
      setContextDraft(text);
      setContextSaved(!!text);
      setContextOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setContextSaving(false);
    }
  }

  /** First meaningful line of the saved text, for the collapsed row. */
  const contextSummary = () => {
    const line = context.split('\n').map(l => l.trim()).find(Boolean) || '';
    return line.length > 90 ? `${line.slice(0, 90)}…` : line;
  };

  async function saveWeek({ force = false } = {}) {
    if (!weekStart) return;
    const days = getWeekDays(weekStart).map(d => ({ entry_date: d, meals: dayLogsRef.current[d] || '' }));
    const snapshot = JSON.stringify(days);
    if (!force && snapshot === savedSnapshotRef.current) return; // nothing changed
    setSaving(true);
    try {
      await api.put('/meals/track', { week_start: weekStart, person: currentPerson || '', days });
      savedSnapshotRef.current = snapshot;
      setSavedAt(Date.now());
      setWeekCounts(prev => ({ ...prev, [weekStart]: days.filter(d => d.meals.trim()).length }));
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function analyseMeals() {
    if (!weekStart) return;
    setAnalysing(true); setAnalyseError('');
    try {
      await saveWeek(); // analyse what's on screen, not the last save
      const { data } = await api.post('/meals/track/analyse', {
        week_start: weekStart,
        person: currentPerson || '',
        prompt: analysePrompt,
      });
      setReport(data.report || null);
    } catch (err) {
      setAnalyseError(err.response?.data?.error || 'Analysis failed. Check your API key in Settings.');
    } finally {
      setAnalysing(false);
    }
  }

  // ── track view ──────────────────────────────────────────────────────────────
  function WeekStrip() {
    const stripHasCurrent = stripWeeks.includes(thisWeek);
    return (
      <div className="card p-3 sm:p-4 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5">
            <button onClick={() => setStripStart(s => shiftWeekStr(s, -STRIP_WEEKS))} title="Earlier weeks"
              className="icon-btn p-1.5 rounded-lg hover:bg-hairline/8 text-soft hover:text-white transition-colors">
              <ChevronLeft size={18} />
            </button>
            <p className="text-white text-sm font-semibold font-body">
              {fmtStripRange(stripStart, stripWeeks[STRIP_WEEKS - 1])}
            </p>
            <button onClick={() => setStripStart(s => shiftWeekStr(s, STRIP_WEEKS))} title="Later weeks"
              className="icon-btn p-1.5 rounded-lg hover:bg-hairline/8 text-soft hover:text-white transition-colors">
              <ChevronRight size={18} />
            </button>
            {!stripHasCurrent && (
              <button onClick={() => setStripStart(shiftWeekStr(thisWeek, -(STRIP_WEEKS - 1)))}
                className="px-2.5 py-1 rounded-lg text-xs font-mono bg-accent/10 text-accent-ink border border-accent/20 hover:bg-accent/20 transition-colors">
                This week
              </button>
            )}
          </div>
          <p className="text-[10px] sm:text-xs text-muted font-mono">Tap a week to log or review it</p>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 sm:gap-2">
          {stripWeeks.map(ws => {
            const { range, mo } = weekCellLabel(ws);
            const isThis = ws === thisWeek;
            const isSel = weekStart === ws;
            const count = weekCounts[ws] || 0;
            return (
              <button key={ws} onClick={() => setWeekStart(ws)}
                title={count ? `${count} of 7 days logged — tap to view or edit` : 'Tap to log this week'}
                className={`min-h-[68px] rounded-xl border px-0.5 py-2 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                  isSel
                    ? 'border-accent bg-accent/15'
                    : count
                      ? 'border-accent/30 bg-accent/[0.07] hover:bg-accent/15'
                      : 'border-dashed border-border hover:bg-accent/10'
                } ${isThis && !isSel ? 'ring-1 ring-accent/30' : ''}`}>
                <span className={`text-[9px] sm:text-[10px] font-mono uppercase tracking-wide ${isThis ? 'text-accent-ink' : 'text-muted'}`}>
                  {isThis ? 'This wk' : 'Week'}
                </span>
                <span className={`text-base sm:text-lg font-bold font-display leading-none ${isThis ? 'text-accent-ink' : count ? 'text-white' : 'text-soft'}`}>
                  {range}
                </span>
                <span className="text-[9px] text-muted font-mono leading-none">{mo}</span>
                {count ? (
                  <span className="flex items-center gap-0.5 text-[9px] font-mono text-accent-ink leading-none mt-0.5">
                    <Check size={8} />{count}/7
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

  function DayLogs() {
    const days = getWeekDays(weekStart);
    const filled = days.filter(d => (dayLogs[d] || '').trim()).length;
    return (
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 p-4 border-b border-hairline/5">
          <div>
            <p className="text-white text-sm font-semibold font-body">{fmtWeekRange(weekStart)}</p>
            <p className="text-xs text-muted font-mono">{filled} of 7 days logged</p>
          </div>
          <div className="flex items-center gap-2">
            {savedAt && !saving && (
              <span className="flex items-center gap-1 text-xs text-pos font-mono"><Check size={11} /> Saved</span>
            )}
            <button onClick={() => saveWeek({ force: true })} disabled={saving}
              className="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-50">
              <Save size={13} />{saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        <div className="divide-y divide-hairline/8">
          {days.map((ds, i) => {
            const isToday = ds === today;
            return (
              <div key={ds} className="p-3 sm:p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-mono font-semibold ${isToday ? 'text-accent-ink' : 'text-soft'}`}>
                    {fmtDayLabel(ds, i)}
                  </span>
                  {isToday && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wide bg-accent/15 text-accent-ink border border-accent/25">
                      Today
                    </span>
                  )}
                </div>
                <textarea
                  className="input w-full text-sm py-2 min-h-[76px] resize-y"
                  placeholder="What did you eat? e.g. Breakfast: oats + banana · Lunch: dal, rice, salad · Dinner: grilled paneer · Snack: almonds"
                  value={dayLogs[ds] || ''}
                  onChange={e => setDayLogs(prev => ({ ...prev, [ds]: e.target.value }))}
                  onBlur={() => saveWeek()}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /**
   * The preference prompt window. Unset, it IS the card — a box and one button,
   * no form. Set, it collapses to a single row that opens back into the same
   * box, so setting and editing are the same gesture.
   */
  function ContextCard() {
    const dirty = contextDraft.trim() !== context.trim();
    const box = (
      <>
        <textarea
          aria-label="Your preferences"
          className="input w-full text-sm py-2 min-h-[180px] resize-y leading-relaxed"
          placeholder={PREFERENCE_PLACEHOLDER}
          value={contextDraft}
          onChange={e => setContextDraft(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={saveContext} disabled={contextSaving || (contextSaved && !dirty)}
            className="btn-primary text-sm px-3 py-2 flex items-center gap-1.5 shrink-0 whitespace-nowrap
              disabled:opacity-50">
            <Save size={13} />
            {contextSaving
              ? 'Saving…'
              : contextSaved ? 'Update preference' : 'Set user preference'}
          </button>
          {contextSaved && dirty && (
            <button onClick={() => setContextDraft(context)}
              className="text-xs text-muted hover:text-text transition-colors">Discard changes</button>
          )}
          <span className="text-[10px] text-muted font-mono">
            {contextSaved ? 'Used by every analysis' : 'Saved once — used by every analysis from now on'}
          </span>
        </div>
      </>
    );

    if (!contextSaved) {
      return (
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <User size={14} className="text-hue-teal shrink-0" />
            <p className="font-display text-sm font-semibold text-white">Your preferences</p>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            Write who this is for, what you already eat, anything medical, and how you want the
            report written. Without it the analysis is generic.
          </p>
          {box}
        </div>
      );
    }

    return (
      <div className="card overflow-hidden">
        <button type="button" onClick={() => setContextOpen(o => !o)}
          className="w-full flex items-center justify-between gap-3 py-3 px-4 hover:bg-surface/40 transition-colors text-left">
          <div className="flex items-center gap-2 min-w-0">
            {contextOpen ? <ChevronDown size={14} className="text-muted shrink-0" /> : <ChevronRight size={14} className="text-muted shrink-0" />}
            <User size={14} className="text-hue-teal shrink-0" />
            <span className="font-display text-sm font-semibold text-white shrink-0">Your preferences</span>
            <span className="text-xs text-muted truncate">{contextSummary()}</span>
          </div>
          <span className="flex items-center gap-1 text-[10px] text-pos font-mono shrink-0">
            <Check size={10} /> set
          </span>
        </button>

        {contextOpen && (
          <div className="px-4 pb-4 space-y-3 border-t border-hairline/8 pt-3">
            {box}
          </div>
        )}
      </div>
    );
  }

  function NutrientGrid({ nutrients }) {
    if (!nutrients?.length) return null;
    // A compact status grid rather than a bar chart: the log rarely supports
    // exact quantities, so a numeric axis would claim a precision that is not
    // there. Four states, each with a fill level as well as a colour, so the
    // grid reads in greyscale and at a glance.
    const rows = nutrients.map(n => {
      const status = n.status || (typeof n.rating === 'number' ? legacyStatus(n.rating) : 'check');
      return { ...n, status, st: stateOf(status) };
    });
    // Only the notes that change what you'd cook: weak first, then the ones a
    // food log genuinely can't settle. Capped so the card stays scannable.
    const NOTE_ORDER = { low: 0, medium: 1, check: 2 };
    const notable = rows
      .filter(n => n.note && n.status !== 'high')
      .sort((a, b) => NOTE_ORDER[a.status] - NOTE_ORDER[b.status])
      .slice(0, 5);

    return (
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-2">
          <p className="text-[10px] text-muted uppercase tracking-widest font-mono">Nutrient coverage</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {['high', 'medium', 'low', 'check'].map(k => (
              <span key={k} className="flex items-center gap-1 text-[10px] text-muted font-mono">
                <span className={`w-1.5 h-1.5 rounded-full ${NUTRIENT_STATES[k].dot}`} />
                {NUTRIENT_STATES[k].label}
              </span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-1.5 max-w-3xl">
          {rows.map((n, i) => (
            <div key={i} className="flex items-center gap-2 min-w-0"
              title={`${n.name} — ${n.st.label}${n.note ? `: ${n.note}` : ''}`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${n.st.dot}`} />
              <span className="text-xs text-soft truncate flex-1 min-w-0">{n.name}</span>
              <span className="flex gap-[2px] shrink-0" aria-label={n.st.label}>
                {[1, 2, 3].map(seg => (
                  <span key={seg}
                    className={`w-2.5 h-1.5 rounded-[1px] ${seg <= n.st.level ? n.st.dot : 'bg-hairline/25'}`} />
                ))}
              </span>
            </div>
          ))}
        </div>

        {notable.length > 0 && (
          <ul className="space-y-1 mt-3">
            {notable.map((n, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${n.st.dot}`} />
                <span className="text-soft">
                  <span className="text-white font-semibold">{n.name}</span>
                  <span className="text-muted font-mono"> · {n.st.label}</span> — {n.note}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  /** 🟢 Strong / 🟡 Could improve — a titled list of short bullets. */
  function BulletBlock({ title, items, dot }) {
    if (!items?.length) return null;
    return (
      <div>
        <p className="text-[10px] text-muted uppercase tracking-widest font-mono mb-1.5">{title}</p>
        <ul className="space-y-1">
          {items.map((t, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-soft leading-relaxed">
              <span className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${dot}`} />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  /** Nutrient → food → dishes → how often, as one scannable chain per row. */
  function PriorityList({ priorities }) {
    if (!priorities?.length) return null;
    return (
      <div>
        <p className="text-[10px] text-muted uppercase tracking-widest font-mono mb-2">Next week — 3 priorities</p>
        <ol className="space-y-2">
          {priorities.map((p, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-accent/15 text-accent-ink text-[10px] font-mono
                flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
              <div className="min-w-0 text-sm leading-relaxed">
                <span className="text-white font-semibold">{p.nutrient}</span>
                {p.food ? <span className="text-muted"> → {p.food}</span> : null}
                <span className="text-soft"> → {p.dishes}</span>
                {p.frequency
                  ? <span className="text-accent-ink font-mono text-xs"> → {p.frequency}</span>
                  : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  function ReportCard() {
    if (!report) return null;
    // Reports written before the rated-nutrient shape stored score/100 and free
    // sections. Read both so old weeks still open.
    const legacy  = report.overall == null && typeof report.score === 'number';
    const overall = legacy
      ? Math.round(report.score / 10 * 10) / 10
      : (typeof report.overall === 'number' ? report.overall : null);
    const tone = overall == null ? '' : overall >= 7 ? 'text-pos' : overall >= 4.5 ? 'text-hue-amber' : 'text-neg';
    const verdict = report.verdict || report.summary || '';

    return (
      <div className="card p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <ClipboardList size={15} className="text-hue-purple" />
            <p className="font-display text-sm font-semibold text-white">This week</p>
            {report.days_logged ? (
              <span className="text-[10px] text-muted font-mono">{report.days_logged}/7 days</span>
            ) : null}
          </div>
          {overall != null && (
            <div className="text-right">
              <p className="text-[10px] text-muted uppercase tracking-widest font-mono">Overall</p>
              <p className={`font-display text-xl font-bold leading-none ${tone}`}>
                {overall}<span className="text-muted text-xs font-mono">/10</span>
              </p>
            </div>
          )}
        </div>

        {verdict && (
          <p className="text-soft text-sm leading-relaxed whitespace-pre-line">{verdict}</p>
        )}

        <NutrientGrid nutrients={report.nutrients} />

        {report.context_used === false && (
          <p className="text-xs text-hue-amber">
            Written without a profile — add one above and re-run for advice tuned to what you actually eat.
          </p>
        )}

        <BulletBlock title="Strong" items={report.strong} dot="bg-hue-emerald" />
        <BulletBlock title="Could improve" items={report.improve} dot="bg-hue-amber" />

        {report.biggest_gap && (
          <div>
            <p className="text-[10px] text-muted uppercase tracking-widest font-mono mb-1.5">Biggest gap</p>
            <p className="flex items-start gap-2 text-sm text-soft leading-relaxed">
              <span className="w-1.5 h-1.5 rounded-full mt-2 shrink-0 bg-hue-rose" />
              <span>{report.biggest_gap}</span>
            </p>
          </div>
        )}

        <PriorityList priorities={report.priorities} />

        {report.dish_ideas?.length > 0 && (
          <div>
            <p className="text-[10px] text-muted uppercase tracking-widest font-mono mb-2">Dish ideas</p>
            <div className="flex flex-wrap gap-1.5">
              {report.dish_ideas.map((d, i) => (
                <span key={i} className="text-xs text-soft bg-hairline/8 border border-hairline/10
                  rounded-full px-2.5 py-1">{d}</span>
              ))}
            </div>
          </div>
        )}

        {report.goal && (
          <div className="rounded-xl border border-accent/25 bg-accent/[0.07] px-3 py-2.5">
            <p className="text-[10px] text-accent-ink uppercase tracking-widest font-mono mb-1">Next week's goal</p>
            <p className="text-sm text-white leading-relaxed">{report.goal}</p>
          </div>
        )}

        {/* Older reports kept their advice in free-form sections. */}
        {(report.sections || []).map((sec, i) => (
          <div key={i}>
            <p className="text-[10px] text-muted uppercase tracking-widest font-mono mb-1.5">{sec.heading}</p>
            <ul className="space-y-1.5">
              {(sec.points || []).map((pt, j) => (
                <li key={j} className="flex gap-2 text-sm text-soft leading-relaxed">
                  <span className="text-accent-ink mt-0.5 shrink-0">•</span>
                  <span>{pt}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  function TrackMeal() {
    return (
      <div className="space-y-4 fade-up-1">
        {WeekStrip()}

        {!weekStart ? (
          <div className="card">
            <EmptyState compact icon={UtensilsCrossed} title="Pick a week to start"
              hint="Tap a week above to log what you ate on each of its 7 days, then analyse it." />
          </div>
        ) : trackLoading ? (
          <div className="text-center py-10 text-muted text-sm">Loading…</div>
        ) : (
          <>
            {DayLogs()}

            {/* Analyse — the profile above it, since it frames the whole report */}
            {ContextCard()}

            <div className="card p-4 space-y-3">
              <div className="flex items-center gap-1.5 text-xs text-hue-purple font-semibold">
                <Sparkles size={13} /> Analyse this week
              </div>
              <textarea
                aria-label="Analysis instruction for this week"
                className="input w-full text-sm py-2 min-h-[68px] resize-y"
                placeholder="How should the week be analysed? e.g. Focus on protein intake and flag days low on vegetables. Suggest 3 swaps for next week."
                value={analysePrompt}
                onChange={e => setAnalysePrompt(e.target.value)}
              />
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={analyseMeals} disabled={analysing}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold min-h-[44px]
                    bg-purple-500/20 text-hue-purple border border-purple-500/30
                    hover:bg-purple-500/30 transition-colors disabled:opacity-50">
                  <Sparkles size={12} />{analysing ? 'Analysing…' : 'Analyse Meal'}
                </button>
                <p className="text-[10px] text-muted font-mono">Sends all logged days for this week as input</p>
              </div>
              {analyseError && <p className="text-xs text-neg">{analyseError}</p>}
            </div>

            {ReportCard()}
          </>
        )}
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
                    <EmptyState compact icon={Lightbulb} title="No meal ideas yet"
                      hint="Add one above to build up your list." />
                  ) : (
                    <ul className="divide-y divide-border/40">
                      {list.map(idea => (
                        <li key={idea.id} className="flex items-center justify-between gap-3 py-2">
                          <span className="text-soft text-sm">{idea.text}</span>
                          <button
                            type="button"
                            onClick={() => deleteIdea(key, idea.id)}
                            className="icon-btn text-muted hover:text-rose transition-colors shrink-0"
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

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="stack">
      <PageHeader
        className="fade-up"
        title={currentPerson ? `${currentPerson}'s Meals` : 'Meals'}
        eyebrow="Meal ideas & weekly tracking"
        actions={<SegmentedToggle options={MEAL_VIEWS} value={view} onChange={setView} />}
      />

      {view === 'ideas' && HealthyIdeas()}
      {view === 'track' && TrackMeal()}
    </div>
  );
}
