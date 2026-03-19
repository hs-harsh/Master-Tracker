import { useEffect, useState, useCallback } from 'react';
import {
  AreaChart, Area, ComposedChart, BarChart, Bar, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { Plus, Pencil, Trash2, X, Save, Target, Check } from 'lucide-react';
import api from '../lib/api';
import { fmt, fmtDate } from '../lib/utils';
import { useAuth } from '../hooks/useAuth';

// ── Shared chart helpers ───────────────────────────────────────────────────────
const TT = {
  contentStyle: { background: '#0f1117', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, fontSize: 12, color: '#e2e8f0', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' },
  labelStyle:   { color: '#8b95a5', marginBottom: 6, fontWeight: 600 },
  formatter:    (v, name) => [fmt(v), name],
};
const AX = { tick: { fill: '#6b7280', fontSize: 11 }, tickLine: false, axisLine: false };

function Leg({ items }) {
  return (
    <div className="flex flex-wrap gap-4 mt-3">
      {items.map(([l, c, dash]) => (
        <div key={l} className="flex items-center gap-1.5 text-xs text-soft">
          <div className="w-5 h-0.5" style={{ background: c, borderTop: dash ? `2px dashed ${c}` : undefined }} />
          {l}
        </div>
      ))}
    </div>
  );
}

// ── Time-range selector ────────────────────────────────────────────────────────
const RANGES = ['3M', '6M', '1Y', '2Y', '3Y', '5Y', 'ALL'];

function RangeBar({ range, setRange }) {
  return (
    <div className="flex rounded-lg border border-border overflow-hidden text-xs self-start">
      {RANGES.map(r => (
        <button key={r} onClick={() => setRange(r)}
          className={`px-3 py-1.5 transition-colors ${range === r ? 'bg-accent text-ink font-semibold' : 'text-soft hover:text-white'}`}>
          {r}
        </button>
      ))}
    </div>
  );
}

function sliceByRange(data, range) {
  if (range === 'ALL') return data;
  const months = { '3M': 3, '6M': 6, '1Y': 12, '2Y': 24, '3Y': 36, '5Y': 60 }[range] || 12;
  return data.slice(-months);
}

// ── Chart 1: Corpus + Cumulative Income ───────────────────────────────────────
function CorpusChart({ data }) {
  const [range, setRange] = useState('ALL');
  const sliced = sliceByRange(data, range);

  // Normalize so the chart starts from 0 at the beginning of the chosen window.
  // corpus at month N = cumulative sum up-to-and-including N, so we subtract
  // the corpus *before* the first visible month (= corpus[0] − actual_saving[0]).
  const first = sliced[0];
  const baseCorpus = (Number(first?.corpus) || 0) - (Number(first?.actual_saving) || 0);
  let cumPlan = 0, cumIncome = 0;
  const cd = sliced.map(r => {
    cumPlan   += Number(r.target_saving) || 0;
    cumIncome += (Number(r.income) || 0) + (Number(r.other_income) || 0);
    return {
      month:            fmtDate(r.month),
      'Target Corpus': cumPlan,
      'Actual Corpus':  Math.max(0, (Number(r.corpus) || 0) - baseCorpus),
      'Cumul. Income':  cumIncome,
    };
  });

  return (
    <div className="card">
      <div className="flex items-start justify-between flex-wrap gap-2 mb-4">
        <div>
          <p className="stat-label mb-0.5">Corpus &amp; Cumulative Income</p>
          <p className="text-xs text-muted">Target corpus vs actual savings vs total income earned</p>
        </div>
        <RangeBar range={range} setRange={setRange} />
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={cd} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="gPlan" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gAct" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#2dd4bf" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gInc" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#f0c040" stopOpacity={0.12} />
              <stop offset="95%" stopColor="#f0c040" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a3040" vertical={false} />
          <XAxis dataKey="month" {...AX} />
          <YAxis {...AX} tickFormatter={v => fmt(v)} width={60} />
          <Tooltip {...TT} />
          <Area type="monotone" dataKey="Cumul. Income"  stroke="#f0c040" strokeWidth={1.5} fill="url(#gInc)" dot={false} strokeDasharray="4 2" />
          <Area type="monotone" dataKey="Target Corpus" stroke="#6366f1" strokeWidth={1.8} fill="url(#gPlan)" dot={false} strokeDasharray="5 3" />
          <Area type="monotone" dataKey="Actual Corpus"  stroke="#2dd4bf" strokeWidth={2.5} fill="url(#gAct)"  dot={false} />
        </AreaChart>
      </ResponsiveContainer>
      <Leg items={[['Cumul. Income', '#f0c040', true], ['Target Corpus', '#6366f1', true], ['Actual Corpus', '#2dd4bf']]} />
    </div>
  );
}

// ── Chart 2: Income breakdown (stacked) + Ideal Saving line ──────────────────
// Stacked bar = Fixed (Regular+EMI) + Special (Major+NonRec+Trips) + Actual Saving
// The gap between Actual Saving and Ideal Saving = drag from special expenses
function SavingChart({ data }) {
  const [range, setRange] = useState('ALL');

  const cd = sliceByRange(data, range).map(r => {
    const income  = (Number(r.income) || 0) + (Number(r.other_income) || 0);
    const fixed   = (Number(r.regular_expense) || 0) + (Number(r.emi) || 0);
    const special = (Number(r.major_expense) || 0) + (Number(r.non_recurring_expense) || 0) + (Number(r.trips_expense) || 0);
    const actual  = Math.max(0, income - fixed - special);
    const ideal   = Number(r.target_saving) || 0;
    return {
      month:           fmtDate(r.month),
      'Fixed Costs':   fixed,
      'Special Exp':   special,
      'Actual Saving': actual,
      'Target Saving': ideal,
      _total:          fixed + special + actual,
    };
  });

  // Custom tooltip to also show total income
  const CustomTT = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const total = payload.reduce((s, p) => p.dataKey !== 'Target Saving' ? s + (p.value || 0) : s, 0);
    return (
      <div style={TT.contentStyle} className="text-xs space-y-1 p-2">
        <p style={TT.labelStyle}>{label}</p>
        <p className="text-soft">Total Income: <span className="text-white font-mono">{fmt(total)}</span></p>
        {payload.filter(p => p.dataKey !== '_total').map(p => (
          <p key={p.dataKey} style={{ color: p.fill || p.stroke }}>
            {p.dataKey}: <span className="font-mono">{fmt(p.value)}</span>
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="card">
      <div className="flex items-start justify-between flex-wrap gap-2 mb-3">
        <div>
          <p className="stat-label mb-0.5">Income Breakdown &amp; Saving</p>
          <p className="text-xs text-muted">
            Stacked bar = where your income goes. <span className="text-orange-400">Special expenses</span> are the gap between actual and ideal saving.
          </p>
        </div>
        <RangeBar range={range} setRange={setRange} />
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={cd} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a3040" vertical={false} />
          <XAxis dataKey="month" {...AX} />
          <YAxis {...AX} tickFormatter={v => fmt(v)} width={60} />
          <Tooltip content={<CustomTT />} />
          <Bar dataKey="Fixed Costs"   stackId="s" fill="#a78bfa" radius={[0,0,0,0]} />
          <Bar dataKey="Special Exp"   stackId="s" fill="#fb923c" radius={[0,0,0,0]} />
          <Bar dataKey="Actual Saving" stackId="s" fill="#2dd4bf" radius={[3,3,0,0]} />
          <Line type="monotone" dataKey="Target Saving" stroke="#6366f1" strokeWidth={2} dot={false} strokeDasharray="5 3" />
        </ComposedChart>
      </ResponsiveContainer>
      <Leg items={[['Fixed (Regular+EMI)', '#a78bfa'], ['Special Expenses', '#fb923c'], ['Actual Saving', '#2dd4bf'], ['Target Saving', '#6366f1', true]]} />
    </div>
  );
}

// ── Chart 3: Expense Breakdown ────────────────────────────────────────────────
function ExpenseChart({ data }) {
  const [range, setRange] = useState('ALL');
  const EXP = [['Major','#fb7185'],['Non-Recurring','#f97316'],['Regular','#facc15'],['EMI','#a78bfa'],['Trips','#60a5fa']];
  const cd = sliceByRange(data, range).map(r => ({
    month:           fmtDate(r.month),
    Major:           Number(r.major_expense) || 0,
    'Non-Recurring': Number(r.non_recurring_expense) || 0,
    Regular:         Number(r.regular_expense) || 0,
    EMI:             Number(r.emi) || 0,
    Trips:           Number(r.trips_expense) || 0,
  }));

  return (
    <div className="card">
      <div className="flex items-start justify-between flex-wrap gap-2 mb-4">
        <div>
          <p className="stat-label mb-0.5">Expense Breakdown</p>
          <p className="text-xs text-muted">Monthly spend stacked by category</p>
        </div>
        <RangeBar range={range} setRange={setRange} />
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={cd} barSize={18} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a3040" vertical={false} />
          <XAxis dataKey="month" {...AX} />
          <YAxis {...AX} tickFormatter={v => fmt(v)} width={60} />
          <Tooltip {...TT} />
          {EXP.map(([k, c], i) => (
            <Bar key={k} dataKey={k} stackId="e" fill={c}
              radius={i === EXP.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <Leg items={EXP} />
    </div>
  );
}

// ── Default target savings (per-person, stored in localStorage) ────────────────
const LS_KEY = 'cashflow_default_target_saving';
function getDefaultTargets() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
}
function saveDefaultTarget(person, amount) {
  const cur = getDefaultTargets();
  localStorage.setItem(LS_KEY, JSON.stringify({ ...cur, [person]: amount }));
}

// ── Add / Edit modal ──────────────────────────────────────────────────────────
const EMPTY = (def = {}) => ({
  month:                  def.month  || '',
  person:                 def.person || '',
  income:                 '',
  other_income:           0,
  major_expense:          0,
  non_recurring_expense:  0,
  regular_expense:        '',
  emi:                    '',
  trips_expense:          0,
  target_saving:          def.target_saving ?? '',
});

function Field({ label, name, form, setForm, readOnly = false, hint }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type="number"
        className={`input w-full ${readOnly ? 'opacity-60 cursor-not-allowed' : ''}`}
        value={form[name]}
        readOnly={readOnly}
        onChange={e => !readOnly && setForm(f => ({ ...f, [name]: e.target.value }))}
      />
      {hint && <p className="text-xs text-muted mt-0.5">{hint}</p>}
    </div>
  );
}

function MonthModal({ persons, editRow, onClose, onSaved }) {
  const isEdit = !!editRow?.id;
  const [form, setForm] = useState(() => {
    if (editRow) {
      return {
        ...editRow,
        month: editRow.month ? String(editRow.month).slice(0, 10) : '',
      };
    }
    const defaults = getDefaultTargets();
    const person = persons[0] || '';
    return EMPTY({ person, target_saving: defaults[person] ?? '' });
  });

  const [saving, setSaving] = useState(false);

  const income       = Number(form.income) || 0;
  const otherInc     = Number(form.other_income) || 0;
  const majorExp     = Number(form.major_expense) || 0;
  const nonRec       = Number(form.non_recurring_expense) || 0;
  const regular      = Number(form.regular_expense) || 0;
  const emi          = Number(form.emi) || 0;
  const trips        = Number(form.trips_expense) || 0;
  const netExp       = majorExp + nonRec + regular + emi + trips;
  const actualSaving = (income + otherInc) - netExp;
  const targetSaving = Number(form.target_saving) || 0;
  // Target saving = Income - Regular - EMI (no special expenses)
  const suggestedIdeal = income + otherInc - regular - emi;

  const handleSave = async () => {
    if (!form.month || !form.person) return alert('Month and person are required.');
    setSaving(true);
    try {
      const payload = {
        ...form,
        net_expense:   netExp,
        actual_saving: actualSaving,
        target_saving: targetSaving,
        target:        targetSaving,
      };
      if (isEdit) {
        await api.put(`/cashflow/${editRow.id}`, payload);
      } else {
        await api.post('/cashflow', payload);
      }
      onSaved();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="font-display font-bold text-white">{isEdit ? 'Edit Month' : 'Add Month'}</h2>
          <button onClick={onClose} className="text-muted hover:text-white transition-colors"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Month + Person */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Month</label>
              <input type="month" className="input w-full"
                value={form.month ? form.month.slice(0, 7) : ''}
                readOnly={isEdit}
                onChange={e => !isEdit && setForm(f => ({ ...f, month: e.target.value + '-01' }))} />
            </div>
            <div>
              <label className="label">Person</label>
              {isEdit ? (
                <input className="input w-full opacity-60" readOnly value={form.person} />
              ) : (
                <select className="input w-full" value={form.person}
                  onChange={e => {
                    const p = e.target.value;
                    const defaults = getDefaultTargets();
                    setForm(f => ({ ...f, person: p, ...(defaults[p] !== undefined ? { target_saving: defaults[p] } : {}) }));
                  }}>
                  {persons.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              )}
            </div>
          </div>

          {/* Income */}
          <div>
            <p className="text-xs text-muted uppercase tracking-wider mb-2 font-display">Income</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Salary / Income"  name="income"       form={form} setForm={setForm} />
              <Field label="Other Income"     name="other_income" form={form} setForm={setForm} />
            </div>
          </div>

          {/* Saving target */}
          <div>
            <p className="text-xs text-muted uppercase tracking-wider mb-2 font-display">Saving Target</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Target Saving" name="target_saving" form={form} setForm={setForm}
                hint={suggestedIdeal > 0 ? `Income − Regular − EMI = ${fmt(suggestedIdeal)}` : undefined} />
              <div className="flex flex-col justify-end">
                <label className="label">Actual Saving (auto)</label>
                <div className={`input w-full font-mono ${actualSaving >= targetSaving ? 'text-teal' : 'text-rose'}`}>
                  {fmt(actualSaving)}
                </div>
              </div>
            </div>
          </div>

          {/* Fixed expenses */}
          <div>
            <p className="text-xs text-muted uppercase tracking-wider mb-2 font-display">Fixed Expenses</p>
            <p className="text-xs text-muted mb-2">
              Without special expenses (Major / Non-Recurring / Trips), Actual Saving = Income − Regular − EMI.
              Set Target Saving equal to this for a balanced budget.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Regular Expense" name="regular_expense" form={form} setForm={setForm} />
              <Field label="EMI"             name="emi"             form={form} setForm={setForm} />
            </div>
          </div>

          {/* Variable expenses */}
          <div>
            <p className="text-xs text-muted uppercase tracking-wider mb-2 font-display">Special / Variable Expenses</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Major Expense"     name="major_expense"         form={form} setForm={setForm} />
              <Field label="Non-Recurring"     name="non_recurring_expense" form={form} setForm={setForm} />
              <Field label="Trips Expense"     name="trips_expense"         form={form} setForm={setForm} />
            </div>
          </div>

          {/* Summary */}
          <div className="rounded-lg bg-surface border border-border p-4 grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-muted text-xs">Net Expense</p>
              <p className="font-mono text-rose font-semibold">{fmt(netExp)}</p>
            </div>
            <div>
              <p className="text-muted text-xs">Actual Saving</p>
              <p className={`font-mono font-semibold ${actualSaving >= targetSaving ? 'text-teal' : 'text-rose'}`}>{fmt(actualSaving)}</p>
            </div>
            <div>
              <p className="text-muted text-xs">vs Ideal</p>
              <p className={`font-mono font-semibold ${actualSaving >= targetSaving ? 'text-teal' : 'text-rose'}`}>
                {actualSaving >= targetSaving ? '+' : ''}{fmt(actualSaving - targetSaving)}
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-2 p-5 border-t border-border">
          <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
            <Save size={14} /> {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={onClose} className="btn-ghost">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Default Target Saving widget ───────────────────────────────────────────────
function DefaultTargetWidget({ persons }) {
  const [defaults, setDefaults] = useState(getDefaultTargets);
  const [editing, setEditing]   = useState(false);
  const [draft, setDraft]       = useState({});

  const startEdit = () => {
    setDraft({ ...defaults });
    setEditing(true);
  };
  const save = () => {
    persons.forEach(p => {
      if (draft[p] !== undefined) saveDefaultTarget(p, draft[p] === '' ? undefined : Number(draft[p]));
    });
    setDefaults(getDefaultTargets());
    setEditing(false);
  };

  const hasAny = persons.some(p => defaults[p] !== undefined && defaults[p] !== '');

  if (!editing) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted">
        <Target size={13} className="text-indigo-400 shrink-0" />
        <span className="text-soft">Default target saving:</span>
        {hasAny
          ? persons.map(p => defaults[p] ? (
              <span key={p} className="font-mono text-white">{p}: {fmt(defaults[p])}</span>
            ) : null)
          : <span className="italic">not set</span>}
        <button onClick={startEdit} className="ml-1 underline hover:text-white transition-colors">edit</button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 flex-wrap text-xs">
      <Target size={13} className="text-indigo-400 shrink-0" />
      <span className="text-soft">Default target saving:</span>
      {persons.map(p => (
        <label key={p} className="flex items-center gap-1.5">
          <span className="text-muted">{p}</span>
          <input
            type="number"
            className="input py-1 w-28 text-xs"
            placeholder="e.g. 50000"
            value={draft[p] ?? ''}
            onChange={e => setDraft(d => ({ ...d, [p]: e.target.value }))}
          />
        </label>
      ))}
      <button onClick={save} className="flex items-center gap-1 px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors">
        <Save size={12} /> Save
      </button>
      <button onClick={() => setEditing(false)} className="text-muted hover:text-white underline">cancel</button>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function Cashflow() {
  const { personName, persons, activePerson, setActivePerson, dataVersion } = useAuth();
  const [data, setData]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState('charts');
  const [modal, setModal]         = useState(null);
  const [inlineEdit, setInlineEdit] = useState({ rowKey: null, value: '' });

  const currentPerson = activePerson || personName;

  const load = useCallback(() => {
    if (!currentPerson) return;
    setLoading(true);
    api.get(`/cashflow?person=${currentPerson}`)
      .then(r => setData(r.data))
      .finally(() => setLoading(false));
  }, [currentPerson, dataVersion]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => setModal('add');

  const startInlineEdit = (row) => {
    const rowKey = row.id || `${row.person}-${row.month}`;
    setInlineEdit({ rowKey, value: String(row.target_saving || row.target || '') });
  };

  const cancelInlineEdit = () => setInlineEdit({ rowKey: null, value: '' });

  const handleInlineSave = async (row) => {
    try {
      await api.patch('/cashflow/target-saving', {
        month:         row.month,
        person:        row.person,
        target_saving: Number(inlineEdit.value) || 0,
      });
      setInlineEdit({ rowKey: null, value: '' });
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to save');
    }
  };

  const handleAiAdd = async (entries) => {
    for (const e of entries) {
      const net = (Number(e.major_expense)||0) + (Number(e.non_recurring_expense)||0) +
                  (Number(e.regular_expense)||0) + (Number(e.emi)||0) + (Number(e.trips_expense)||0);
      const actual = (Number(e.income)||0) + (Number(e.other_income)||0) - net;
      await api.post('/cashflow', {
        month:                 e.month,
        person:                e.person || currentPerson,
        income:                Number(e.income)               || 0,
        other_income:          Number(e.other_income)         || 0,
        major_expense:         Number(e.major_expense)        || 0,
        non_recurring_expense: Number(e.non_recurring_expense)|| 0,
        regular_expense:       Number(e.regular_expense)      || 0,
        emi:                   Number(e.emi)                  || 0,
        trips_expense:         Number(e.trips_expense)        || 0,
        target_saving:         Number(e.target_saving)        || 0,
        net_expense:           net,
        actual_saving:         actual,
        target:                Number(e.target_saving)        || 0,
      });
    }
    load();
  };

  const handleDelete = async (row) => {
    if (!row.id) return alert('This row has no saved cashflow record to delete.');
    if (!confirm(`Delete cashflow record for ${fmtDate(row.month)} (${row.person})?`)) return;
    try {
      await api.delete(`/cashflow/${row.id}`);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to delete');
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Cashflow</h1>
          <p className="text-muted text-sm mt-0.5">Monthly income, expenses &amp; savings</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {persons.length > 1 && persons.map(p => (
            <button key={p} onClick={() => setActivePerson(p)}
              className={`px-4 py-2 rounded-lg text-sm font-mono transition-colors ${currentPerson === p ? 'bg-accent text-ink font-bold' : 'btn-ghost'}`}>
              {p}
            </button>
          ))}
          <button onClick={openAdd} className="btn-primary flex items-center gap-1.5 text-sm">
            <Plus size={14} /> Add Month
          </button>
          <div className="flex rounded-lg border border-border overflow-hidden text-sm">
            {[['charts', 'Charts'], ['table', 'Table']].map(([id, label]) => (
              <button key={id} onClick={() => setActiveTab(id)}
                className={`px-4 py-2 transition-colors ${activeTab === id ? 'bg-accent text-ink font-semibold' : 'text-soft hover:text-white'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {persons.length > 0 && <DefaultTargetWidget persons={persons.length ? persons : [currentPerson]} />}

      {loading &&<div className="py-16 text-center text-muted text-sm">Loading…</div>}

      {!loading && data.length === 0 && (
        <div className="card py-12 text-center space-y-2">
          <p className="text-muted">No cashflow data yet.</p>
          <p className="text-xs text-muted">
            Click <strong>Add Month</strong> to enter a month, or use <strong>Settings → Apply to year</strong> to seed all 12 months at once.
          </p>
        </div>
      )}

      {/* Charts */}
      {!loading && data.length > 0 && activeTab === 'charts' && (
        <div className="space-y-4">
          <CorpusChart  data={data} />
          <SavingChart  data={data} />
          <ExpenseChart data={data} />
        </div>
      )}

      {/* Table */}
      {!loading && data.length > 0 && activeTab === 'table' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Month','Income','Other Inc','Major','Non-Rec','Regular','EMI','Trips','Net Exp','Target Save','Actual Save','Corpus',''].map(h => (
                    <th key={h} className="text-left py-3 px-3 text-muted font-display text-xs uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...data].reverse().map(row => {
                  const rowKey = row.id || `${row.person}-${row.month}`;
                  const isEditingRow = inlineEdit.rowKey === rowKey;
                  const ok = Number(row.actual_saving) >= Number(row.target_saving || row.target);
                  return (
                    <tr key={rowKey}
                      className="border-b border-border/50 hover:bg-surface/50 transition-colors group">
                      <td className="py-3 px-3 font-mono text-xs text-soft whitespace-nowrap">{fmtDate(row.month)}</td>
                      <td className="py-3 px-3 font-mono text-accent">{fmt(row.income)}</td>
                      <td className="py-3 px-3 font-mono text-accent">{fmt(row.other_income)}</td>
                      <td className="py-3 px-3 font-mono text-rose">{fmt(row.major_expense)}</td>
                      <td className="py-3 px-3 font-mono text-rose">{fmt(row.non_recurring_expense)}</td>
                      <td className="py-3 px-3 font-mono text-soft">{fmt(row.regular_expense)}</td>
                      <td className="py-3 px-3 font-mono text-rose">{fmt(row.emi)}</td>
                      <td className="py-3 px-3 font-mono text-rose">{fmt(row.trips_expense)}</td>
                      <td className="py-3 px-3 font-mono text-rose">{fmt(row.net_expense)}</td>
                      <td className="py-2 px-3">
                        {isEditingRow ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              className="input py-1 px-2 w-24 text-xs font-mono"
                              value={inlineEdit.value}
                              autoFocus
                              onChange={e => setInlineEdit(s => ({ ...s, value: e.target.value }))}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleInlineSave(row);
                                if (e.key === 'Escape') cancelInlineEdit();
                              }}
                            />
                            <button onClick={() => handleInlineSave(row)} className="p-1 rounded hover:bg-teal/10 text-teal" title="Save">
                              <Check size={13} />
                            </button>
                            <button onClick={cancelInlineEdit} className="p-1 rounded hover:bg-surface text-muted hover:text-white" title="Cancel">
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <span className="font-mono text-muted">{fmt(row.target_saving || row.target)}</span>
                        )}
                      </td>
                      <td className={`py-3 px-3 font-mono ${ok ? 'text-teal' : 'text-rose'}`}>{fmt(row.actual_saving)}</td>
                      <td className="py-3 px-3 font-mono text-white">{fmt(row.corpus)}</td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => startInlineEdit(row)} className="p-1.5 rounded hover:bg-surface text-muted hover:text-white" title="Edit target saving">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => handleDelete(row)} className="p-1.5 rounded hover:bg-rose/10 text-muted hover:text-rose" title="Delete">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal && (
        <MonthModal
          persons={persons.length ? persons : [currentPerson]}
          editRow={modal === 'add' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}
