import { useState } from 'react';
import { X, Mail, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import api from '../lib/api';

/**
 * "Export & Email" modal — Dashboard button opens this. Single recipient
 * email field (no scope selector: the export always covers every person on
 * the account, aggregated per-person). Shell/overlay style matches
 * ReportModal.jsx.
 */
export default function ExportModal({ onClose }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | success | error
  const [error, setError] = useState('');

  const handleSend = async () => {
    const trimmed = email.trim();
    if (!trimmed) { setError('Enter a recipient email address'); return; }
    setStatus('sending');
    setError('');
    try {
      await api.post('/export/email', { toEmail: trimmed });
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setError(err.response?.data?.error || 'Failed to send export');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center overflow-y-auto bg-black/70 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-ink border border-border rounded-t-xl sm:rounded-xl shadow-xl max-w-md w-full sm:my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 sm:px-6 pt-5 pb-3 flex items-center justify-between border-b border-border safe-area-top">
          <div className="min-w-0 pr-8">
            <h2 className="font-display text-lg font-bold text-white">Export &amp; Email</h2>
            <p className="text-muted text-xs mt-0.5">Combined PDF + Excel workbook, all profiles</p>
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:text-white p-1 shrink-0">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 space-y-4">
          {status === 'success' ? (
            <div className="flex flex-col items-center text-center gap-3 py-4">
              <CheckCircle2 size={36} className="text-pos" />
              <p className="text-sm text-white font-semibold">Export sent</p>
              <p className="text-xs text-soft">
                A combined PDF report and Excel workbook were emailed to <span className="font-mono text-text">{email.trim()}</span>.
              </p>
              <button onClick={onClose} className="btn-primary mt-2">Done</button>
            </div>
          ) : (
            <>
              <div>
                <label className="label mb-1.5 block">Recipient email</label>
                <div className="flex items-center gap-2">
                  <Mail size={14} className="text-muted shrink-0" />
                  <input
                    type="email"
                    className="input flex-1"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(''); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    autoFocus
                  />
                </div>
                <p className="text-[11px] text-muted mt-1.5">
                  Covers every profile on this account — net worth, portfolio, investments, illiquid assets, cashflow and transactions.
                </p>
              </div>

              {status === 'error' && (
                <div className="flex items-start gap-2 rounded-lg bg-rose/10 border border-rose/30 px-3 py-2">
                  <AlertTriangle size={14} className="text-rose shrink-0 mt-0.5" />
                  <p className="text-xs text-rose">{error}</p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button onClick={onClose} className="btn-ghost">Cancel</button>
                <button
                  onClick={handleSend}
                  disabled={status === 'sending' || !email.trim()}
                  className="btn-primary flex items-center gap-2"
                >
                  {status === 'sending' ? (
                    <><Loader2 size={14} className="animate-spin" /> Sending…</>
                  ) : (
                    <><Mail size={14} /> Send</>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
