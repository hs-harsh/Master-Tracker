import { useEffect, useState, useMemo, useCallback } from 'react';
import api from '../lib/api';
import { fmt } from '../lib/utils';
import { useAuth } from '../hooks/useAuth';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import {
  Plus, Trash2, Edit2, X, Save, ArrowUp, ArrowDown,
  LayoutList, LayoutGrid, Camera, Mail, Tag, ChevronRight, RefreshCw, Landmark, History,
} from 'lucide-react';
import {
  ComposedChart, Line, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, Legend,
} from 'recharts';
import { TT, AX, GRID, identityPalette } from '../lib/chartTheme';

const DEFAULT_TYPES = ['Property', 'Vehicle', 'Gold', 'PPF', 'NPS'];
const HAS_LOAN_DEFAULT = ['Property', 'Vehicle'];
const HAS_QTY_DEFAULT  = ['Gold'];
const HAS_CONTRIBUTION = ['PPF', 'NPS'];

// Same hues as Portfolio's ILLIQUID_TYPE_COLORS — these two maps describe the
// same asset types and must agree. User-defined categories bring their own
// stored hex and are left alone.
const DEFAULT_COLORS = identityPalette({
  Property: 'violet', Vehicle: 'blue', Gold: 'amber', PPF: 'emerald', NPS: 'teal',
});

const today = () => new Date().toISOString().slice(0, 10);

function fmt2(n) {
  if (n == null || n === '') return '—';
  return fmt(Number(n));
}

// Fix: always slice to YYYY-MM-DD before parsing
function daysSince(dateStr) {
  if (!dateStr) return null;
  const d = new Date(String(dateStr).slice(0, 10) + 'T12:00:00');
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function fmtYM(ym) {
  const [y, m] = ym.split('-');
  const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${MO[parseInt(m, 10) - 1]} '${y.slice(2)}`;
}

// Generate forward-filled (and optionally backfilled) monthly series
// overrideStartYM: if earlier than first history record, backfill with first known values
function generateMonthlySeries(history, overrideStartYM) {
  const sorted = history ? [...history].sort((a, b) => a.date.localeCompare(b.date)) : [];
  if (!sorted.length) return [];

  const now = new Date();
  const endYM  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const firstYM = sorted[0].date.slice(0, 7);
  const startYM = (overrideStartYM && overrideStartYM < firstYM) ? overrideStartYM : firstYM;

  const months = [];
  let [y, m] = startYM.split('-').map(Number);
  const [ey, em] = endYM.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }

  const first = sorted[0];
  return months.map(ym => {
    if (ym < firstYM) {
      return { month: ym, value: Number(first.current_value) || 0, loan_hist: Number(first.loan_outstanding) || 0, isReal: false };
    }
    let best = null;
    for (const r of sorted) { if (r.date.slice(0, 7) <= ym) best = r; }
    const ref = best || first;
    return {
      month: ym,
      value: Number(ref.current_value) || 0,
      loan_hist: Number(ref.loan_outstanding) || 0,
      isReal: !!(best && best.date.slice(0, 7) === ym),
    };
  });
}

// Reconstruct full loan schedule: work backwards from currentOutstanding at currentYM
// to find what the balance was at startYM, then project forwards to today
function reconstructLoanSchedule(currentOutstanding, emi, ratePercent, currentYM, startYM) {
  if (!emi || !ratePercent || !currentOutstanding || !startYM) return {};
  const rate  = Number(ratePercent) / 100 / 12;
  const emiN  = Number(emi);
  let   bal   = Number(currentOutstanding);

  // Walk backwards: bal_prev = (bal_curr + emi) / (1 + rate)
  const backward = { [currentYM]: bal };
  let [y, m] = currentYM.split('-').map(Number);
  while (true) {
    m--; if (m < 1) { m = 12; y--; }
    const ym = `${y}-${String(m).padStart(2, '0')}`;
    bal = (bal + emiN) / (1 + rate);
    backward[ym] = Math.max(0, bal);
    if (ym <= startYM) break;
  }

  // Walk forwards from startYM to today
  const now    = new Date();
  const todayYM = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const result = {};
  bal = backward[startYM] ?? Number(currentOutstanding);
  result[startYM] = bal;
  let [fy, fm] = startYM.split('-').map(Number);
  let fYM = startYM;
  while (fYM < todayYM && bal > 0) {
    fm++; if (fm > 12) { fm = 1; fy++; }
    fYM = `${fy}-${String(fm).padStart(2, '0')}`;
    const interest = bal * rate;
    bal = Math.max(0, bal - Math.max(0, emiN - interest));
    result[fYM] = bal;
  }
  return result;
}

// Simple forward-only schedule (when no start date)
function calcLoanSchedule(outstanding, emi, ratePercent, fromYM, toYM) {
  if (!emi || !ratePercent || !outstanding) return {};
  const rate = Number(ratePercent) / 100 / 12;
  let bal = Number(outstanding);
  const result = { [fromYM]: bal };
  let [y, m] = fromYM.split('-').map(Number);
  while (bal > 0) {
    m++; if (m > 12) { m = 1; y++; }
    const ym = `${y}-${String(m).padStart(2, '0')}`;
    if (ym > toYM) break;
    const interest = bal * rate;
    bal = Math.max(0, bal - Math.max(0, Number(emi) - interest));
    result[ym] = bal;
  }
  return result;
}

function TypeBadge({ type, color }) {
  const c = color || DEFAULT_COLORS[type] || '#6b7280';
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{ background: c + '22', color: c }}>{type}</span>
  );
}

// ── Quick Update Value Modal ─────────────────────────────────────────────────

function UpdateValueModal({ asset, typeMap, onSave, onCancel }) {
  const meta   = typeMap[asset.asset_type] || {};
  const isGold = asset.asset_type === 'Gold';
  const isLoan = meta.has_loan ?? HAS_LOAN_DEFAULT.includes(asset.asset_type);

  const initRate = isGold && Number(asset.quantity) > 0
    ? (Number(asset.current_value) / Number(asset.quantity)).toFixed(2) : '';

  const [form, setForm] = useState({
    current_value:    String(asset.current_value ?? ''),
    loan_outstanding: String(asset.loan_outstanding ?? ''),
    quantity:         String(asset.quantity ?? ''),
    current_rate:     initRate,
    as_of_date:       today(),
  });

  const onChange = e => {
    const { name, value } = e.target;
    setForm(p => {
      const next = { ...p, [name]: value };
      if (isGold) {
        const qty  = Number(name === 'quantity'     ? value : next.quantity)     || 0;
        const rate = Number(name === 'current_rate' ? value : next.current_rate) || 0;
        if (qty > 0 && rate > 0) next.current_value = (qty * rate).toFixed(2);
      }
      return next;
    });
  };

  const handleSubmit = e => {
    e.preventDefault();
    onSave({
      ...asset,
      current_value:    Number(form.current_value) || 0,
      loan_outstanding: isLoan ? (Number(form.loan_outstanding) || 0) : (Number(asset.loan_outstanding) || 0),
      quantity:         isGold ? (Number(form.quantity) || null) : asset.quantity,
      as_of_date:       form.as_of_date || today(),
    }, asset.id);
  };

  const days = daysSince(asset.as_of_date);
  const staleClass = days == null ? 'text-muted' : days > 60 ? 'text-neg' : days > 30 ? 'text-hue-amber' : 'text-muted';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <form onSubmit={handleSubmit} className="card w-full max-w-sm space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-display font-bold text-white">Update Value</h3>
            <p className="text-xs text-muted mt-0.5">{asset.name} · {asset.asset_type}</p>
          </div>
          <button type="button" onClick={onCancel} className="text-muted hover:text-white"><X size={18} /></button>
        </div>

        <div className="bg-white/5 rounded-lg p-3 text-xs flex items-center justify-between">
          <div><span className="text-muted">Last value </span><span className="text-white font-semibold">{fmt2(asset.current_value)}</span></div>
          <span className={staleClass}>{days != null ? `${days}d ago` : '—'}</span>
        </div>

        <div className="space-y-3">
          {isGold && (
            <>
              <div>
                <label className="label">Quantity (grams)</label>
                <input type="number" name="quantity" value={form.quantity} onChange={onChange}
                  className="input" step="0.001" min="0" />
              </div>
              <div>
                <label className="label">Current Rate (₹/g)</label>
                <input type="number" name="current_rate" value={form.current_rate} onChange={onChange}
                  className="input" step="0.01" min="0" />
              </div>
              <div>
                <label className="label">Current Value (auto)</label>
                <input type="number" name="current_value" value={form.current_value}
                  className="input" readOnly style={{ opacity: 0.6 }} />
              </div>
            </>
          )}
          {!isGold && (
            <div>
              <label className="label">Current Value</label>
              <input type="number" name="current_value" value={form.current_value} onChange={onChange}
                className="input" step="0.01" min="0" required />
            </div>
          )}
          {isLoan && (
            <div>
              <label className="label">Loan Outstanding</label>
              <input type="number" name="loan_outstanding" value={form.loan_outstanding} onChange={onChange}
                className="input" step="0.01" min="0" />
            </div>
          )}
          <div>
            <label className="label">As of Date</label>
            <input type="date" name="as_of_date" value={form.as_of_date} onChange={onChange} className="input" />
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onCancel} className="btn-ghost">Cancel</button>
          <button type="submit" className="btn-primary flex items-center gap-2"><Save size={14} /> Update</button>
        </div>
      </form>
    </div>
  );
}

// ── Add Category Modal ────────────────────────────────────────────────────────

function CategoryModal({ onSave, onCancel }) {
  const [form, setForm] = useState({ type_name: '', color: '#9ca3af', has_loan: false, has_qty: false });
  const onChange = e => {
    const { name, value, type, checked } = e.target;
    setForm(p => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <form onSubmit={e => { e.preventDefault(); if (form.type_name.trim()) onSave(form); }}
        className="card w-full max-w-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-white">New Category</h3>
          <button type="button" onClick={onCancel} className="text-muted hover:text-white"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="label">Category Name</label>
            <input type="text" name="type_name" value={form.type_name} onChange={onChange}
              className="input" required placeholder="e.g. PF, FD, Crypto" />
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
              <input type="checkbox" name="has_loan" checked={form.has_loan} onChange={onChange} /> Has loan
            </label>
            <label className="flex items-center gap-2 text-sm text-soft cursor-pointer">
              <input type="checkbox" name="has_qty" checked={form.has_qty} onChange={onChange} /> Has quantity
            </label>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onCancel} className="btn-ghost">Cancel</button>
          <button type="submit" className="btn-primary flex items-center gap-2"><Save size={14} /> Save</button>
        </div>
      </form>
    </div>
  );
}

// ── Detail Modal ─────────────────────────────────────────────────────────────

function DetailModal({ asset, typeColor, onClose, onEdit }) {
  const { token } = useAuth();
  const [history, setHistory] = useState([]);
  const [loadingHist, setLoadingHist] = useState(true);

  useEffect(() => {
    if (!token || !asset) return;
    api.get(`/other-assets/${asset.id}/history`)
      .then(r => setHistory(r.data))
      .catch(() => {})
      .finally(() => setLoadingHist(false));
  }, [token, asset?.id]);

  const cur    = Number(asset.current_value) || 0;
  const loan   = Number(asset.loan_outstanding) || 0;
  const equity = cur - loan;
  const color  = typeColor || '#9ca3af';
  const isLoan = HAS_LOAN_DEFAULT.includes(asset.asset_type);

  // Chart start: loan_start_date if earlier than first history record
  const loanStartYM = asset.loan_start_date
    ? String(asset.loan_start_date).slice(0, 7) : null;

  const monthlySeries = useMemo(
    () => generateMonthlySeries(history, loanStartYM),
    [history, loanStartYM]
  );

  // Loan schedule: reconstruct full history + project forward
  const loanSchedule = useMemo(() => {
    if (!isLoan || !asset.loan_emi || !asset.loan_interest_rate || loan <= 0) return {};
    const asOfYM = String(asset.as_of_date || today()).slice(0, 7);
    if (loanStartYM) {
      return reconstructLoanSchedule(loan, asset.loan_emi, asset.loan_interest_rate, asOfYM, loanStartYM);
    }
    const now = new Date();
    const todayYM = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    return calcLoanSchedule(loan, asset.loan_emi, asset.loan_interest_rate, asOfYM, todayYM);
  }, [isLoan, loan, asset.loan_emi, asset.loan_interest_rate, asset.loan_start_date, asset.as_of_date]);

  const chartData = useMemo(() => {
    return monthlySeries.map(p => {
      const loanVal = isLoan
        ? (loanSchedule[p.month] !== undefined ? loanSchedule[p.month] : p.loan_hist)
        : 0;
      return {
        label: fmtYM(p.month),
        'Asset Value': +(p.value / 100000).toFixed(2),
        ...(isLoan && loan > 0 ? {
          'Loan': +(loanVal / 100000).toFixed(2),
          'Net Equity': +((p.value - loanVal) / 100000).toFixed(2),
        } : {}),
      };
    });
  }, [monthlySeries, isLoan, loanSchedule, loan]);

  // Projected payoff
  const payoffEntry = useMemo(() => {
    if (!isLoan || !loan) return null;
    const entries = Object.entries(loanSchedule).sort(([a],[b]) => a.localeCompare(b));
    return entries.find(([,v]) => v < 1000) || null; // < ₹1000 = effectively paid
  }, [isLoan, loan, loanSchedule]);

  const staleText = (() => {
    const d = daysSince(asset.as_of_date);
    return d != null ? `${d}d ago` : '—';
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="card w-full max-w-2xl space-y-4 overflow-y-auto max-h-[92vh]">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <TypeBadge type={asset.asset_type} color={color} />
            <span className="font-bold text-white">{asset.name}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => { onClose(); onEdit(asset); }}
              className="text-muted hover:text-white p-1"><Edit2 size={15} /></button>
            <button onClick={onClose} className="text-muted hover:text-white p-1"><X size={18} /></button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white/[0.03] rounded-lg p-3 border border-hairline/5">
            <div className="text-xs text-muted mb-1">Current Value</div>
            <div className="font-bold text-white">{fmt2(cur)}</div>
            <div className="text-xs text-muted mt-1">as of {staleText}</div>
          </div>
          {loan > 0 && (
            <div className="bg-white/[0.03] rounded-lg p-3 border border-hairline/5">
              <div className="text-xs text-muted mb-1">Loan Outstanding</div>
              <div className="font-bold text-neg">{fmt2(loan)}</div>
            </div>
          )}
          <div className="bg-white/[0.03] rounded-lg p-3 border border-hairline/5">
            <div className="text-xs text-muted mb-1">Net Equity</div>
            <div className={`font-bold ${equity >= 0 ? 'text-pos' : 'text-neg'}`}>{fmt2(equity)}</div>
          </div>
          {asset.loan_emi && Number(asset.loan_emi) > 0 && (
            <div className="bg-white/[0.03] rounded-lg p-3 border border-hairline/5">
              <div className="text-xs text-muted mb-1">EMI</div>
              <div className="font-bold text-white text-sm">{fmt2(asset.loan_emi)}<span className="text-muted text-xs font-normal">/mo</span></div>
              <div className="text-xs text-muted mt-0.5">
                {asset.loan_interest_rate && `${asset.loan_interest_rate}% · `}
                {asset.loan_tenure_months && `${asset.loan_tenure_months} mo tenure`}
              </div>
            </div>
          )}
        </div>

        {/* Loan dates */}
        {isLoan && (asset.loan_start_date || asset.loan_tenure_months) && (
          <div className="flex flex-wrap gap-4 text-xs bg-white/[0.02] rounded-lg p-3 border border-hairline/5">
            {asset.loan_start_date && (
              <div><span className="text-muted">Started </span>
                <span className="text-soft">{new Date(String(asset.loan_start_date).slice(0,10) + 'T12:00:00').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</span>
              </div>
            )}
            {asset.loan_tenure_months && (
              <div><span className="text-muted">Tenure </span>
                <span className="text-soft">{asset.loan_tenure_months} months ({(asset.loan_tenure_months / 12).toFixed(0)} yr)</span>
              </div>
            )}
            {payoffEntry && (
              <div><span className="text-muted">Projected payoff </span>
                <span className="text-pos font-semibold">{fmtYM(payoffEntry[0])}</span>
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        {asset.notes && <div className="text-xs text-muted">{asset.notes}</div>}

        {/* Chart */}
        <div>
          <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
            {isLoan && loan > 0
              ? 'Asset Value vs Loan (₹L · monthly · loan auto-projected)'
              : 'Value History (₹L · monthly · gaps forward-filled)'}
          </div>
          {loadingHist ? (
            <div className="text-muted text-xs py-8 text-center">Loading…</div>
          ) : chartData.length === 0 ? (
            <EmptyState compact icon={History} title="No value history yet"
              hint="Each time you update this asset's value, the change is recorded here." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="label" {...AX} tick={{ ...AX.tick, fontSize: 10 }}
                  interval={chartData.length <= 6 ? 0 : Math.floor(chartData.length / 6)} />
                <YAxis {...AX} tick={{ ...AX.tick, fontSize: 10 }} unit="L" width={38} />
                <Tooltip {...TT} formatter={(v, n) => [`₹${v}L`, n]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="Asset Value" stroke={color} fill={color + '22'}
                  strokeWidth={2} dot={chartData.length <= 3 ? { r: 4, fill: color } : false}
                  activeDot={{ r: 4 }} />
                {isLoan && loan > 0 && (
                  <Line type="monotone" dataKey="Loan" stroke="#fb7185" strokeWidth={1.5}
                    dot={false} strokeDasharray="4 2" />
                )}
                {isLoan && loan > 0 && (
                  <Line type="monotone" dataKey="Net Equity" stroke="#34d399" strokeWidth={1.5}
                    dot={false} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Add/Edit Modal ────────────────────────────────────────────────────────────

function AssetModal({ initial, persons, assetTypes, typeMap, onSave, onCancel }) {
  const firstType = assetTypes[0] || 'Property';
  const EMPTY = {
    asset_type: firstType, name: '', account: persons[0] || '',
    current_value: '', loan_disbursed: '', loan_outstanding: '',
    loan_emi: '', loan_interest_rate: '',
    loan_start_date: '', loan_tenure_months: '',
    quantity: '', current_rate: '', notes: '', as_of_date: today(),
    purchase_value: '', // kept for round-trip on edit, not shown
  };

  // Amortisation formula: balance after n months of an EMI loan
  function calcOutstanding(disbursed, rateAnnual, emi, startDateStr) {
    const P = Number(disbursed);
    const r = Number(rateAnnual) / 12 / 100;
    const e = Number(emi);
    if (!P || !startDateStr) return '';
    const start = new Date(startDateStr);
    const now   = new Date();
    const n = Math.max(0, (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()));
    if (n === 0) return P.toFixed(2);
    if (r === 0) return Math.max(0, P - e * n).toFixed(2);
    const bal = P * Math.pow(1 + r, n) - (e > 0 ? e * (Math.pow(1 + r, n) - 1) / r : 0);
    return Math.max(0, bal).toFixed(2);
  }

  const [form, setForm] = useState(() => {
    if (!initial) return EMPTY;
    let current_rate = '';
    if (initial.asset_type === 'Gold' && Number(initial.quantity) > 0 && initial.current_value) {
      current_rate = (Number(initial.current_value) / Number(initial.quantity)).toFixed(2);
    }
    return {
      ...EMPTY, ...initial,
      current_rate,
      notes: initial.notes || '',
      loan_start_date: initial.loan_start_date ? String(initial.loan_start_date).slice(0, 10) : '',
      loan_tenure_months: initial.loan_tenure_months ?? '',
    };
  });

  const onChange = e => {
    const { name, value } = e.target;
    setForm(p => {
      const next = { ...p, [name]: value };
      if (p.asset_type === 'Gold') {
        const qty  = Number(name === 'quantity'     ? value : next.quantity)     || 0;
        const rate = Number(name === 'current_rate' ? value : next.current_rate) || 0;
        if (qty > 0 && rate > 0) next.current_value = (qty * rate).toFixed(2);
      }
      // Auto-compute outstanding from disbursed + rate + EMI + start date
      if (['loan_disbursed', 'loan_interest_rate', 'loan_emi', 'loan_start_date'].includes(name)) {
        const computed = calcOutstanding(next.loan_disbursed, next.loan_interest_rate, next.loan_emi, next.loan_start_date);
        if (computed !== '') next.loan_outstanding = computed;
      }
      return next;
    });
  };

  const onTypeChange = e =>
    setForm(p => ({ ...EMPTY, asset_type: e.target.value, account: p.account, as_of_date: p.as_of_date }));

  const handleSubmit = e => {
    e.preventDefault();
    const meta   = typeMap[form.asset_type] || {};
    const isLoan = meta.has_loan ?? HAS_LOAN_DEFAULT.includes(form.asset_type);
    const isQty  = meta.has_qty  ?? HAS_QTY_DEFAULT.includes(form.asset_type);
    onSave({
      asset_type:          form.asset_type,
      name:                form.name.trim(),
      account:             form.account,
      current_value:       Number(form.current_value) || 0,
      purchase_value:      form.purchase_value !== '' ? Number(form.purchase_value) : null,
      loan_outstanding:    isLoan ? (Number(form.loan_outstanding) || 0) : 0,
      loan_emi:            isLoan ? (Number(form.loan_emi) || null) : null,
      loan_interest_rate:  isLoan ? (Number(form.loan_interest_rate) || null) : null,
      loan_start_date:     isLoan ? (form.loan_start_date || null) : null,
      loan_tenure_months:  isLoan ? (Number(form.loan_tenure_months) || null) : null,
      quantity:            isQty  ? (Number(form.quantity) || null) : null,
      currency:            'INR',
      notes:               form.notes.trim() || null,
      as_of_date:          form.as_of_date || today(),
    }, initial?.id);
  };

  const meta      = typeMap[form.asset_type] || {};
  const isGold    = form.asset_type === 'Gold';
  const isLoan    = meta.has_loan ?? HAS_LOAN_DEFAULT.includes(form.asset_type);
  const isContrib = HAS_CONTRIBUTION.includes(form.asset_type);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <form onSubmit={handleSubmit} className="card w-full max-w-lg space-y-4 overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-white">{initial?.id ? 'Edit Asset' : 'New Asset'}</h3>
          <button type="button" onClick={onCancel} className="text-muted hover:text-white"><X size={18} /></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Asset Type</label>
            <select name="asset_type" value={form.asset_type} onChange={onTypeChange} className="input">
              {assetTypes.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Account</label>
            <select name="account" value={form.account} onChange={onChange} className="input">
              {persons.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>

          <div className="col-span-2">
            <label className="label">Name</label>
            <input type="text" name="name" value={form.name} onChange={onChange} className="input" required
              placeholder={isGold ? 'e.g. SGB 2019' : isLoan ? 'e.g. Home – Bangalore' : isContrib ? 'e.g. SBI PPF' : 'Asset name'} />
          </div>

          {isGold && (
            <>
              <div>
                <label className="label">Quantity (grams)</label>
                <input type="number" name="quantity" value={form.quantity} onChange={onChange}
                  className="input" step="0.001" min="0" />
              </div>
              <div>
                <label className="label">Current Rate (₹/g)</label>
                <input type="number" name="current_rate" value={form.current_rate} onChange={onChange}
                  className="input" step="0.01" min="0" />
              </div>
            </>
          )}

          <div className={isGold ? '' : 'col-span-2'}>
            <label className="label">{isContrib ? 'Current Balance' : 'Current Value'}</label>
            <input type="number" name="current_value" value={form.current_value} onChange={onChange}
              className="input" step="0.01" min="0" required
              readOnly={isGold} style={isGold ? { opacity: 0.6 } : {}} />
          </div>

          {isLoan && (
            <>
              {/* Divider */}
              <div className="col-span-2 border-t border-hairline/8 pt-1">
                <span className="text-xs text-muted uppercase tracking-wide">Loan Details</span>
              </div>
              <div>
                <label className="label">Disbursed Amount</label>
                <input type="number" name="loan_disbursed" value={form.loan_disbursed} onChange={onChange}
                  className="input" step="0.01" min="0" placeholder="Original loan amount" />
              </div>
              <div>
                <label className="label">EMI Start Date</label>
                <input type="date" name="loan_start_date" value={form.loan_start_date} onChange={onChange}
                  className="input" />
              </div>
              <div>
                <label className="label">Interest Rate % p.a.</label>
                <input type="number" name="loan_interest_rate" value={form.loan_interest_rate} onChange={onChange}
                  className="input" step="0.01" min="0" max="100" />
              </div>
              <div>
                <label className="label">Monthly EMI</label>
                <input type="number" name="loan_emi" value={form.loan_emi} onChange={onChange}
                  className="input" step="0.01" min="0" />
              </div>
              <div>
                <label className="label">Tenure (months)</label>
                <input type="number" name="loan_tenure_months" value={form.loan_tenure_months} onChange={onChange}
                  className="input" step="1" min="1" placeholder="e.g. 240" />
              </div>
              <div className="col-span-2">
                <label className="label">Current Outstanding (auto-computed)</label>
                <div className="input flex items-center justify-between" style={{ opacity: form.loan_disbursed ? 1 : 0.5 }}>
                  <span className="font-mono text-white">
                    {form.loan_outstanding ? fmt2(form.loan_outstanding) : '—'}
                  </span>
                  {form.loan_disbursed && form.loan_start_date && (
                    <span className="text-xs text-muted">computed from disbursed + rate + EMI</span>
                  )}
                </div>
              </div>
            </>
          )}

          <div>
            <label className="label">Value as of Date</label>
            <input type="date" name="as_of_date" value={form.as_of_date} onChange={onChange} className="input" />
          </div>
          <div>
            <label className="label">Notes (optional)</label>
            <input type="text" name="notes" value={form.notes} onChange={onChange} className="input"
              placeholder={
                form.asset_type === 'NPS' ? 'PRAN, fund manager' :
                form.asset_type === 'PPF' ? 'Bank, account no.' :
                form.asset_type === 'Property' ? 'Address, builder' :
                form.asset_type === 'Vehicle' ? 'Model, year, reg' : ''
              } />
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onCancel} className="btn-ghost">Cancel</button>
          <button type="submit" className="btn-primary flex items-center gap-2">
            <Save size={14} />{initial?.id ? 'Save Changes' : 'Add Asset'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Asset Card ────────────────────────────────────────────────────────────────

function AssetCard({ asset, typeColor, onEdit, onDelete, onDetail, onUpdate, confirmDeleteId, setConfirmDeleteId }) {
  const cur    = Number(asset.current_value) || 0;
  const loan   = Number(asset.loan_outstanding) || 0;
  const equity = cur - loan;
  const equityPct = cur > 0 ? Math.max(0, Math.min(100, (equity / cur) * 100)) : 100;
  const isGold    = asset.asset_type === 'Gold';
  const isContrib = HAS_CONTRIBUTION.includes(asset.asset_type);
  const color     = typeColor || '#9ca3af';
  const days      = daysSince(asset.as_of_date);
  const staleClass = days == null ? 'text-muted' : days > 60 ? 'text-neg' : days > 30 ? 'text-hue-amber' : 'text-muted';

  return (
    <div className="card space-y-3 cursor-pointer hover:border-hairline/15 transition-colors"
      onClick={() => onDetail(asset)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <TypeBadge type={asset.asset_type} color={color} />
          <span className="font-semibold text-white text-sm">{asset.name}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <ChevronRight size={14} className="text-muted/50" />
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <div>
          <div className="text-muted text-xs">{isContrib ? 'Balance' : 'Value'}</div>
          <div className="font-bold text-white">{fmt2(cur)}</div>
        </div>
        {loan > 0 && (
          <>
            <div><div className="text-muted text-xs">Loan</div><div className="text-neg">{fmt2(loan)}</div></div>
            <div><div className="text-muted text-xs">Equity</div><div className={equity >= 0 ? 'text-pos' : 'text-neg'}>{fmt2(equity)}</div></div>
          </>
        )}
        {isGold && asset.quantity && (
          <div><div className="text-muted text-xs">Qty</div><div className="text-soft">{Number(asset.quantity).toFixed(3)}g</div></div>
        )}
      </div>

      {loan > 0 && cur > 0 && (
        <div className="flex h-1.5 rounded-full overflow-hidden bg-white/10">
          <div className="bg-emerald-500" style={{ width: `${equityPct}%` }} />
          <div className="bg-rose-500" style={{ width: `${100 - equityPct}%` }} />
        </div>
      )}

      <div className="flex items-center justify-between text-xs pt-1 border-t border-hairline/5"
        onClick={e => e.stopPropagation()}>
        <span className={staleClass}>{days != null ? `${days}d ago` : '—'}</span>
        <div className="flex gap-2 items-center">
          {confirmDeleteId === asset.id ? (
            <>
              <span className="text-neg">Delete?</span>
              <button onClick={() => onDelete(asset.id)} className="text-neg font-semibold">Yes</button>
              <button onClick={() => setConfirmDeleteId(null)} className="text-muted hover:text-white">No</button>
            </>
          ) : (
            <>
              <button onClick={() => onUpdate(asset)}
                className="tap text-muted hover:text-accent-ink flex items-center gap-1">
                <RefreshCw size={12} /> Update
              </button>
              <button onClick={() => onEdit(asset)} className="icon-btn text-muted hover:text-white ml-1"><Edit2 size={13} /></button>
              <button onClick={() => setConfirmDeleteId(asset.id)} className="icon-btn text-muted hover:text-neg"><Trash2 size={13} /></button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function OtherAssets() {
  const { token, activePerson } = useAuth();
  const [assets, setAssets]           = useState([]);
  const [snapshots, setSnapshots]     = useState([]);
  const [persons, setPersons]         = useState([]);
  const [customTypes, setCustomTypes] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showModal, setShowModal]     = useState(false);
  const [editing, setEditing]         = useState(null);
  const [updateAsset, setUpdateAsset] = useState(null);
  const [detailAsset, setDetailAsset] = useState(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [viewMode, setViewMode]       = useState('card');
  const [sortConfig, setSortConfig]   = useState({ key: 'asset_type', dir: 'asc' });
  const [snapshotSaving, setSnapshotSaving]   = useState(false);
  const [reminderSending, setReminderSending] = useState(false);

  const fetchAssets = useCallback(() => {
    const param = activePerson ? `?account=${encodeURIComponent(activePerson)}` : '';
    return api.get(`/other-assets${param}`).then(r => setAssets(r.data));
  }, [activePerson]);

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
  }, [token, activePerson]);

  const allTypes = useMemo(() => {
    const custom = customTypes.map(t => t.type_name).filter(n => !DEFAULT_TYPES.includes(n));
    return [...DEFAULT_TYPES, ...custom];
  }, [customTypes]);

  const typeMap = useMemo(() => {
    const map = {};
    for (const t of DEFAULT_TYPES)
      map[t] = { color: DEFAULT_COLORS[t], has_loan: HAS_LOAN_DEFAULT.includes(t), has_qty: HAS_QTY_DEFAULT.includes(t) };
    for (const ct of customTypes)
      map[ct.type_name] = { color: ct.color, has_loan: ct.has_loan, has_qty: ct.has_qty };
    return map;
  }, [customTypes]);

  const getColor = t => typeMap[t]?.color || '#6b7280';

  const sorted = useMemo(() => {
    const { key, dir } = sortConfig;
    return [...assets].sort((a, b) => {
      let av = a[key], bv = b[key];
      if (key === 'net_equity') {
        av = (Number(a.current_value)||0) - (Number(a.loan_outstanding)||0);
        bv = (Number(b.current_value)||0) - (Number(b.loan_outstanding)||0);
      }
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      return av < bv ? (dir === 'asc' ? -1 : 1) : av > bv ? (dir === 'asc' ? 1 : -1) : 0;
    });
  }, [assets, sortConfig]);

  const handleSort = key =>
    setSortConfig(p => ({ key, dir: p.key === key && p.dir === 'asc' ? 'desc' : 'asc' }));
  const SortIcon = ({ col }) => sortConfig.key !== col ? null
    : sortConfig.dir === 'asc' ? <ArrowUp size={12} className="inline ml-1" /> : <ArrowDown size={12} className="inline ml-1" />;

  const totalValue = useMemo(() => assets.reduce((s, a) => s + (Number(a.current_value)||0), 0), [assets]);
  const totalLoans = useMemo(() => assets.reduce((s, a) => s + (Number(a.loan_outstanding)||0), 0), [assets]);
  const netEquity  = totalValue - totalLoans;

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
        setDetailAsset(prev => prev?.id === id ? data : prev);
      } else {
        const { data } = await api.post('/other-assets', payload);
        setAssets(prev => [...prev, data]);
      }
      setShowModal(false); setEditing(null); setUpdateAsset(null);
      const { data: snaps } = await api.get('/other-assets/snapshots');
      setSnapshots(snaps);
    } catch (err) { alert(err.response?.data?.error || 'Error saving asset'); }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/other-assets/${id}`);
      setAssets(prev => prev.filter(a => a.id !== id));
      setConfirmDeleteId(null);
    } catch (err) { alert(err.response?.data?.error || 'Error deleting'); }
  };

  const handleSendReminder = async () => {
    setReminderSending(true);
    try {
      const { data } = await api.post('/other-assets/send-update-reminder');
      alert(`Sent to ${data.sent} profile${data.sent !== 1 ? 's' : ''}. ${data.stale > 0 ? `${data.stale} stale asset${data.stale !== 1 ? 's' : ''} flagged.` : ''}`);
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
    finally { setReminderSending(false); }
  };

  const handleAddCategory = async (form) => {
    try {
      const { data } = await api.post('/other-assets/types', form);
      setCustomTypes(prev => [...prev.filter(t => t.type_name !== data.type_name), data]);
      setShowCategoryModal(false);
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
  };

  const handleDeleteCategory = async (name) => {
    if (!confirm(`Delete category "${name}"?`)) return;
    try {
      await api.delete(`/other-assets/types/${encodeURIComponent(name)}`);
      setCustomTypes(prev => prev.filter(t => t.type_name !== name));
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
  };

  const snapshotChartData = snapshots.map(s => ({
    date: s.date,
    'Net Worth': +(Number(s.net_worth) / 100000).toFixed(2),
    'Illiquid Investments': +(Number(s.other_assets_value) / 100000).toFixed(2),
    'Loans': +(Number(s.other_loans) / 100000).toFixed(2),
  }));

  const thCls = 'th th-sort px-3 py-2.5';

  if (loading) return <div className="text-muted text-sm p-4">Loading…</div>;

  return (
    <div className="stack">
      <PageHeader title={activePerson ? `${activePerson}'s Illiquid Investments` : 'Illiquid Investments'} eyebrow="Property, gold & other non-market assets" />

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card">
          <div className="text-muted text-xs uppercase tracking-wide mb-1">Total Value</div>
          <div className="font-display text-xl font-bold text-white">{fmt2(totalValue)}</div>
        </div>
        <div className="card">
          <div className="text-muted text-xs uppercase tracking-wide mb-1">Total Loans</div>
          <div className="font-display text-xl font-bold text-neg">{totalLoans > 0 ? fmt2(totalLoans) : '—'}</div>
        </div>
        <div className="card">
          <div className="text-muted text-xs uppercase tracking-wide mb-1">Net Equity</div>
          <div className={`font-display text-xl font-bold ${netEquity >= 0 ? 'text-pos' : 'text-neg'}`}>{fmt2(netEquity)}</div>
        </div>
        <div className="card flex flex-col gap-2 justify-between">
          <div className="text-muted text-xs uppercase tracking-wide">Actions</div>
          <button onClick={async () => {
            setSnapshotSaving(true);
            try {
              await api.post('/other-assets/snapshot', { other_assets_value: totalValue, other_loans: totalLoans, net_worth: netEquity });
              const { data } = await api.get('/other-assets/snapshots'); setSnapshots(data);
            } catch (err) { alert(err.response?.data?.error || 'Error'); }
            finally { setSnapshotSaving(false); }
          {/* btn-ghost, not btn-primary: "Add Asset" is this page's one primary
              CTA, and two accent pills competing for it is what the accent
              budget exists to prevent. Recording a snapshot is a maintenance
              action, so it takes the secondary treatment. */}
          }} disabled={snapshotSaving} className="btn-ghost flex items-center gap-1 text-xs py-1.5">
            <Camera size={12} />{snapshotSaving ? 'Saving…' : 'Record Snapshot'}
          </button>
          <button onClick={handleSendReminder} disabled={reminderSending}
            className="btn-ghost flex items-center gap-1 text-xs py-1.5 border border-hairline/10 rounded-lg hover:border-hairline/20">
            <Mail size={12} />{reminderSending ? 'Sending…' : 'Send Update Email'}
          </button>
        </div>
      </div>

      {/* Type pills */}
      <div className="flex flex-wrap gap-2">
        {allTypes.filter(t => typeBreakdown[t]?.value > 0).map(t => (
          <div key={t} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
            style={{ background: getColor(t) + '18', border: `1px solid ${getColor(t)}33` }}>
            <span style={{ color: getColor(t) }} className="font-semibold">{t}</span>
            <span className="text-white">{fmt2(typeBreakdown[t].value)}</span>
            {typeBreakdown[t].loan > 0 && <span className="text-neg">−{fmt2(typeBreakdown[t].loan)}</span>}
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="ml-auto flex gap-1 items-center">
          <button onClick={() => setViewMode('card')} className={`icon-btn p-1.5 rounded ${viewMode === 'card' ? 'text-accent-ink' : 'text-muted hover:text-white'}`}><LayoutGrid size={16} /></button>
          <button onClick={() => setViewMode('table')} className={`icon-btn p-1.5 rounded ${viewMode === 'table' ? 'text-accent-ink' : 'text-muted hover:text-white'}`}><LayoutList size={16} /></button>
          <button onClick={() => setShowCategoryModal(true)}
            className="flex items-center gap-1.5 text-xs text-muted hover:text-white border border-hairline/10 hover:border-hairline/20 rounded-lg px-3 py-1.5 ml-1 transition-all min-h-[44px] sm:min-h-0">
            <Tag size={12} /> Category
          </button>
          <button onClick={() => { setEditing(null); setShowModal(true); }}
            className="btn-primary flex items-center gap-2 text-sm py-1.5 ml-1">
            <Plus size={14} /> Add Asset
          </button>
        </div>
      </div>

      {/* Custom type chips */}
      {customTypes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {customTypes.map(ct => (
            <div key={ct.type_name} className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs border"
              style={{ borderColor: ct.color + '44', background: ct.color + '11' }}>
              <span className="w-2 h-2 rounded-full" style={{ background: ct.color }} />
              <span style={{ color: ct.color }} className="font-semibold">{ct.type_name}</span>
              <button onClick={() => handleDeleteCategory(ct.type_name)} className="icon-btn text-muted hover:text-neg ml-0.5"><X size={10} /></button>
            </div>
          ))}
        </div>
      )}

      {sorted.length === 0 && (
        <div className="card">
          <EmptyState icon={Landmark} title="No illiquid investments yet"
            hint="Track property, vehicles, gold, PPF and NPS alongside your liquid portfolio."
            action={<button onClick={() => { setEditing(null); setShowModal(true); }}
              className="btn-ghost inline-flex items-center gap-2 text-sm"><Plus size={14} /> Add Asset</button>} />
        </div>
      )}

      {/* Card view */}
      {viewMode === 'card' && sorted.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sorted.map(a => (
            <AssetCard key={a.id} asset={a} typeColor={getColor(a.asset_type)}
              onEdit={a => { setEditing(a); setShowModal(true); }}
              onDelete={handleDelete} onDetail={setDetailAsset} onUpdate={setUpdateAsset}
              confirmDeleteId={confirmDeleteId} setConfirmDeleteId={setConfirmDeleteId} />
          ))}
        </div>
      )}

      {/* Table view */}
      {viewMode === 'table' && sorted.length > 0 && (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline/8">
                <th className={thCls} onClick={() => handleSort('asset_type')}>Type <SortIcon col="asset_type" /></th>
                <th className={thCls} onClick={() => handleSort('name')}>Name <SortIcon col="name" /></th>
                <th className={thCls} onClick={() => handleSort('account')}>Account <SortIcon col="account" /></th>
                <th className={thCls} onClick={() => handleSort('current_value')}>Value <SortIcon col="current_value" /></th>
                <th className={thCls} onClick={() => handleSort('loan_outstanding')}>Loan <SortIcon col="loan_outstanding" /></th>
                <th className={thCls} onClick={() => handleSort('net_equity')}>Equity <SortIcon col="net_equity" /></th>
                <th className={`${thCls} hidden md:table-cell`} onClick={() => handleSort('as_of_date')}>Updated <SortIcon col="as_of_date" /></th>
                <th className="th th-right px-3 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(a => {
                const cur = Number(a.current_value)||0, loan = Number(a.loan_outstanding)||0, eq = cur - loan;
                const d = daysSince(a.as_of_date);
                const sc = d == null ? 'text-muted' : d > 60 ? 'text-neg' : d > 30 ? 'text-hue-amber' : 'text-muted';
                return (
                  <tr key={a.id} className="border-b border-hairline/5 hover:bg-white/[0.02] cursor-pointer"
                    onClick={() => setDetailAsset(a)}>
                    <td className="px-3 py-2.5"><TypeBadge type={a.asset_type} color={getColor(a.asset_type)} /></td>
                    <td className="px-3 py-2.5 text-white font-medium">{a.name}</td>
                    <td className="px-3 py-2.5 text-soft text-xs">{a.account}</td>
                    <td className="px-3 py-2.5 font-semibold text-white">{fmt2(cur)}</td>
                    <td className="px-3 py-2.5">{loan > 0 ? <span className="text-neg">{fmt2(loan)}</span> : <span className="text-muted">—</span>}</td>
                    <td className="px-3 py-2.5"><span className={eq >= 0 ? 'text-pos' : 'text-neg'}>{fmt2(eq)}</span></td>
                    <td className={`px-3 py-2.5 text-xs hidden md:table-cell ${sc}`}>{d != null ? `${d}d ago` : '—'}</td>
                    <td className="px-3 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                      {confirmDeleteId === a.id ? (
                        <span className="flex items-center gap-1 justify-end text-xs">
                          <span className="text-neg">Delete?</span>
                          <button onClick={() => handleDelete(a.id)} className="text-neg font-semibold">Yes</button>
                          <button onClick={() => setConfirmDeleteId(null)} className="text-muted ml-1">No</button>
                        </span>
                      ) : (
                        <span className="flex items-center gap-2 justify-end">
                          <button onClick={() => setUpdateAsset(a)} className="icon-btn text-muted hover:text-accent-ink" title="Quick update"><RefreshCw size={13} /></button>
                          <button onClick={() => { setEditing(a); setShowModal(true); }} className="icon-btn text-muted hover:text-white"><Edit2 size={13} /></button>
                          <button onClick={() => setConfirmDeleteId(a.id)} className="text-muted hover:text-neg"><Trash2 size={13} /></button>
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

      {/* Net worth trend */}
      {snapshotChartData.length >= 2 && (
        <div className="card space-y-3">
          <h3 className="font-display font-bold text-white text-sm">Net Worth Trend</h3>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={snapshotChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="date" {...AX} />
              <YAxis {...AX} unit="L" width={40} />
              <Tooltip {...TT} formatter={(v, n) => [`₹${v}L`, n]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="Net Worth" stroke="#f0c040" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Illiquid Investments" stroke="#a78bfa" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
              <Line type="monotone" dataKey="Loans" stroke="#fb7185" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Modals */}
      {showModal && (
        <AssetModal initial={editing} persons={persons} assetTypes={allTypes} typeMap={typeMap}
          onSave={handleSave} onCancel={() => { setShowModal(false); setEditing(null); }} />
      )}
      {updateAsset && (
        <UpdateValueModal asset={updateAsset} typeMap={typeMap}
          onSave={handleSave} onCancel={() => setUpdateAsset(null)} />
      )}
      {showCategoryModal && (
        <CategoryModal onSave={handleAddCategory} onCancel={() => setShowCategoryModal(false)} />
      )}
      {detailAsset && (
        <DetailModal asset={detailAsset} typeColor={getColor(detailAsset.asset_type)}
          onClose={() => setDetailAsset(null)}
          onEdit={a => { setDetailAsset(null); setEditing(a); setShowModal(true); }} />
      )}
    </div>
  );
}
