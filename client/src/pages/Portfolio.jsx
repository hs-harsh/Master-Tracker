import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import api from '../lib/api';
import { Edit2, Save, X, Plus, Trash2, TrendingUp, TrendingDown } from 'lucide-react';

const ASSET_CLASS_COLORS = { Equity: '#f97316', Gold: '#fbbf24', Debt: '#60a5fa', Cash: '#6b7280' };
const PORTFOLIOS = ['Loan 45L Split', 'Saving 35L Split'];

function ReturnBadge({ pct }) {
  const val = Number(pct) * 100;
  const positive = val >= 0;
  return (
    <span className={`flex items-center gap-0.5 text-xs font-mono ${positive ? 'text-teal' : 'text-rose'}`}>
      {positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {positive ? '+' : ''}{val.toFixed(1)}%
    </span>
  );
}

function EditRow({ row, onSave, onCancel }) {
  const [form, setForm] = useState(row);
  const ch = e => {
    const { name, value } = e.target;
    setForm(p => ({ ...p, [name]: ['allocation_pct', 'return_pct'].includes(name) ? parseFloat(value) : name === 'sub_type' || name === 'broker' || name === 'asset_class' ? value : parseFloat(value) }));
  };
  return (
    <tr className="bg-accent/5 border-b border-border">
      <td className="px-4 py-2">
        <input name="asset_class" value={form.asset_class} onChange={ch} className="input text-xs py-1" />
      </td>
      <td className="px-4 py-2">
        <input name="sub_type" value={form.sub_type || ''} onChange={ch} className="input text-xs py-1" />
      </td>
      <td className="px-4 py-2">
        <input name="initial_amount" type="number" step="0.1" value={form.initial_amount || ''} onChange={ch} className="input text-xs py-1 w-24" />
      </td>
      <td className="px-4 py-2">
        <input name="amount_sep25" type="number" step="0.01" value={form.amount_sep25 || ''} onChange={ch} className="input text-xs py-1 w-24" />
      </td>
      <td className="px-4 py-2">
        <input name="amount_jan26" type="number" step="0.01" value={form.amount_jan26 || ''} onChange={ch} className="input text-xs py-1 w-24" />
      </td>
      <td className="px-4 py-2">
        <input name="broker" value={form.broker || ''} onChange={ch} className="input text-xs py-1" />
      </td>
      <td className="px-4 py-2">
        <input name="return_pct" type="number" step="0.001" value={form.return_pct || ''} onChange={ch} className="input text-xs py-1 w-20" />
      </td>
      <td className="px-4 py-2">
        <div className="flex gap-2">
          <button onClick={() => onSave(form)} className="text-teal hover:text-white transition-colors"><Save size={14} /></button>
          <button onClick={onCancel} className="text-muted hover:text-white transition-colors"><X size={14} /></button>
        </div>
      </td>
    </tr>
  );
}

export default function Portfolio() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState(null);
  const [activePortfolio, setActivePortfolio] = useState('Loan 45L Split');

  const load = () => {
    setLoading(true);
    api.get('/portfolio').then(r => setData(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handleSave = async (form) => {
    await api.put(`/portfolio/${form.id}`, form);
    setEditId(null);
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this holding?')) return;
    await api.delete(`/portfolio/${id}`);
    load();
  };

  const portfolioData = data.filter(d => d.portfolio_name === activePortfolio);
  const totalJan26 = portfolioData.reduce((s, d) => s + Number(d.amount_jan26 || 0), 0);

  // Charts
  const assetClassPie = portfolioData.reduce((acc, d) => {
    const key = d.asset_class;
    acc[key] = (acc[key] || 0) + Number(d.amount_jan26 || 0);
    return acc;
  }, {});
  const pieData = Object.entries(assetClassPie).map(([name, value]) => ({ name, value }));

  const barData = portfolioData.map(d => ({
    name: d.sub_type || d.asset_class,
    Initial: Number(d.initial_amount || 0),
    'Sep 25': Number(d.amount_sep25 || 0),
    'Jan 26': Number(d.amount_jan26 || 0),
  }));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Portfolio</h1>
          <p className="text-muted text-sm mt-0.5">Broker allocations & performance</p>
        </div>
        <div className="flex gap-2">
          {PORTFOLIOS.map(p => (
            <button key={p} onClick={() => setActivePortfolio(p)}
              className={`px-3 py-2 rounded-lg text-xs font-mono transition-colors ${activePortfolio === p ? 'bg-accent text-ink font-bold' : 'btn-ghost'}`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Summary + Charts row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Total value card */}
        <div className="card col-span-1 flex flex-col justify-between">
          <div>
            <p className="stat-label">Total Value (Jan 26)</p>
            <p className="font-mono text-2xl font-medium text-accent mt-2">{totalJan26.toFixed(2)}L</p>
            <p className="text-muted text-xs mt-1">₹{(totalJan26 * 100000).toLocaleString('en-IN')}</p>
          </div>
          <div className="mt-4 space-y-2">
            {pieData.map(d => (
              <div key={d.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-soft">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ASSET_CLASS_COLORS[d.name] || '#9ca3af' }} />
                  {d.name}
                </div>
                <span className="font-mono text-xs text-white">{d.value.toFixed(2)}L</span>
              </div>
            ))}
          </div>
        </div>

        {/* Pie chart */}
        <div className="card">
          <p className="stat-label mb-3">Asset Class Mix</p>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" strokeWidth={0}>
                {pieData.map((d, i) => <Cell key={i} fill={ASSET_CLASS_COLORS[d.name] || '#9ca3af'} />)}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#1e2330', border: '1px solid #2a3040', borderRadius: 8, fontSize: 12 }}
                formatter={v => [`${v.toFixed(2)}L`, '']}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Bar chart */}
        <div className="card">
          <p className="stat-label mb-3">Growth by Holding (₹L)</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={barData} margin={{ top: 4, right: 4, bottom: 20, left: 0 }}>
              <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 9 }} tickLine={false} axisLine={false} angle={-30} textAnchor="end" />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: '#1e2330', border: '1px solid #2a3040', borderRadius: 8, fontSize: 12 }}
                formatter={v => [`${v.toFixed(2)}L`, '']}
              />
              <Bar dataKey="Initial" fill="#2a3040" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Sep 25" fill="#60a5fa" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Jan 26" fill="#f0c040" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Holdings table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Asset Class', 'Sub Type', 'Initial (L)', 'Sep 25 (L)', 'Jan 26 (L)', 'Broker', 'Return', ''].map(h => (
                  <th key={h} className="text-left py-3 px-4 text-muted font-display text-xs uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="py-8 text-center text-muted font-mono text-sm animate-pulse">Loading…</td></tr>
              ) : portfolioData.length === 0 ? (
                <tr><td colSpan={8} className="py-8 text-center text-muted">No holdings for this portfolio</td></tr>
              ) : (
                portfolioData.map(row =>
                  editId === row.id ? (
                    <EditRow key={row.id} row={row} onSave={handleSave} onCancel={() => setEditId(null)} />
                  ) : (
                    <tr key={row.id} className="border-b border-border/40 hover:bg-surface/40 transition-colors">
                      <td className="py-3 px-4">
                        <span className="text-xs px-2 py-0.5 rounded font-mono" style={{ backgroundColor: (ASSET_CLASS_COLORS[row.asset_class] || '#6b7280') + '20', color: ASSET_CLASS_COLORS[row.asset_class] || '#9ca3af' }}>
                          {row.asset_class}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-white text-sm">{row.sub_type || '—'}</td>
                      <td className="py-3 px-4 font-mono text-soft">{Number(row.initial_amount || 0).toFixed(2)}</td>
                      <td className="py-3 px-4 font-mono text-soft">{Number(row.amount_sep25 || 0).toFixed(2)}</td>
                      <td className="py-3 px-4 font-mono text-white font-medium">{Number(row.amount_jan26 || 0).toFixed(2)}</td>
                      <td className="py-3 px-4 text-xs text-muted">{row.broker || '—'}</td>
                      <td className="py-3 px-4"><ReturnBadge pct={row.return_pct} /></td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          <button onClick={() => setEditId(row.id)} className="text-muted hover:text-accent transition-colors"><Edit2 size={14} /></button>
                          <button onClick={() => handleDelete(row.id)} className="text-muted hover:text-rose transition-colors"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
