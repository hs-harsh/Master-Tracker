import { X } from 'lucide-react';

export default function SyncResultModal({ result, onClose }) {
  const tx = result?.transactions || { added: 0, errors: [], totalRows: 0 };
  const inv = result?.investments || { added: 0, errors: [], totalRows: 0 };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/80" onClick={onClose}>
      <div className="card max-w-lg w-full max-h-[85vh] flex flex-col shadow-xl" onClick={e => e.stopPropagation()}>
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
            </p>
            {tx.errors?.length > 0 && (
              <ul className="mt-2 text-xs text-rose space-y-0.5">
                {tx.errors.map((e, i) => (
                  <li key={i}>Row {e.row}: {e.message}</li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white mb-1">Investments</h4>
            <p className="text-sm text-soft">
              Added <strong className="text-teal">{inv.added}</strong> new rows (of {inv.totalRows} in sheet).
              {inv.errors?.length > 0 && <span className="text-rose ml-1">{inv.errors.length} error(s)</span>}
            </p>
            {inv.errors?.length > 0 && (
              <ul className="mt-2 text-xs text-rose space-y-0.5">
                {inv.errors.map((e, i) => (
                  <li key={i}>Row {e.row}: {e.message}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <button onClick={onClose} className="btn-primary mt-3 w-full">Close</button>
      </div>
    </div>
  );
}
