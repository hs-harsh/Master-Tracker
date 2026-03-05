import { useState } from 'react';
import { X, Trash2, AlertTriangle } from 'lucide-react';
import api from '../lib/api';
import { fmt, fmtDate } from '../lib/utils';

function downloadCsv(content, filename) {
  const blob = new Blob([content], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadBackupCsv() {
  const date = new Date().toISOString().slice(0, 10);
  try {
    const [txRes, invRes] = await Promise.all([
      api.get('/transactions/export', { responseType: 'text' }),
      api.get('/investments/export', { responseType: 'text' }),
    ]);
    downloadCsv(txRes.data, `transactions_backup_${date}.csv`);
    downloadCsv(invRes.data, `investments_backup_${date}.csv`);
  } catch (e) {
    console.warn('Backup download failed', e);
  }
}

export default function SyncResultModal({ result, onClose, onRemoved }) {
  const [removing, setRemoving] = useState(false);
  const tx = result?.transactions || { added: 0, errors: [], totalRows: 0, removedFromSheet: [], removedCount: 0 };
  const inv = result?.investments || { added: 0, errors: [], totalRows: 0, removedFromSheet: [], removedCount: 0 };
  const hasRemoved = (tx.removedCount || 0) + (inv.removedCount || 0) > 0;

  const handleRemoveFromDb = async () => {
    if (!confirm('Remove these rows from the database? This cannot be undone.')) return;
    setRemoving(true);
    try {
      for (const row of tx.removedFromSheet || []) {
        await api.delete(`/transactions/${row.id}`);
      }
      for (const row of inv.removedFromSheet || []) {
        await api.delete(`/investments/${row.id}`);
      }
      onRemoved?.();
      onClose();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to remove');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/80" onClick={onClose}>
      <div className="card max-w-2xl w-full max-h-[90vh] flex flex-col shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-bold text-white">Sync result</h3>
          <button onClick={onClose} className="text-muted hover:text-white"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto flex-1 min-h-0 space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-white mb-1">Transactions</h4>
            <p className="text-sm text-soft">
              Added <strong className="text-teal">{tx.added}</strong> new rows (of {tx.totalRows} in sheet).
              {tx.errors?.length > 0 && <span className="text-rose ml-1">{tx.errors.length} error(s)</span>}
              {(tx.removedCount || 0) > 0 && (
                <span className="text-amber-400 ml-1">{tx.removedCount} not in sheet (removed from sheet)</span>
              )}
            </p>
            {tx.errors?.length > 0 && (
              <ul className="mt-2 text-xs text-rose space-y-0.5">
                {tx.errors.map((e, i) => (
                  <li key={i}>Row {e.row}: {e.message}</li>
                ))}
              </ul>
            )}
            {(tx.removedFromSheet?.length || 0) > 0 && (
              <ul className="mt-2 text-xs text-soft space-y-0.5 max-h-24 overflow-y-auto">
                {tx.removedFromSheet.slice(0, 10).map((row, i) => (
                  <li key={row.id}>{fmtDate(row.date)} {row.type} {row.account} {fmt(row.amount)}</li>
                ))}
                {tx.removedFromSheet.length > 10 && <li>… and {tx.removedFromSheet.length - 10} more</li>}
              </ul>
            )}
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white mb-1">Investments</h4>
            <p className="text-sm text-soft">
              Added <strong className="text-teal">{inv.added}</strong> new rows (of {inv.totalRows} in sheet).
              {inv.errors?.length > 0 && <span className="text-rose ml-1">{inv.errors.length} error(s)</span>}
              {(inv.removedCount || 0) > 0 && (
                <span className="text-amber-400 ml-1">{inv.removedCount} not in sheet (removed from sheet)</span>
              )}
            </p>
            {inv.errors?.length > 0 && (
              <ul className="mt-2 text-xs text-rose space-y-0.5">
                {inv.errors.map((e, i) => (
                  <li key={i}>Row {e.row}: {e.message}</li>
                ))}
              </ul>
            )}
            {(inv.removedFromSheet?.length || 0) > 0 && (
              <ul className="mt-2 text-xs text-soft space-y-0.5 max-h-24 overflow-y-auto">
                {inv.removedFromSheet.slice(0, 10).map((row, i) => (
                  <li key={row.id}>{fmtDate(row.date)} {row.goal} {row.instrument} {row.side} {fmt(row.amount)}</li>
                ))}
                {inv.removedFromSheet.length > 10 && <li>… and {inv.removedFromSheet.length - 10} more</li>}
              </ul>
            )}
          </div>
          {hasRemoved && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
              <div className="text-sm text-soft">
                <p className="font-semibold text-amber-400">Rows in DB but not in sheet</p>
                <p>These rows were removed from the sheet. You can remove them from the database to match the sheet.</p>
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-2 mt-3 pt-3 border-t border-border">
          {hasRemoved && (
            <button
              onClick={handleRemoveFromDb}
              disabled={removing}
              className="btn-ghost flex items-center gap-2 text-rose border-rose/50 hover:bg-rose/10"
            >
              <Trash2 size={14} />
              {removing ? 'Removing…' : 'Remove these from DB'}
            </button>
          )}
          <button onClick={onClose} className="btn-primary flex-1">Close</button>
        </div>
      </div>
    </div>
  );
}
