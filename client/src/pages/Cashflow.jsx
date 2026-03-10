import { useEffect, useState, useCallback } from 'react';
import {
  AreaChart, Area, ComposedChart, BarChart, Bar, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { Plus, Pencil, Trash2, X, Save } from 'lucide-react';
import api from '../lib/api';
import { fmt, fmtDate } from '../lib/utils';
import { useAuth } from '../hooks/useAuth';

// ── Shared chart helpers ───────────────────────────────────────────────────────
const TT = {
  contentStyle: { background: '#1e2330', border: '1px solid #2a3040', borderRadius: 8, fontSize: 12, color: '#e5e7eb' },
  labelStyle:   { color: '#9ca3af', marginBottom: 4 },
  formatter:    (v) => [fmt(v), ''],
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

// ── Charts ────────────────────────────────────────────────────────────────────
function CorpusChart({ data }) {
  let cumPlan = 0;
  const cd = data.map(r => {
    cumPlan += Number(r.ideal_saving) || 0;
    return { month: fmtDate(r.month), 'Planned': cumPlan, 'Actual': Number(r.corpus) || 0 };
  });
  return (
    <div className="card">
      <p className="stat-label mb-0.5">Planned vs Actual Corpus</p>
      <p className="text-xs text-muted mb-4">Cumulative ideal-saving target vs real accumulated savings</p>
      <ResponsiveContainer width="100%" height={210}>
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
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a3040" vertical={false} />
          <XAxis dataKey="month" {...AX} />
          <YAxis {...AX} tickFormatter={v => fmt(v)} width={58} />
          <Tooltip {...TT} />
          <Area type="monotone" dataKey="Planned" stroke="#6366f1" strokeWidth={1.8} fill="url(#gPlan)" dot={false} strokeDasharray="5 3" />
          <Area type="monotone" dataKey="Actual"  stroke="#2dd4bf" strokeWidth={2.5} fill="url(#gAct)"  dot={false} />
        </AreaChart>
      </ResponsiveContainer>
      <Leg items={[['Planned Corpus', '#6366f1', true], ['Actual Corpus', '#2dd4bf']]} />
    </div>
  );
}

function SavingChart({ data }) {
  const cd = data.map(r => ({
    month: fmtDate(r.month),
    Income: (Number(r.income) || 0) + (Number(r.other_income) || 0),
    'Actual Saving': Number(r.actual_saving) || 0,
    'Ideal Saving':  Number(r.ideal_saving) || 0,
  }));
  return (
    <div className="card">
      <p className="stat-label mb-0.5">Income vs Saving</p>
      <p className="text-xs text-muted mb-4">Monthly income, what was saved, and the ideal saving target</p>
      <ResponsiveContainer width="100%" height={210}>
        <ComposedChart data={cd} barGap={2} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a3040" vertical={false} />
          <XAxis dataKey="month" {...AX} />
          <YAxis {...AX} tickFormatter={v => fmt(v)} width={58} />
          <Tooltip {...TT} />
          <Bar dataKey="Income"        fill="#f0c040" opacity={0.35} radius={[2, 2, 0, 0]} />
          <Bar dataKey="Actual Saving" fill="#2dd4bf" radius={[3, 3, 0, 0]} />
          <Line type="monotone" dataKey="Ideal Saving" stroke="#6366f1" strokeWidth={2} dot={false} strokeDasharray="5 3" />
        </ComposedChart>
      </ResponsiveContainer>
      <Leg items={[['Income', '#f0c040'], ['Actual Saving', '#2dd4bf'], ['Ideal Saving', '#6366f1', true]]} />
    </div>
  );
}

function CumulativeIncomeChart({ data }) {
  let cum = 0;
  const cd = data.map(r => {
    cum += (Number(r.income) || 0) + (Number(r.other_income) || 0);
    return { month: fmtDate(r.month), Monthly: (Number(r.income)||0) + (Number(r.other_income)||0), Cumulative: cum };
  });
  return (
    <div className="card">
      <p className="stat-label mb-0.5">Cumulative Income</p>
      <p className="text-xs text-muted mb-4">Running total of salary + other income over time</p>
      <ResponsiveContainer width="100%" height={210}>
        <ComposedChart data={cd} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="gInc" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#f0c040" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#f0c040" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a3040" vertical={false} />
          <XAxis dataKey="month" {...AX} />
          <YAxis {...AX} tickFormatter={v => fmt(v)} width={58} />
          <Tooltip {...TT} />
          <Bar dataKey="Monthly" fill="#f0c040" opacity={0.4} radius={[2, 2, 0, 0]} />
          <Area type="monotone" dataKey="Cumulative" stroke="#f0c040" strokeWidth={2.5} fill="url(#gInc)" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <Leg items={[['Monthly', '#f0c040'], ['Cumulative', '#f0c040']]} />
    </div>
  );
}

function ExpenseChart({ data }) {
  const cd = data.map(r => ({
    month:  fmtDate(r.month),
    Major:  Number(r.major_expense) || 0,
    'Non-Recurring': Number(r.non_recurring_expense) || 0,
    Regular: Number(r.regular_expense) || 0,
    EMI:    Number(r.emi) || 0,
    Trips:  Number(r.trips_expense) || 0,
  }));
  const EXP = [['Major','#fb7185'],['Non-Recurring','#f97316'],['Regular','#facc15'],['EMI','#a78bfa'],['Trips','#60a5fa']];
  return (
    <div className="card">
      <p className="stat-label mb-0.5">Expense Breakdown</p>
      <p className="text-xs text-muted mb-4">Monthly spend stacked by category</p>
      <ResponsiveContainer width="100%" height={210}>
        <BarChart data={cd} barSize={18} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a3040" vertical={false} />
          <XAxis dataKey="month" {...AX} />
          <YAxis {...AX} tickFormatter={v => fmt(v)} width={58} />
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

// ── Add / Edit modal ──────────────────────────────────────────────────────────
const EMPTY = (def = {}) => ({
  month:                  def.month  || '',
  person:                 def.person || '',
  income:                 def.income          ?? '',
  other_income:           def.other_income    ?? 0,
  major_expense:          def.major_expense   ?? 0,
  non_recurring_expense:  def.non_recurring_expense ?? 0,
  regular_expense:        def.regularExpense  ?? def.regular_expense ?? '',
  emi:                    def.emi             ?? '',
  trips_expense:          def.trips_expense   ?? 0,
  ideal_saving:           def.idealSaving     ?? def.ideal_saving ?? '',
});

function Field({ label, name, form, setForm, type = 'number', readOnly = false }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type={type}
        className={`input w-full ${readOnly ? 'opacity-60 cursor-not-allowed' : ''}`}
        value={form[name]}
        readOnly={readOnly}
        onChange={e => !readOnly && setForm(f => ({ ...f, [name]: e.target.value }))}
      />
    </div>
  );
}

function MonthModal({ persons, defaults, editRow, onClose, onSaved }) {
  const isEdit = !!editRow?.id;
  const [form, setForm] = useState(() => {
    if (editRow) {
      // Pre-fill from existing row (may or may not have a DB id).
      // The row already has defaults applied by the cashflow query, so all fields are populated.
      return {
        ...editRow,
        // Ensure month is in YYYY-MM-DD format
        month: editRow.month ? String(editRow.month).slice(0, 10) : '',
      };
    }
    return EMPTY({ ...defaults, person: persons[0] || '' });
  });
  const [saving, setSaving] = useState(false);

  // derived values shown live
  const income       = Number(form.income) || 0;
  const otherInc     = Number(form.other_income) || 0;
  const majorExp     = Number(form.major_expense) || 0;
  const nonRec       = Number(form.non_recurring_expense) || 0;
  const regular      = Number(form.regular_expense) || 0;
  const emi          = Number(form.emi) || 0;
  const trips        = Number(form.trips_expense) || 0;
  const netExp       = majorExp + nonRec + regular + emi + trips;
  const actualSaving = (income + otherInc) - netExp;
  const idealSaving  = Number(form.ideal_saving) || 0;

  const handleSave = async () => {
    if (!form.month || !form.person) return alert('Month and person are required.');
    setSaving(true);
    try {
      const payload = {
        ...form,
        net_expense:   netExp,
        actual_saving: actualSaving,
        ideal_saving:  idealSaving,
        target:        idealSaving,
      };
      if (isEdit) {
        // Existing DB row — use PUT
        await api.put(`/cashflow/${editRow.id}`, payload);
      } else {
        // New row or transaction-only row — POST uses ON CONFLICT UPDATE
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
        {/* Header */}
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
                  onChange={e => setForm(f => ({ ...f, person: e.target.value }))}>
                  {persons.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              )}
            </div>
          </div>

          {/* Income defaults */}
          <div>
            <p className="text-xs text-muted uppercase tracking-wider mb-2 font-display">Income</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Salary / Income" name="income" form={form} setForm={setForm} />
              <Field label="Other Income"    name="other_income" form={form} setForm={setForm} />
            </div>
          </div>

          {/* Saving target */}
          <div>
            <p className="text-xs text-muted uppercase tracking-wider mb-2 font-display">Saving Target</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ideal Saving" name="ideal_saving" form={form} setForm={setForm} />
              <div className="flex flex-col justify-end">
                <label className="label">Actual Saving (auto)</label>
                <div className={`input w-full font-mono ${actualSaving >= idealSaving ? 'text-teal' : 'text-rose'}`}>
                  {fmt(actualSaving)}
                </div>
              </div>
            </div>
          </div>

          {/* Fixed expenses */}
          <div>
            <p className="text-xs text-muted uppercase tracking-wider mb-2 font-display">Fixed Expenses (from settings defaults)</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Regular Expense" name="regular_expense" form={form} setForm={setForm} />
              <Field label="EMI"             name="emi"             form={form} setForm={setForm} />
            </div>
          </div>

          {/* Variable expenses */}
          <div>
            <p className="text-xs text-muted uppercase tracking-wider mb-2 font-display">Variable Expenses (from transactions)</p>
            <p className="text-xs text-muted mb-2">These are normally auto-filled from your transactions. Override here only if needed.</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Major Expense"       name="major_expense"          form={form} setForm={setForm} />
              <Field label="Non-Recurring Exp"   name="non_recurring_expense"  form={form} setForm={setForm} />
              <Field label="Trips Expense"       name="trips_expense"          form={form} setForm={setForm} />
            </div>
          </div>

          {/* Computed summary */}
          <div className="rounded-lg bg-surface border border-border p-4 grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-muted text-xs">Net Expense</p>
              <p className="font-mono text-rose font-semibold">{fmt(netExp)}</p>
            </div>
            <div>
              <p className="text-muted text-xs">Actual Saving</p>
              <p className={`font-mono font-semibold ${actualSaving >= idealSaving ? 'text-teal' : 'text-rose'}`}>{fmt(actualSaving)}</p>
            </div>
            <div>
              <p className="text-muted text-xs">vs Ideal</p>
              <p className={`font-mono font-semibold ${actualSaving >= idealSaving ? 'text-teal' : 'text-rose'}`}>
                {actualSaving >= idealSaving ? '+' : ''}{fmt(actualSaving - idealSaving)}
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-2 p-5 border-t border-border">
          <button onClick={handleSave} disabled={saving}
            className="btn-primary flex items-center gap-2">
            <Save size={14} /> {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={onClose} className="btn-ghost">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function Cashflow() {
  const { personName, persons } = useAuth();
  const [person, setPerson] = useState('');
  const [data, setData]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('charts');
  const [modal, setModal]   = useState(null); // null | 'add' | rowObj (edit)
  const [defaults, setDefaults] = useState(null);

  useEffect(() => {
    if (persons.length && !person) setPerson(persons[0]);
  }, [persons]);

  const activePerson = person || personName;

  const load = useCallback(() => {
    if (!activePerson) return;
    setLoading(true);
    api.get(`/cashflow?person=${activePerson}`)
      .then(r => setData(r.data))
      .finally(() => setLoading(false));
  }, [activePerson]);

  useEffect(() => { load(); }, [load]);

  const openAdd = async () => {
    if (!defaults) {
      const r = await api.get('/cashflow/defaults');
      setDefaults(r.data);
    }
    setModal('add');
  };

  const openEdit = async (row) => {
    if (!defaults) {
      const r = await api.get('/cashflow/defaults');
      setDefaults(r.data);
    }
    setModal(row);
  };

  const handleDelete = async (row) => {
    if (!row.id) return alert('This row has no saved cashflow record to delete. Only transaction data exists.');
    if (!confirm(`Delete cashflow record for ${fmtDate(row.month)} (${row.person})?`)) return;
    try {
      await api.delete(`/cashflow/${row.id}`);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to delete');
    }
  };

  const chartData = data.slice(-24);

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Cashflow</h1>
          <p className="text-muted text-sm mt-0.5">Monthly income, expenses &amp; savings</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {persons.length > 1 && persons.map(p => (
            <button key={p} onClick={() => setPerson(p)}
              className={`px-4 py-2 rounded-lg text-sm font-mono transition-colors ${activePerson === p ? 'bg-accent text-ink font-bold' : 'btn-ghost'}`}>
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

      {loading && <div className="py-16 text-center text-muted text-sm">Loading…</div>}

      {!loading && data.length === 0 && (
        <div className="card py-12 text-center space-y-2">
          <p className="text-muted">No cashflow data yet.</p>
          <p className="text-xs text-muted">
            Click <strong>Add Month</strong> to enter a month manually, or set defaults in
            <strong> Settings → Apply to year</strong> to seed the whole year at once.
            Expense transactions are automatically aggregated here.
          </p>
        </div>
      )}

      {/* Charts */}
      {!loading && data.length > 0 && activeTab === 'charts' && (
        <div className="space-y-4">
          <CorpusChart  data={chartData} />
          <SavingChart  data={chartData} />
          <CumulativeIncomeChart data={chartData} />
          <ExpenseChart data={chartData} />
        </div>
      )}

      {/* Table */}
      {!loading && data.length > 0 && activeTab === 'table' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Month','Income','Other Inc','Major','Non-Rec','Regular','EMI','Trips','Net Exp','Ideal Save','Actual Save','Corpus',''].map(h => (
                    <th key={h} className="text-left py-3 px-3 text-muted font-display text-xs uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...data].reverse().map(row => {
                  const ok = Number(row.actual_saving) >= Number(row.ideal_saving || row.target);
                  return (
                    <tr key={row.id || `${row.person}-${row.month}`}
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
                      <td className="py-3 px-3 font-mono text-muted">{fmt(row.ideal_saving || row.target)}</td>
                      <td className={`py-3 px-3 font-mono ${ok ? 'text-teal' : 'text-rose'}`}>{fmt(row.actual_saving)}</td>
                      <td className="py-3 px-3 font-mono text-white">{fmt(row.corpus)}</td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEdit(row)} className="p-1.5 rounded hover:bg-surface text-muted hover:text-white transition-colors" title="Edit">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => handleDelete(row)} className="p-1.5 rounded hover:bg-rose/10 text-muted hover:text-rose transition-colors" title="Delete">
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

      {/* Modal */}
      {modal && (
        <MonthModal
          persons={persons.length ? persons : [activePerson]}
          defaults={defaults || {}}
          editRow={modal === 'add' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
            // Switch to Charts tab so the updated plots are immediately visible
            setActiveTab('charts');
          }}
        />
      )}
    </div>
  );
}
