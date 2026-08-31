import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronLeft, ChevronRight,
  Plus, X, Check, Save, Sparkles,
  ChevronDown, Lightbulb, UtensilsCrossed, ClipboardList,
} from 'lucide-react';
import api from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';
import SegmentedToggle from '../../components/SegmentedToggle';
import { parseD, todayStr, getMonday, getWeekDays, fmtWeekRange } from '../../lib/utils';

const MEAL_VIEWS = [
  { key: 'ideas', label: 'Healthy Ideas' },
  { key: 'track', label: 'Track Meal' },
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

  const [view, setView] = useState('ideas');

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

  function ReportCard() {
    if (!report) return null;
    const score = typeof report.score === 'number' ? report.score : null;
    const scoreTone = score == null ? '' : score >= 70 ? 'text-pos' : score >= 45 ? 'text-hue-amber' : 'text-neg';
    return (
      <div className="card p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <ClipboardList size={15} className="text-hue-purple" />
            <p className="font-display text-sm font-semibold text-white">Weekly report</p>
            {report.days_logged ? (
              <span className="text-[10px] text-muted font-mono">{report.days_logged}/7 days</span>
            ) : null}
          </div>
          {score != null && (
            <div className="text-right">
              <p className="text-[10px] text-muted uppercase tracking-widest font-mono">Score</p>
              <p className={`font-display text-xl font-bold leading-none ${scoreTone}`}>{score}<span className="text-muted text-xs font-mono">/100</span></p>
            </div>
          )}
        </div>

        {report.summary && (
          <p className="text-soft text-sm leading-relaxed whitespace-pre-line">{report.summary}</p>
        )}

        {(report.sections || []).map((sec, i) => (
          <div key={i}>
            <p className="text-[10px] text-muted uppercase tracking-widest font-mono mb-1.5">{sec.heading}</p>
            <ul className="space-y-1.5">
              {(sec.points || []).map((p, j) => (
                <li key={j} className="flex gap-2 text-sm text-soft leading-relaxed">
                  <span className="text-accent-ink mt-0.5 shrink-0">•</span>
                  <span>{p}</span>
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

            {/* Analyse */}
            <div className="card p-4 space-y-3">
              <div className="flex items-center gap-1.5 text-xs text-hue-purple font-semibold">
                <Sparkles size={13} /> Analyse this week
              </div>
              <textarea
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
