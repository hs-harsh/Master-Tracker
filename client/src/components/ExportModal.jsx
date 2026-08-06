import { useEffect, useRef, useState } from 'react';
import { X, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import api from '../lib/api';

/**
 * "Export & Email" trigger — mounted by Dashboard.jsx when the "Export &
 * Email" button is clicked (Dashboard owns an `exportModalOpen` boolean and
 * renders `{exportModalOpen && <ExportModal onClose={...} />}`; that wiring
 * is unchanged).
 *
 * This used to be a centered modal asking for a recipient email. The
 * recipient is now always the account owner's own address — the server
 * defaults `toEmail` from the JWT when it's omitted (see
 * server/routes/export.js) — so there's nothing left to type. On mount this
 * fires the send immediately with no body and renders as a small anchored
 * status card (no backdrop, no dialog, nothing to click through): a brief
 * loading state, then success or error, then it closes itself via onClose()
 * so the Dashboard button reverts to normal on its own.
 */
export default function ExportModal({ onClose }) {
  const [status, setStatus] = useState('sending'); // sending | success | error
  const [error, setError] = useState('');
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    let closeTimer;
    api.post('/export/email', {})
      .then(() => {
        setStatus('success');
        closeTimer = setTimeout(() => onClose(), 2200);
      })
      .catch((err) => {
        setStatus('error');
        setError(err.response?.data?.error || 'Failed to send export');
        closeTimer = setTimeout(() => onClose(), 4500);
      });
    return () => clearTimeout(closeTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed top-4 inset-x-4 sm:inset-x-auto sm:right-4 sm:w-80 z-50 safe-area-top">
      <div className="bg-ink border border-border rounded-xl shadow-xl px-4 py-3 flex items-start gap-3">
        {status === 'sending' && (
          <>
            <Loader2 size={16} className="text-accent animate-spin shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm text-white font-semibold">Sending…</p>
              <p className="text-xs text-muted mt-0.5">Emailing your finance report to yourself.</p>
            </div>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle2 size={16} className="text-pos shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm text-white font-semibold">Email sent</p>
              <p className="text-xs text-muted mt-0.5">Check your inbox for the PDF + Excel report.</p>
            </div>
          </>
        )}
        {status === 'error' && (
          <>
            <AlertTriangle size={16} className="text-rose shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white font-semibold">Couldn&rsquo;t send export</p>
              <p className="text-xs text-rose mt-0.5">{error}</p>
            </div>
            <button type="button" onClick={onClose} className="text-muted hover:text-white p-1 shrink-0">
              <X size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
