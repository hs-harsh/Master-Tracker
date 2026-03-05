import { useEffect, useState } from 'react';
import api from '../lib/api';
import { Settings as SettingsIcon, Save, RefreshCw, X } from 'lucide-react';

export default function Settings() {
  const [sheetUrlTransactions, setSheetUrlTransactions] = useState('');
  const [sheetUrlInvestments, setSheetUrlInvestments] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  const load = () => {
    api.get('/settings/sheet-urls').then(r => {
      setSheetUrlTransactions(r.data.sheetUrlTransactions || '');
      setSheetUrlInvestments(r.data.sheetUrlInvestments || '');
    }).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/settings/sheet-urls', {
        sheetUrlTransactions: sheetUrlTransactions.trim(),
        sheetUrlInvestments: sheetUrlInvestments.trim(),
      });
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const r = await api.post('/settings/sync-from-sheet');
      setSyncResult(r.data);
    } catch (e) {
      alert(e.response?.data?.error || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Settings</h1>
        <p className="text-muted text-sm mt-0.5">Link a Google Sheet and sync new rows into the app</p>
      </div>

      <div className="card max-w-2xl">
        <div className="flex items-center gap-2 mb-4">
          <SettingsIcon size={18} className="text-accent" />
          <h2 className="font-display font-bold text-white">Linked Google Sheet</h2>
        </div>
        <p className="text-sm text-soft mb-4">
          Use one Google Sheet with two tabs: <strong>Transactions</strong> and <strong>Investments</strong>. Publish each tab to the web as CSV (File → Share → Publish to web → pick sheet → CSV), then paste the two links below. Sync will add only new rows that don’t already exist in the DB.
        </p>
        <div className="space-y-3">
          <div>
            <label className="label">Transactions sheet CSV URL</label>
            <input
              type="url"
              className="input w-full"
              placeholder="https://docs.google.com/... (published CSV link for Transactions tab)"
              value={sheetUrlTransactions}
              onChange={e => setSheetUrlTransactions(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Investments sheet CSV URL</label>
            <input
              type="url"
              className="input w-full"
              placeholder="https://docs.google.com/... (published CSV link for Investments tab)"
              value={sheetUrlInvestments}
              onChange={e => setSheetUrlInvestments(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
            <Save size={14} /> {saving ? 'Saving…' : 'Save links'}
          </button>
          <button
            onClick={handleSync}
            disabled={syncing || (!sheetUrlTransactions && !sheetUrlInvestments)}
            className="btn-ghost flex items-center gap-2"
            title="Fetch sheets and add only new rows to DB"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing…' : 'Sync with sheet'}
          </button>
        </div>
      </div>

      {syncResult && (
        <SyncResultModal result={syncResult} onClose={() => setSyncResult(null)} />
      )}
    </div>
  );
}

function SyncResultModal({ result, onClose }) {
  const tx = result.transactions || { added: 0, errors: [], totalRows: 0 };
  const inv = result.investments || { added: 0, errors: [], totalRows: 0 };
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
