import { X } from 'lucide-react';
import api from '../lib/api';

function downloadCsv(content, filename) {
  const blob = new Blob([content], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const date = () => new Date().toISOString().slice(0, 10);

/** Download backup for the given type only. Call before sync. */
export async function downloadBackupCsv(type) {
  try {
    if (type === 'transactions') {
      const res = await api.get('/transactions/export', { responseType: 'text' });
      downloadCsv(res.data, `transactions_backup_${date()}.csv`);
    } else if (type === 'investments') {
      const res = await api.get('/investments/export', { responseType: 'text' });
      downloadCsv(res.data, `investments_backup_${date()}.csv`);
    }
  } catch (e) {
    console.warn('Backup download failed', e);
  }
}

export default function SyncResultModal({ result, syncType, onClose }) {
  const section = (syncType === 'transactions' ? result?.transactions : result?.investments) || { added: 0, errors: [], totalRows: 0 };
  const label = syncType === 'transactions' ? 'Transactions' : 'Investments';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/80" onClick={onClose}>
      <div className="card max-w-2xl w-full max-h-[90vh] flex flex-col shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-bold text-white">Sync result</h3>
          <button onClick={onClose} className="text-muted hover:text-white"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto flex-1 min-h-0">
          <h4 className="text-sm font-semibold text-white mb-1">{label}</h4>
          <p className="text-sm text-soft">
            Replaced DB with sheet: <strong className="text-teal">{section.added}</strong> rows added (of {section.totalRows} in sheet).
            {section.errors?.length > 0 && <span className="text-rose ml-1">{section.errors.length} row(s) skipped (errors)</span>}
          </p>
          {section.errors?.length > 0 && (
            <ul className="mt-2 text-xs text-rose space-y-0.5 max-h-32 overflow-y-auto">
              {section.errors.map((e, i) => (
                <li key={i}>Row {e.row}: {e.message}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex gap-2 mt-3 pt-3 border-t border-border">
          <button onClick={onClose} className="btn-primary flex-1">Close</button>
        </div>
      </div>
    </div>
  );
}
