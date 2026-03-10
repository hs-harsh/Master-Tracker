import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import api from '../lib/api';
import { fmt, fmtDate } from '../lib/utils';
import { useAuth } from '../hooks/useAuth';

export default function Cashflow() {
  const { personName, persons } = useAuth();
  const [person, setPerson] = useState('');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (persons.length && !person) setPerson(persons[0]);
  }, [persons]);

  const activePerson = person || personName;

  useEffect(() => {
    if (!activePerson) return;
    setLoading(true);
    api.get(`/cashflow?person=${activePerson}`)
      .then(r => setData(r.data))
      .finally(() => setLoading(false));
  }, [activePerson]);

  const chartData = data.slice(-12).map(r => ({
    month: fmtDate(r.month),
    Income: Number(r.income) + Number(r.other_income || 0),
    Expense: Number(r.net_expense),
    Saving: Number(r.actual_saving),
  }));

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Cashflow</h1>
          <p className="text-muted text-sm mt-0.5">Monthly income, expenses & savings</p>
        </div>
        {persons.length > 1 && (
          <div className="flex gap-2">
            {persons.map(p => (
              <button key={p} onClick={() => setPerson(p)}
                className={`px-4 py-2 rounded-lg text-sm font-mono transition-colors ${activePerson === p ? 'bg-accent text-ink font-bold' : 'btn-ghost'}`}>
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Chart */}
      {!loading && data.length > 0 && (
        <div className="card">
          <p className="stat-label mb-4">Income vs Expenses (Last 12 months)</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} barGap={2} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => fmt(v)} width={55} />
              <Tooltip
                contentStyle={{ background: '#1e2330', border: '1px solid #2a3040', borderRadius: 8, fontSize: 12, color: '#e5e7eb' }}
                labelStyle={{ color: '#e5e7eb' }}
                itemStyle={{ color: '#e5e7eb' }}
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
                {['Month', 'Income', 'Other Inc', 'Major Exp', 'Non-Recur', 'Regular', 'EMI', 'Trip Exp', 'Net Exp', 'Target', 'Actual Save', 'Corpus'].map(h => (
                  <th key={h} className="text-left py-3 px-3 text-muted font-display text-xs uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} className="py-8 text-center text-muted font-mono text-sm">Loading…</td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={12} className="py-8 text-center text-muted">No data. Add transactions to see cashflow.</td></tr>
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
                      <td className="py-3 px-3 font-mono text-accent">{fmt(row.other_income)}</td>
                      <td className="py-3 px-3 font-mono text-rose">{fmt(row.major_expense)}</td>
                      <td className="py-3 px-3 font-mono text-rose">{fmt(row.non_recurring_expense)}</td>
                      <td className="py-3 px-3 font-mono text-soft">{fmt(row.regular_expense)}</td>
                      <td className="py-3 px-3 font-mono text-rose">{fmt(row.emi)}</td>
                      <td className="py-3 px-3 font-mono text-rose">{fmt(row.trips_expense)}</td>
                      <td className="py-3 px-3 font-mono text-rose">{fmt(row.net_expense)}</td>
                      <td className="py-3 px-3 font-mono text-soft">{fmt(row.target)}</td>
                      <td className={`py-3 px-3 font-mono ${savingOk ? 'text-teal' : 'text-rose'}`}>{fmt(row.actual_saving)}</td>
                      <td className="py-3 px-3 font-mono text-white">{fmt(row.corpus)}</td>
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
