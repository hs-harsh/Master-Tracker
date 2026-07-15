import { useEffect, useState, useMemo, useCallback } from 'react';
import api from '../lib/api';
import { fmt, fmtDate } from '../lib/utils';
import { useAuth } from '../hooks/useAuth';
import {
  Plus, Trash2, Edit2, X, Save, ArrowUp, ArrowDown,
  LayoutList, LayoutGrid, Camera, Mail, Tag, ChevronRight,
} from 'lucide-react';
import {
  ComposedChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, Legend,
} from 'recharts';

const DEFAULT_TYPES = ['Property', 'Vehicle', 'Gold', 'PPF', 'NPS'];
const HAS_LOAN_DEFAULT = ['Property', 'Vehicle'];
const HAS_QTY_DEFAULT  = ['Gold'];
const HAS_CONTRIBUTION = ['PPF', 'NPS'];

const DEFAULT_COLORS = {
  Property: '#a78bfa',
  Vehicle:  '#60a5fa',
  Gold:     '#fbbf24',
  PPF:      '#34d399',
  NPS:      '#2dd4bf',
};

const today = () => new Date().toISOString().slice(0, 10);

function fmt2(n) {
  if (n == null || n === '') return '—';
  return fmt(Number(n));
}

function TypeBadge({ type, color }) {
  const c = color || DEFAULT_COLORS[type] || '#6b7280';
  return (
    <span
      className="text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{ background: c + '22', color: c }}
    >
      {type}
    </span>
  );
}

// ── Add Category Modal ───────────────────────────────────────────────────────

function CategoryModal({ onSave, onCancel }) {
  const [form, setForm] = useState({
    type_name: '', color: '#9ca3af', has_loan: false, has_qty: false,
  });
  const onChange = e => {
    const { name, value, type, checked } = e.target;
    setForm(p => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
  };
  const handleSubmit = e => {
    e.preventDefault();
    if (!form.type_name.trim()) return;
    onSave(form);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <form onSubmit={handleSubmit} className="card w-full max-w-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-white">New Category</h3>
          <button type="button" onClick={onCancel} className="text-muted hover:text-white"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="label">Category Name</label>
            <input
              type="text" name="type_name" value={form.type_name} onChange={onChange}
              className="input" required placeholder="e.g. PF, FD, Crypto"
            />
          </div>
          <div>
            <label className="label">Color</label>
            <div className="flex items-center gap-3">
              <input type="color" name="color" value={form.color} onChange={onChange}
                className="w-10 h-10 rounded cursor-pointer border-0 bg-transparent" />
              <span className="text-sm text-muted">{form.color}</span>
            </div>
          </div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm text-soft cursor-pointer">
              <input type="checkbox" name="has_loan" checked={form.has_loan} onChange={onChange} className="rounded" />
              Has loan/liability
            </label>
            <label className="flex items-center gap-2 text-sm text-soft cursor-pointer">
              <input type="checkbox" name="has_qty" checked={form.has_qty} onChange={onChange} className="rounded" />
              Has quantity field
            </label>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onCancel} className="btn-ghost">Cancel</button>
          <button type="submit" className="btn-primary flex items-center gap-2">
            <Save size={14} /> Save Category
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Detail Modal ─────────────────────────────────────────────────────────────

function DetailModal({ asset, typeColor, onClose, onEdit }) {
  const { token } = useAuth();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || !asset) return;
    api.get(`/other-assets/${asset.id}/history`)
      .then(r => setHistory(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, asset]);

  const cur = Number(asset.current_value) || 0;
  const loan = Number(asset.loan_outstanding) || 0;
  const purch = asset.purchase_value != null ? Number(asset.purchase_value) : null;
  const equity = cur - loan;
  const gain = purch != null && purch > 0 ? ((cur - purch) / purch) * 100 : null;
  const color = typeColor || '#9ca3af';

  const chartData = history.map(h => ({
    date: String(h.date).slice(0, 10),
    Value: +(Number(h.current_value) / 100000).toFixed(2),
    Loan:  +(Number(h.loan_outstanding) / 100000).toFixed(2),
  }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="card w-full max-w-xl space-y-4 overflow-y-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <TypeBadge type={asset.asset_type} color={color} />
            <span className="font-bold text-white">{asset.name}</span>
            <span className="text-xs text-muted px-2 py-0.5 rounded-full bg-white/5">{asset.account}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => { onClose(); onEdit(asset); }}
              className="text-muted hover:text-white p-1"><Edit2 size={15} /></button>
            <button onClick={onClose} className="text-muted hover:text-white p-1"><X size={18} /></button>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
            <div className="text-xs text-muted mb-1">Current Value</div>
            <div className="font-bold text-white text-sm">{fmt2(cur)}</div>
          </div>
          {purch != null && (
            <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
              <div className="text-xs text-muted mb-1">Cost / Contributed</div>
              <div className="font-bold text-soft text-sm">{fmt2(purch)}</div>
            </div>
          )}
          {loan > 0 && (
            <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
              <div className="text-xs text-muted mb-1">Loan Outstanding</div>
              <div className="font-bold text-rose-400 text-sm">{fmt2(loan)}</div>
            </div>
          )}
          <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
            <div className="text-xs text-muted mb-1">Net Equity</div>
            <div className={`font-bold text-sm ${equity >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{fmt2(equity)}</div>
          </div>
          {gain != null && (
            <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
              <div className="text-xs text-muted mb-1">Return</div>
              <div className={`font-bold text-sm ${gain >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {gain >= 0 ? '+' : ''}{gain.toFixed(1)}%
              </div>
            </div>
          )}
        </div>

        {/* EMI details */}
        {asset.loan_emi && Number(asset.loan_emi) > 0 && (
          <div className="flex flex-wrap gap-4 text-sm bg-white/[0.02] rounded-lg p-3 border border-white/5">
            <div><span className="text-muted text-xs">EMI </span><span className="text-white">{fmt2(asset.loan_emi)}/mo</span></div>
            {asset.loan_interest_rate && (
              <div><span className="text-muted text-xs">Rate </span><span className="text-white">{asset.loan_interest_rate}%</span></div>
            )}
            {loan > 0 && asset.loan_emi && (
              <div><span className="text-muted text-xs">Tenure </span><span className="text-white">~{Math.round(loan / Number(asset.loan_emi))} mo</span></div>
            )}
          </div>
        )}

        {/* Meta */}
        <div className="text-xs text-muted">
          Last updated: {asset.as_of_date ? new Date(asset.as_of_date + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
          {asset.notes && <span className="ml-4 text-soft">{asset.notes}</span>}
        </div>

        {/* History chart */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted uppercase tracking-wide">Value History</div>
          {loading ? (
            <div className="text-muted text-xs py-6 text-center">Loading history…</div>
          ) : chartData.length < 2 ? (
            <div className="text-muted text-xs py-6 text-center">Not enough history yet. Values are recorded each time you save an update.</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fill: '#888', fontSize: 10 }} tickLine={false} />
                <YAxis tick={{ fill: '#888', fontSize: 10 }} tickLine={false} unit="L" width={36} />
                <Tooltip
                  contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8 }}
                  labelStyle={{ color: '#aaa', fontSize: 11 }}
                  formatter={(v, n) => [`₹${v}L`, n]}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: '#888' }} />
                <Area type="monotone" dataKey="Value" stroke={color} fill={color + '22'} strokeWidth={2} dot={{ r: 3, fill: color }} />
                {chartData.some(d => d.Loan > 0) && (
                  <Line type="monotone" dataKey="Loan" stroke="#fb7185" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Add/Edit Modal ───────────────────────────────────────────────────────────

function AssetModal({ initial, persons, assetTypes, typeMap, onSave, onCancel }) {
  const firstType = assetTypes[0] || 'Property';
  const EMPTY = {
    asset_type: firstType,
    name: '',
    account: persons[0] || '',
    current_value: '',
    purchase_value: '',
    loan_outstanding: '',
    loan_emi: '',
    loan_interest_rate: '',
    quantity: '',
    purchase_rate: '',
    current_rate: '',
    notes: '',
    as_of_date: today(),
  };

  const [form, setForm] = useState(() => {
    if (!initial) return EMPTY;
    const notes = initial.notes || '';
    let purchase_rate = '';
    let current_rate = '';
    if (initial.asset_type === 'Gold' && initial.quantity) {
      const q = Number(initial.quantity);
      if (q > 0) {
        if (initial.purchase_value) purchase_rate = (Number(initial.purchase_value) / q).toFixed(2);
        if (initial.current_value)  current_rate  = (Number(initial.current_value)  / q).toFixed(2);
      }
    }
    return { ...EMPTY, ...initial, purchase_rate, current_rate, notes };
  });

  const onChange = e => {
    const { name, value } = e.target;
    setForm(p => {
      const next = { ...p, [name]: value };
      if (p.asset_type === 'Gold') {
        const qty = Number(name === 'quantity' ? value : next.quantity) || 0;
        if (name === 'purchase_rate' || name === 'quantity') {
          const rate = Number(name === 'purchase_rate' ? value : next.purchase_rate) || 0;
          if (qty > 0 && rate > 0) next.purchase_value = (qty * rate).toFixed(2);
        }
        if (name === 'current_rate' || name === 'quantity') {
          const rate = Number(name === 'current_rate' ? value : next.current_rate) || 0;
          if (qty > 0 && rate > 0) next.current_value = (qty * rate).toFixed(2);
        }
      }
      return next;
    });
  };

  const onTypeChange = e => {
    setForm(p => ({ ...EMPTY, asset_type: e.target.value, account: p.account, as_of_date: p.as_of_date }));
  };

  const handleSubmit = e => {
    e.preventDefault();
    const meta = typeMap[form.asset_type] || {};
    const isLoan = meta.has_loan ?? HAS_LOAN_DEFAULT.includes(form.asset_type);
    const isQty  = meta.has_qty  ?? HAS_QTY_DEFAULT.includes(form.asset_type);
    const payload = {
      asset_type:         form.asset_type,
      name:               form.name.trim(),
      account:            form.account,
      current_value:      Number(form.current_value) || 0,
      purchase_value:     form.purchase_value !== '' ? Number(form.purchase_value) : null,
      loan_outstanding:   isLoan ? (Number(form.loan_outstanding) || 0) : 0,
      loan_emi:           isLoan ? (Number(form.loan_emi) || null) : null,
      loan_interest_rate: isLoan ? (Number(form.loan_interest_rate) || null) : null,
      quantity:           isQty  ? (Number(form.quantity) || null) : null,
      currency:           'INR',
      notes:              form.notes.trim() || null,
      as_of_date:         form.as_of_date || today(),
    };
    onSave(payload, initial?.id);
  };

  const meta = typeMap[form.asset_type] || {};
  const isGold   = form.asset_type === 'Gold';
  const isLoan   = meta.has_loan ?? HAS_LOAN_DEFAULT.includes(form.asset_type);
  const isContrib = HAS_CONTRIBUTION.includes(form.asset_type);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <form onSubmit={handleSubmit} className="card w-full max-w-lg space-y-4 overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-white">
            {initial?.id ? 'Edit Asset' : 'New Asset'}
          </h3>
          <button type="button" onClick={onCancel} className="text-muted hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Type */}
          <div>
            <label className="label">Asset Type</label>
            <select name="asset_type" value={form.asset_type} onChange={onTypeChange} className="input">
              {assetTypes.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          {/* Account */}
          <div>
            <label className="label">Account</label>
            <select name="account" value={form.account} onChange={onChange} className="input">
              {persons.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          {/* Name */}
          <div className="col-span-2">
            <label className="label">Name</label>
            <input
              type="text" name="name" value={form.name} onChange={onChange}
              className="input" required
              placeholder={
                isGold    ? 'e.g. SGB 2019, Gold Coins' :
                isLoan    ? 'e.g. Home – Bangalore, Honda City' :
                isContrib ? 'e.g. SBI PPF, NPS – Tier 1' : 'Asset name'
              }
            />
          </div>

          {/* Gold-specific */}
          {isGold && <>
            <div>
              <label className="label">Quantity (grams)</label>
              <input type="number" name="quantity" value={form.quantity} onChange={onChange} className="input" step="0.001" min="0" />
            </div>
            <div>
              <label className="label">Purchase Rate (₹/g)</label>
              <input type="number" name="purchase_rate" value={form.purchase_rate} onChange={onChange} className="input" step="0.01" min="0" />
            </div>
            <div>
              <label className="label">Current Rate (₹/g)</label>
              <input type="number" name="current_rate" value={form.current_rate} onChange={onChange} className="input" step="0.01" min="0" />
            </div>
          </>}

          {/* Purchase value */}
          <div>
            <label className="label">
              {isGold ? 'Cost (auto)' : isContrib ? 'Total Contributed' : 'Purchase Value'}
            </label>
            <input
              type="number" name="purchase_value" value={form.purchase_value}
              onChange={onChange} className="input" step="0.01" min="0"
              readOnly={isGold} style={isGold ? { opacity: 0.6 } : {}}
            />
          </div>

          {/* Current value */}
          <div>
            <label className="label">{isContrib ? 'Current Balance' : 'Current Value'}</label>
            <input
              type="number" name="current_value" value={form.current_value}
              onChange={onChange} className="input" step="0.01" min="0"
              readOnly={isGold} style={isGold ? { opacity: 0.6 } : {}}
              required
            />
          </div>

          {/* Loan fields */}
          {isLoan && <>
            <div>
              <label className="label">Loan Outstanding</label>
              <input type="number" name="loan_outstanding" value={form.loan_outstanding} onChange={onChange} className="input" step="0.01" min="0" />
            </div>
            <div>
              <label className="label">Monthly EMI</label>
              <input type="number" name="loan_emi" value={form.loan_emi} onChange={onChange} className="input" step="0.01" min="0" />
            </div>
            <div>
              <label className="label">Interest Rate %</label>
              <input type="number" name="loan_interest_rate" value={form.loan_interest_rate} onChange={onChange} className="input" step="0.01" min="0" max="100" />
            </div>
          </>}

          {/* As of date */}
          <div>
            <label className="label">As of Date</label>
            <input type="date" name="as_of_date" value={form.as_of_date} onChange={onChange} className="input" />
          </div>

          {/* Notes */}
          <div className="col-span-2">
            <label className="label">Notes (optional)</label>
            <input
              type="text" name="notes" value={form.notes} onChange={onChange}
              className="input"
              placeholder={
                form.asset_type === 'NPS' ? 'Tier 1 / Tier 2, PRAN, fund manager' :
                form.asset_type === 'PPF' ? 'Bank, account number' :
                form.asset_type === 'Property' ? 'Address, builder name' :
                form.asset_type === 'Vehicle' ? 'Model, year, registration' : ''
              }
            />
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onCancel} className="btn-ghost">Cancel</button>
          <button type="submit" className="btn-primary flex items-center gap-2">
            <Save size={14} />
            {initial?.id ? 'Save Changes' : 'Add Asset'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Asset Card ───────────────────────────────────────────────────────────────

function AssetCard({ asset, typeColor, onEdit, onDelete, onDetail, confirmDeleteId, setConfirmDeleteId }) {
  const cur = Number(asset.current_value) || 0;
  const loan = Number(asset.loan_outstanding) || 0;
  const purch = asset.purchase_value != null ? Number(asset.purchase_value) : null;
  const equity = cur - loan;
  const equityPct = cur > 0 ? Math.max(0, Math.min(100, (equity / cur) * 100)) : 100;
  const loanPct = 100 - equityPct;
  const hasMo = asset.loan_emi && Number(asset.loan_emi) > 0 && loan > 0;
  const tenureMonths = hasMo ? Math.round(loan / Number(asset.loan_emi)) : null;
  const isGold = asset.asset_type === 'Gold';
  const isContrib = HAS_CONTRIBUTION.includes(asset.asset_type);
  const color = typeColor || '#9ca3af';

  return (
    <div
      className="card space-y-3 cursor-pointer hover:border-white/15 transition-colors"
      onClick={() => onDetail(asset)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <TypeBadge type={asset.asset_type} color={color} />
          <span className="font-semibold text-white text-sm">{asset.name}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs text-muted px-2 py-0.5 rounded-full bg-white/5">
            {asset.account}
          </span>
          <ChevronRight size={14} className="text-muted/50" />
        </div>
      </div>

      {/* Values row */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div>
          <div className="text-muted text-xs">{isContrib ? 'Balance' : 'Value'}</div>
          <div className="font-bold text-white">{fmt2(cur)}</div>
        </div>
        {purch != null && (
          <div>
            <div className="text-muted text-xs">{isContrib ? 'Contributed' : 'Cost'}</div>
            <div className="text-soft">{fmt2(purch)}</div>
          </div>
        )}
        {loan > 0 && (
          <div>
            <div className="text-muted text-xs">Loan</div>
            <div className="text-rose-400">{fmt2(loan)}</div>
          </div>
        )}
        {loan > 0 && (
          <div>
            <div className="text-muted text-xs">Net Equity</div>
            <div className={equity >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{fmt2(equity)}</div>
          </div>
        )}
        {isGold && asset.quantity && (
          <div>
            <div className="text-muted text-xs">Quantity</div>
            <div className="text-soft">{Number(asset.quantity).toFixed(3)}g</div>
          </div>
        )}
      </div>

      {/* Equity bar */}
      {loan > 0 && cur > 0 && (
        <div className="space-y-1">
          <div className="flex h-2 rounded-full overflow-hidden bg-white/10">
            <div className="bg-emerald-500 transition-all" style={{ width: `${equityPct}%` }} />
            <div className="bg-rose-500 transition-all" style={{ width: `${loanPct}%` }} />
          </div>
          <div className="flex justify-between text-xs text-muted">
            <span>You {equityPct.toFixed(0)}%</span>
            {hasMo && tenureMonths != null && (
              <span>EMI {fmt2(asset.loan_emi)}/mo · ~{tenureMonths} mo</span>
            )}
            <span>Loan {loanPct.toFixed(0)}%</span>
          </div>
        </div>
      )}

      {/* Footer */}
      <div
        className="flex items-center justify-between text-xs text-muted pt-1 border-t border-white/5"
        onClick={e => e.stopPropagation()}
      >
        <span>Updated {new Date(asset.as_of_date + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        <div className="flex gap-2">
          {confirmDeleteId === asset.id ? (
            <>
              <span className="text-rose-400 mr-1">Delete?</span>
              <button onClick={() => onDelete(asset.id)} className="text-rose-400 hover:text-rose-300 font-semibold">Yes</button>
              <button onClick={() => setConfirmDeleteId(null)} className="text-muted hover:text-white">No</button>
            </>
          ) : (
            <>
              <button onClick={() => onEdit(asset)} className="hover:text-white"><Edit2 size={13} /></button>
              <button onClick={() => setConfirmDeleteId(asset.id)} className="hover:text-rose-400"><Trash2 size={13} /></button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function OtherAssets() {
  const { token, activePerson } = useAuth();
  const [assets, setAssets] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [persons, setPersons] = useState([]);
  const [customTypes, setCustomTypes] = useState([]); // from API
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailAsset, setDetailAsset] = useState(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [typeFilter, setTypeFilter] = useState('All');
  const [accountFilter, setAccountFilter] = useState('All');
  const [viewMode, setViewMode] = useState('card');
  const [sortConfig, setSortConfig] = useState({ key: 'asset_type', dir: 'asc' });
  const [snapshotSaving, setSnapshotSaving] = useState(false);
  const [reminderSending, setReminderSending] = useState(false);

  const fetchAssets = useCallback(() => {
    if (!token) return;
    const accountParam = activePerson ? `?account=${encodeURIComponent(activePerson)}` : '';
    return api.get(`/other-assets${accountParam}`).then(r => setAssets(r.data));
  }, [token, activePerson]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    Promise.all([
      fetchAssets(),
      api.get('/other-assets/snapshots'),
      api.get('/persons'),
      api.get('/other-assets/types'),
    ]).then(([, s, p, t]) => {
      setSnapshots(s.data);
      setPersons((p.data || []).map(x => x.person_name || x));
      setCustomTypes(t.data || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [token, activePerson]); // re-fetch when active person changes

  // Merged type list: defaults + user customs
  const allTypes = useMemo(() => {
    const customNames = customTypes.map(t => t.type_name);
    return [...DEFAULT_TYPES, ...customNames.filter(n => !DEFAULT_TYPES.includes(n))];
  }, [customTypes]);

  // type → color/has_loan/has_qty map
  const typeMap = useMemo(() => {
    const map = {};
    for (const t of DEFAULT_TYPES) {
      map[t] = { color: DEFAULT_COLORS[t], has_loan: HAS_LOAN_DEFAULT.includes(t), has_qty: HAS_QTY_DEFAULT.includes(t) };
    }
    for (const ct of customTypes) {
      map[ct.type_name] = { color: ct.color, has_loan: ct.has_loan, has_qty: ct.has_qty };
    }
    return map;
  }, [customTypes]);

  const getColor = (type) => typeMap[type]?.color || '#6b7280';

  const filtered = useMemo(() => {
    let rows = assets;
    if (typeFilter !== 'All') rows = rows.filter(r => r.asset_type === typeFilter);
    if (accountFilter !== 'All') rows = rows.filter(r => r.account === accountFilter);
    return rows;
  }, [assets, typeFilter, accountFilter]);

  const sorted = useMemo(() => {
    const { key, dir } = sortConfig;
    return [...filtered].sort((a, b) => {
      let av = a[key], bv = b[key];
      if (key === 'net_equity') {
        av = (Number(a.current_value) || 0) - (Number(a.loan_outstanding) || 0);
        bv = (Number(b.current_value) || 0) - (Number(b.loan_outstanding) || 0);
      }
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av < bv) return dir === 'asc' ? -1 : 1;
      if (av > bv) return dir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filtered, sortConfig]);

  const handleSort = key => {
    setSortConfig(prev => ({ key, dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc' }));
  };

  const SortIcon = ({ col }) => {
    if (sortConfig.key !== col) return null;
    return sortConfig.dir === 'asc' ? <ArrowUp size={12} className="inline ml-1" /> : <ArrowDown size={12} className="inline ml-1" />;
  };

  const thCls = () => `px-3 py-2.5 text-left text-xs text-muted font-semibold uppercase tracking-wide cursor-pointer select-none hover:text-white`;

  // Summary aggregates (all assets for current person)
  const totalValue = useMemo(() => assets.reduce((s, a) => s + (Number(a.current_value) || 0), 0), [assets]);
  const totalLoans = useMemo(() => assets.reduce((s, a) => s + (Number(a.loan_outstanding) || 0), 0), [assets]);
  const netEquity = totalValue - totalLoans;

  // Per-type breakdown (using all types)
  const typeBreakdown = useMemo(() => {
    const map = {};
    for (const t of allTypes) map[t] = { value: 0, loan: 0 };
    for (const a of assets) {
      if (!map[a.asset_type]) map[a.asset_type] = { value: 0, loan: 0 };
      map[a.asset_type].value += Number(a.current_value) || 0;
      map[a.asset_type].loan  += Number(a.loan_outstanding) || 0;
    }
    return map;
  }, [assets, allTypes]);

  const handleSave = async (payload, id) => {
    try {
      if (id) {
        const { data } = await api.put(`/other-assets/${id}`, payload);
        setAssets(prev => prev.map(a => a.id === id ? data : a));
      } else {
        const { data } = await api.post('/other-assets', payload);
        setAssets(prev => [...prev, data]);
      }
      setShowModal(false);
      setEditing(null);
      const { data: snaps } = await api.get('/other-assets/snapshots');
      setSnapshots(snaps);
    } catch (err) {
      alert(err.response?.data?.error || 'Error saving asset');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/other-assets/${id}`);
      setAssets(prev => prev.filter(a => a.id !== id));
      setConfirmDeleteId(null);
    } catch (err) {
      alert(err.response?.data?.error || 'Error deleting');
    }
  };

  const handleEdit = (asset) => { setEditing(asset); setShowModal(true); };

  const handleRecordSnapshot = async () => {
    setSnapshotSaving(true);
    try {
      await api.post('/other-assets/snapshot', { other_assets_value: totalValue, other_loans: totalLoans, net_worth: netEquity });
      const { data } = await api.get('/other-assets/snapshots');
      setSnapshots(data);
    } catch (err) {
      alert(err.response?.data?.error || 'Error saving snapshot');
    } finally {
      setSnapshotSaving(false);
    }
  };

  const handleSendReminder = async () => {
    setReminderSending(true);
    try {
      const { data } = await api.post('/other-assets/send-update-reminder');
      alert(`Reminder sent to ${data.sent} profile${data.sent !== 1 ? 's' : ''}. ${data.stale > 0 ? `${data.stale} stale asset${data.stale !== 1 ? 's' : ''} flagged.` : ''}`);
    } catch (err) {
      alert(err.response?.data?.error || 'Error sending reminder');
    } finally {
      setReminderSending(false);
    }
  };

  const handleAddCategory = async (form) => {
    try {
      const { data } = await api.post('/other-assets/types', form);
      setCustomTypes(prev => [...prev.filter(t => t.type_name !== data.type_name), data]);
      setShowCategoryModal(false);
    } catch (err) {
      alert(err.response?.data?.error || 'Error adding category');
    }
  };

  const handleDeleteCategory = async (name) => {
    if (!confirm(`Delete category "${name}"? Existing assets of this type will not be deleted.`)) return;
    try {
      await api.delete(`/other-assets/types/${encodeURIComponent(name)}`);
      setCustomTypes(prev => prev.filter(t => t.type_name !== name));
    } catch (err) {
      alert(err.response?.data?.error || 'Error deleting category');
    }
  };

  const snapshotChartData = snapshots.map(s => ({
    date: s.date,
    'Net Worth': +(Number(s.net_worth) / 100000).toFixed(2),
    'Illiquid Investments': +(Number(s.other_assets_value) / 100000).toFixed(2),
    'Loans': +(Number(s.other_loans) / 100000).toFixed(2),
  }));

  const accounts = useMemo(() => ['All', ...new Set(assets.map(a => a.account))], [assets]);

  if (loading) return <div className="text-muted text-sm p-4">Loading…</div>;

  return (
    <div className="space-y-5">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card">
          <div className="text-muted text-xs uppercase tracking-wide mb-1">Total Value</div>
          <div className="font-display text-xl font-bold text-white">{fmt2(totalValue)}</div>
        </div>
        <div className="card">
          <div className="text-muted text-xs uppercase tracking-wide mb-1">Total Loans</div>
          <div className="font-display text-xl font-bold text-rose-400">{totalLoans > 0 ? fmt2(totalLoans) : '—'}</div>
        </div>
        <div className="card">
          <div className="text-muted text-xs uppercase tracking-wide mb-1">Net Equity</div>
          <div className={`font-display text-xl font-bold ${netEquity >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {fmt2(netEquity)}
          </div>
        </div>
        <div className="card flex flex-col justify-between gap-2">
          <div className="text-muted text-xs uppercase tracking-wide">Actions</div>
          <button
            onClick={handleRecordSnapshot}
            disabled={snapshotSaving}
            className="btn-primary flex items-center gap-1 text-xs py-1.5"
          >
            <Camera size={12} />
            {snapshotSaving ? 'Saving…' : 'Record Snapshot'}
          </button>
          <button
            onClick={handleSendReminder}
            disabled={reminderSending}
            className="btn-ghost flex items-center gap-1 text-xs py-1.5 border border-white/10 rounded-lg hover:border-white/20"
          >
            <Mail size={12} />
            {reminderSending ? 'Sending…' : 'Send Update Email'}
          </button>
        </div>
      </div>

      {/* Per-type breakdown pills */}
      <div className="flex flex-wrap gap-2">
        {allTypes.filter(t => typeBreakdown[t]?.value > 0).map(t => (
          <div
            key={t}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
            style={{ background: getColor(t) + '18', border: `1px solid ${getColor(t)}33` }}
          >
            <span style={{ color: getColor(t) }} className="font-semibold">{t}</span>
            <span className="text-white">{fmt2(typeBreakdown[t].value)}</span>
            {typeBreakdown[t].loan > 0 && (
              <span className="text-rose-400">−{fmt2(typeBreakdown[t].loan)}</span>
            )}
          </div>
        ))}
      </div>

      {/* Filters + controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 p-1 rounded-lg bg-white/5 flex-wrap">
          {['All', ...allTypes].map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                typeFilter === t ? 'bg-accent text-ink' : 'text-soft hover:text-white'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <select
          value={accountFilter}
          onChange={e => setAccountFilter(e.target.value)}
          className="input text-sm py-1.5 w-auto"
        >
          {accounts.map(a => <option key={a}>{a}</option>)}
        </select>

        <div className="ml-auto flex gap-1 items-center">
          <button
            onClick={() => setViewMode('card')}
            className={`p-1.5 rounded ${viewMode === 'card' ? 'text-accent' : 'text-muted hover:text-white'}`}
          >
            <LayoutGrid size={16} />
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`p-1.5 rounded ${viewMode === 'table' ? 'text-accent' : 'text-muted hover:text-white'}`}
          >
            <LayoutList size={16} />
          </button>
          <button
            onClick={() => setShowCategoryModal(true)}
            className="flex items-center gap-1.5 text-xs text-muted hover:text-white border border-white/10 hover:border-white/20 rounded-lg px-3 py-1.5 ml-1 transition-all"
          >
            <Tag size={12} /> Add Category
          </button>
          <button
            onClick={() => { setEditing(null); setShowModal(true); }}
            className="btn-primary flex items-center gap-2 text-sm py-1.5 ml-1"
          >
            <Plus size={14} /> Add Asset
          </button>
        </div>
      </div>

      {/* Custom categories management */}
      {customTypes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {customTypes.map(ct => (
            <div key={ct.type_name}
              className="flex items-center gap-2 px-2 py-1 rounded-lg text-xs border"
              style={{ borderColor: ct.color + '44', background: ct.color + '11' }}
            >
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: ct.color }} />
              <span style={{ color: ct.color }} className="font-semibold">{ct.type_name}</span>
              <span className="text-muted text-xs">custom</span>
              <button onClick={() => handleDeleteCategory(ct.type_name)}
                className="text-muted hover:text-rose-400 ml-1"><X size={10} /></button>
            </div>
          ))}
        </div>
      )}

      {sorted.length === 0 && (
        <div className="card text-center text-muted py-10">
          No assets yet. Click <strong className="text-white">Add Asset</strong> to get started.
        </div>
      )}

      {/* Card View */}
      {viewMode === 'card' && sorted.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sorted.map(a => (
            <AssetCard
              key={a.id}
              asset={a}
              typeColor={getColor(a.asset_type)}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onDetail={setDetailAsset}
              confirmDeleteId={confirmDeleteId}
              setConfirmDeleteId={setConfirmDeleteId}
            />
          ))}
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && sorted.length > 0 && (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8">
                <th className={thCls()} onClick={() => handleSort('asset_type')}>Type <SortIcon col="asset_type" /></th>
                <th className={thCls()} onClick={() => handleSort('name')}>Name <SortIcon col="name" /></th>
                <th className={thCls()} onClick={() => handleSort('account')}>Account <SortIcon col="account" /></th>
                <th className={thCls()} onClick={() => handleSort('purchase_value')}>Cost <SortIcon col="purchase_value" /></th>
                <th className={thCls()} onClick={() => handleSort('current_value')}>Current <SortIcon col="current_value" /></th>
                <th className={thCls()} onClick={() => handleSort('loan_outstanding')}>Loan <SortIcon col="loan_outstanding" /></th>
                <th className={thCls()} onClick={() => handleSort('net_equity')}>Net Equity <SortIcon col="net_equity" /></th>
                <th className={`${thCls()} hidden md:table-cell`} onClick={() => handleSort('as_of_date')}>Updated <SortIcon col="as_of_date" /></th>
                <th className="px-3 py-2.5 text-right text-xs text-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(a => {
                const cur = Number(a.current_value) || 0;
                const loan = Number(a.loan_outstanding) || 0;
                const eq = cur - loan;
                return (
                  <tr key={a.id} className="border-b border-white/5 hover:bg-white/[0.02] cursor-pointer"
                    onClick={() => setDetailAsset(a)}>
                    <td className="px-3 py-2.5"><TypeBadge type={a.asset_type} color={getColor(a.asset_type)} /></td>
                    <td className="px-3 py-2.5 text-white font-medium">{a.name}</td>
                    <td className="px-3 py-2.5 text-soft text-xs">{a.account}</td>
                    <td className="px-3 py-2.5 text-muted">{fmt2(a.purchase_value)}</td>
                    <td className="px-3 py-2.5 font-semibold text-white">{fmt2(cur)}</td>
                    <td className="px-3 py-2.5">
                      {loan > 0 ? <span className="text-rose-400">{fmt2(loan)}</span> : <span className="text-muted">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={eq >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{fmt2(eq)}</span>
                    </td>
                    <td className="px-3 py-2.5 text-muted text-xs hidden md:table-cell">
                      {new Date(a.as_of_date + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-3 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                      {confirmDeleteId === a.id ? (
                        <span className="flex items-center gap-1 justify-end text-xs">
                          <span className="text-rose-400">Delete?</span>
                          <button onClick={() => handleDelete(a.id)} className="text-rose-400 hover:text-rose-300 font-semibold">Yes</button>
                          <button onClick={() => setConfirmDeleteId(null)} className="text-muted hover:text-white ml-1">No</button>
                        </span>
                      ) : (
                        <span className="flex items-center gap-2 justify-end">
                          <button onClick={() => handleEdit(a)} className="text-muted hover:text-white"><Edit2 size={13} /></button>
                          <button onClick={() => setConfirmDeleteId(a.id)} className="text-muted hover:text-rose-400"><Trash2 size={13} /></button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Net Worth Trend Chart */}
      {snapshotChartData.length >= 2 && (
        <div className="card space-y-3">
          <h3 className="font-display font-bold text-white text-sm">Net Worth Trend</h3>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={snapshotChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: '#888', fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fill: '#888', fontSize: 11 }} tickLine={false} unit="L" width={40} />
              <Tooltip
                contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8 }}
                labelStyle={{ color: '#aaa' }}
                formatter={(v, n) => [`₹${v}L`, n]}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: '#888' }} />
              <Line type="monotone" dataKey="Net Worth" stroke="#f0c040" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Illiquid Investments" stroke="#a78bfa" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
              <Line type="monotone" dataKey="Loans" stroke="#fb7185" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Modals */}
      {showModal && (
        <AssetModal
          initial={editing}
          persons={persons}
          assetTypes={allTypes}
          typeMap={typeMap}
          onSave={handleSave}
          onCancel={() => { setShowModal(false); setEditing(null); }}
        />
      )}

      {showCategoryModal && (
        <CategoryModal
          onSave={handleAddCategory}
          onCancel={() => setShowCategoryModal(false)}
        />
      )}

      {detailAsset && (
        <DetailModal
          asset={detailAsset}
          typeColor={getColor(detailAsset.asset_type)}
          onClose={() => setDetailAsset(null)}
          onEdit={(asset) => { setDetailAsset(null); handleEdit(asset); }}
        />
      )}
    </div>
  );
}
