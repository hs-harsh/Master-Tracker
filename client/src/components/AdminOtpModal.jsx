import { useState, useRef, useEffect } from 'react';
import { Shield, Loader2, RefreshCw, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export default function AdminOtpModal() {
  const { verifyAdminOtp, resendAdminOtp, dismissAdminOtp, personName } = useAuth();
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const inputs = useRef([]);

  // Auto-focus first input on mount
  useEffect(() => { inputs.current[0]?.focus(); }, []);

  const handleChange = (i, val) => {
    // Accept paste of full code
    if (val.length === 6 && /^\d{6}$/.test(val)) {
      const digits = val.split('');
      setOtp(digits);
      inputs.current[5]?.focus();
      return;
    }
    if (!/^\d?$/.test(val)) return;
    const next = [...otp];
    next[i] = val;
    setOtp(next);
    if (val && i < 5) inputs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const code = otp.join('');
    if (code.length !== 6) { setError('Enter all 6 digits'); return; }
    setError('');
    setLoading(true);
    try {
      await verifyAdminOtp(code);
      // Success — modal will unmount because pendingAdminOtp becomes false
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid OTP');
      setOtp(['', '', '', '', '', '']);
      inputs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setError('');
    try {
      await resendAdminOtp();
      setResent(true);
      setOtp(['', '', '', '', '', '']);
      inputs.current[0]?.focus();
      setTimeout(() => setResent(false), 4000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to resend OTP');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="relative px-6 pt-6 pb-5 text-center border-b border-border">
          <button
            onClick={dismissAdminOtp}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-muted hover:text-text transition-colors"
            title="Continue without admin access"
          >
            <X size={16} />
          </button>
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/25 mb-4">
            <Shield size={26} className="text-amber-400" />
          </div>
          <h2 className="text-lg font-bold text-text">Admin Verification</h2>
          <p className="text-sm text-muted mt-1">
            A 6-digit code was sent to<br />
            <span className="text-text font-medium">{personName || 'your email'}</span>
          </p>
        </div>

        {/* OTP Form */}
        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-5">
          <div>
            <p className="text-xs text-muted text-center mb-3 uppercase tracking-wider">Enter verification code</p>
            <div className="flex justify-center gap-2">
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => (inputs.current[i] = el)}
                  type="text"
                  inputMode="numeric"
                  maxLength={i === 0 ? 6 : 1}
                  value={digit}
                  onChange={(e) => handleChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  onFocus={(e) => e.target.select()}
                  className={`w-11 h-14 text-center text-xl font-bold rounded-lg border transition-all outline-none
                    bg-background text-text
                    ${digit ? 'border-amber-400 shadow-[0_0_0_2px_rgba(245,158,11,0.2)]' : 'border-border'}
                    focus:border-amber-400 focus:shadow-[0_0_0_2px_rgba(245,158,11,0.2)]`}
                />
              ))}
            </div>
          </div>

          {error && (
            <p className="text-center text-sm text-red-400">{error}</p>
          )}
          {resent && (
            <p className="text-center text-sm text-green-400">New code sent to your email!</p>
          )}

          <button
            type="submit"
            disabled={loading || otp.join('').length !== 6}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold text-sm transition-colors"
          >
            {loading ? <><Loader2 size={16} className="animate-spin" /> Verifying…</> : 'Verify & Unlock Admin'}
          </button>

          <div className="flex items-center justify-between text-xs text-muted">
            <span>Code expires in 10 min</span>
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="flex items-center gap-1 text-accent hover:text-accent/80 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={11} className={resending ? 'animate-spin' : ''} />
              {resending ? 'Sending…' : 'Resend code'}
            </button>
          </div>

          <p className="text-center text-xs text-muted pt-1">
            Skip for now?{' '}
            <button type="button" onClick={dismissAdminOtp} className="text-accent hover:underline">
              Continue without admin
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
