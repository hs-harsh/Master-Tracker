import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import api from '../lib/api';
import { fmt, fmtDate } from '../lib/utils';
import { Plus, Edit2, Trash2, ChevronDown, ChevronUp, Save, X } from 'lucide-react';

const PERSONS = ['Harsh', 'Kirti'];
const EMPTY = {
  month: '', person: 'Harsh', income: 0, other_income: 0,
  major_expense: 0, non_recurring_expense: 0, regular_expense: 0,
  emi: 0, trips_expense: 0, net_expense: 0, ideal_saving: 0,
  actual_saving: 0, target: 0, corpus: 0,
  cash: 0, gold_silver: 0, debt_pf: 0, debt_ppf: 0, debt_mf: 0,
  equity_indian: 0, equity_intl: 0, equity_nps: 0, equity_trading: 0,
  equity_smallcase: 0, real_estate: 0, home_loan: 0, personal_loan: 0,
  owed_friends: 0, net_total: 0, total_asset: 0, liability: 0, net_asset: 0,
  low_risk_pct: 0, medium_risk_pct: 0, high_risk_pct: 0,
};

function Field({ label, name, form, onChange, type = 'number' }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type={type}
        name={name}
        value={form[name] ?? ''}
        onChange={onChange}
        className="input"
      />
    </div>
  );
}

function EntryForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || EMPTY);
  const [section, setSection] = useState('cashflow');

  const onChange = e => {
    const { name, value } = e.target;
    setForm(p => ({ ...p, [name]: name === 'month' || name === 'person' ? value : Number(value) }));
  };

  return (
    <div className="card space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-bold text-white">{initial?.id ? 'Edit Entry' : 'New Month Entry'}</h3>
        <button onClick={onCancel} className="text-muted hover:text-white transition-colors"><X size={18} /></button>
      </div>

      {/* Section tabs */}
      <div className="flex gap-2 text-xs font-mono">
        {['cashflow', 'assets', 'liabilities'].map(s => (
          <button key={s} onClick={() => setSection(s)}
            className={`px-3 py-1.5 rounded-md capitalize transition-colors ${section === s ? 'bg-accent text-ink font-bold' : 'bg-surface text-soft hover:text-white'}`}>
            {s}
          </button>
        ))}
      </div>

      {section === 'cashflow' && (
        <div className="grid grid-cols-3 gap-3">
          <Field label="Month" name="month" form={form} onChange={onChange} type="date" />
          <div>
            <label className="label">Person</label>
            <select name="person" value={form.person} onChange={onChange} className="input">
              {PERSONS.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <Field label="Income" name="income" form={form} onChange={onChange} />
          <Field label="Other Income" name="other_income" form={form} onChange={onChange} />
          <Field label="Major Expense" name="major_expense" form={form} onChange={onChange} />
          <Field label="Non-Recurring" name="non_recurring_expense" form={form} onChange={onChange} />
          <Field label="Regular Expense" name="regular_expense" form={form} onChange={onChange} />
          <Field label="EMI" name="emi" form={form} onChange={onChange} />
          <Field label="Trips Expense" name="trips_expense" form={form} onChange={onChange} />
          <Field label="Net Expense" name="net_expense" form={form} onChange={onChange} />
          <Field label="Ideal Saving" name="ideal_saving" form={form} onChange={onChange} />
          <Field label="Actual Saving" name="actual_saving" form={form} onChange={onChange} />
          <Field label="Target" name="target" form={form} onChange={onChange} />
          <Field label="Corpus" name="corpus" form={form} onChange={onChange} />
        </div>
      )}

      {section === 'assets' && (
        <div className="grid grid-cols-3 gap-3">
          <Field label="Cash / Splitwise" name="cash" form={form} onChange={onChange} />
          <Field label="Gold / Silver" name="gold_silver" form={form} onChange={onChange} />
          <Field label="DEBT - PF" name="debt_pf" form={form} onChange={onChange} />
          <Field label="DEBT - PPF" name="debt_ppf" form={form} onChange={onChange} />
          <Field label="DEBT - Mutual Fund" name="debt_mf" form={form} onChange={onChange} />
          <Field label="Equity - Indian" name="equity_indian" form={form} onChange={onChange} />
          <Field label="Equity - International" name="equity_intl" form={form} onChange={onChange} />
          <Field label="Equity - NPS" name="equity_nps" form={form} onChange={onChange} />
          <Field label="Equity - Trading" name="equity_trading" form={form} onChange={onChange} />
          <Field label="Equity - Smallcase" name="equity_smallcase" form={form} onChange={onChange} />
          <Field label="Real Estate" name="real_estate" form={form} onChange={onChange} />
          <Field label="Total Asset" name="total_asset" form={form} onChange={onChange} />
          <Field label="Net Asset" name="net_asset" form={form} onChange={onChange} />
        </div>
      )}

      {section === 'liabilities' && (
        <div className="grid grid-cols-3 gap-3">
          <Field label="Home Loan" name="home_loan" form={form} onChange={onChange} />
          <Field label="Personal Loan" name="personal_loan" form={form} onChange={onChange} />
          <Field label="Owed Friends" name="owed_friends" form={form} onChange={onChange} />
          <Field label="Total Liability" name="liability" form={form} onChange={onChange} />
          <Field label="Net Total" name="net_total" form={form} onChange={onChange} />
          <Field label="Low Risk %" name="low_risk_pct" form={form} onChange={onChange} />
          <Field label="Medium Risk %" name="medium_risk_pct" form={form} onChange={onChange} />
          <Field label="High Risk %" name="high_risk_pct" form={form} onChange={onChange} />
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button onClick={() => onSave(form)} className="btn-primary flex items-center gap-2">
          <Save size={14} /> Save Entry
        </button>
        <button onClick={onCancel} className="btn-ghost">Cancel</button>
      </div>
    </div>
  );
}

export default function Cashflow() {
  const [data, setData] = useState([]);
  const [person, setPerson] = useState('Harsh');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = () => {
    setLoading(true);
    api.get(`/cashflow?person=${person}`)
      .then(r => setData(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [person]);

  const handleSave = async (form) => {
    try {
      if (form.id) {
        await api.put(`/cashflow/${form.id}`, form);
      } else {
        await api.post('/cashflow', form);
      }
      setShowForm(false);
      setEditing(null);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Save failed');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this entry?')) return;
    await api.delete(`/cashflow/${id}`);
    load();
  };

  const chartData = data.slice(-12).map(r => ({
    month: fmtDate(r.month),
    Income: Number(r.income),
    Expense: Number(r.net_expense),
    Saving: Number(r.actual_saving),
  }));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Cashflow</h1>
          <p className="text-muted text-sm mt-0.5">Monthly income, expenses & savings</p>
        </div>
        <div className="flex gap-2">
          {PERSONS.map(p => (
            <button key={p} onClick={() => setPerson(p)}
              className={`px-4 py-2 rounded-lg text-sm font-mono transition-colors ${person === p ? 'bg-accent text-ink font-bold' : 'btn-ghost'}`}>
              {p}
            </button>
          ))}
          <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary flex items-center gap-2">
            <Plus size={14} /> Add Month
          </button>
        </div>
      </div>

      {/* Form */}
      {(showForm || editing) && (
        <EntryForm
          initial={editing}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      {/* Chart */}
      {!loading && data.length > 0 && (
        <div className="card">
          <p className="stat-label mb-4">Income vs Expenses (Last 12 months)</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} barGap={2} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => fmt(v)} width={55} />
              <Tooltip
                contentStyle={{ background: '#1e2330', border: '1px solid #2a3040', borderRadius: 8, fontSize: 12 }}
                formatter={v => [fmt(v), '']}
              />
              <ReferenceLine y={0} stroke="#2a3040" />
              <Bar dataKey="Income" fill="#f0c040" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Expense" fill="#fb7185" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Saving" fill="#2dd4bf" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-3">
            {[['Income', '#f0c040'], ['Expense', '#fb7185'], ['Saving', '#2dd4bf']].map(([l, c]) => (
              <div key={l} className="flex items-center gap-1.5 text-xs text-soft">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c }} />
                {l}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Month', 'Income', 'Major Exp', 'Regular', 'Net Exp', 'Ideal Save', 'Actual Save', 'Corpus', ''].map(h => (
                  <th key={h} className="text-left py-3 px-3 text-muted font-display text-xs uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="py-8 text-center text-muted font-mono text-sm">Loading…</td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={9} className="py-8 text-center text-muted">No data yet. Add your first month!</td></tr>
              ) : (
                [...data].reverse().map(row => {
                  const savingOk = Number(row.actual_saving) >= Number(row.target);
                  return (
                    <tr
                      key={row.id || `${row.person}-${row.month}`}
                      className="border-b border-border/50 hover:bg-surface/50 transition-colors"
                    >
                      <td className="py-3 px-3 font-mono text-xs text-soft">{fmtDate(row.month)}</td>
                      <td className="py-3 px-3 font-mono text-accent">{fmt(row.income)}</td>
                      <td className="py-3 px-3 font-mono text-rose">{fmt(row.major_expense)}</td>
                      <td className="py-3 px-3 font-mono text-soft">{fmt(row.regular_expense)}</td>
                      <td className="py-3 px-3 font-mono text-rose">{fmt(row.net_expense)}</td>
                      <td className="py-3 px-3 font-mono text-soft">{fmt(row.ideal_saving)}</td>
                      <td className={`py-3 px-3 font-mono ${savingOk ? 'text-teal' : 'text-rose'}`}>{fmt(row.actual_saving)}</td>
                      <td className="py-3 px-3 font-mono text-white">{fmt(row.corpus)}</td>
                      <td className="py-3 px-3">
                        {row.id ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => { setEditing(row); setShowForm(false); }}
                              className="text-muted hover:text-accent transition-colors"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => handleDelete(row.id)}
                              className="text-muted hover:text-rose transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ) : (
                          <span className="text-muted text-xs">From transactions</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
