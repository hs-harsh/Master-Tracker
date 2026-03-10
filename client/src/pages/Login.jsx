import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Mail, ArrowLeft, Loader2, Lock, Eye, EyeOff } from 'lucide-react';

function OtpBoxes({ otp, setOtp, inputsRef }) {
  const handleChange = (i, val) => {
    if (val.length === 6 && /^\d{6}$/.test(val)) {
      setOtp(val.split(''));
      inputsRef.current[5]?.focus();
      return;
    }
    if (!/^\d?$/.test(val)) return;
    const next = [...otp];
    next[i] = val;
    setOtp(next);
    if (val && i < 5) inputsRef.current[i + 1]?.focus();
  };
  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) inputsRef.current[i - 1]?.focus();
  };
  return (
    <div className="flex justify-center gap-2">
      {otp.map((digit, i) => (
        <input
          key={i}
          ref={el => (inputsRef.current[i] = el)}
          type="text"
          inputMode="numeric"
          maxLength={i === 0 ? 6 : 1}
          value={digit}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          onFocus={e => e.target.select()}
          className={`w-11 h-14 text-center text-2xl font-bold rounded-xl border-2 transition-all outline-none bg-surface text-white
            ${digit ? 'border-accent' : 'border-border'} focus:border-accent`}
        />
      ))}
    </div>
  );
}

export default function Login() {
  const { login, register, sendOtp, verifyOtp } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState('signin'); // 'signin' | 'otp-send' | 'otp-verify' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [personName, setPersonName] = useState('');
  const [isNewUser, setIsNewUser] = useState(false);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [devOtp, setDevOtp] = useState('');
  const otpInputs = useRef([]);

  useEffect(() => {
    if (mode === 'otp-verify') setTimeout(() => otpInputs.current[0]?.focus(), 80);
  }, [mode]);

  const reset = (nextMode) => { setError(''); setOtp(['', '', '', '', '', '']); setDevOtp(''); setMode(nextMode); };

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try { await login(email, password); navigate('/'); }
    catch (err) { setError(err.response?.data?.error || 'Invalid credentials'); }
    finally { setLoading(false); }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!personName.trim()) { setError('Your name is required'); return; }
    setError(''); setLoading(true);
    try { await register(email, password, personName); navigate('/'); }
    catch (err) { setError(err.response?.data?.error || 'Registration failed'); }
    finally { setLoading(false); }
  };

  const handleSendOtp = async (e) => {
    e?.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await sendOtp(email.trim().toLowerCase());
      setIsNewUser(res.isNewUser);
      if (res.devOtp) setDevOtp(res.devOtp);
      setMode('otp-verify');
    }
    catch (err) { setError(err.response?.data?.error || 'Failed to send code'); }
    finally { setLoading(false); }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    const code = otp.join('');
    if (code.length !== 6) { setError('Enter all 6 digits'); return; }
    if (isNewUser && !personName.trim()) { setError('Your name is required'); return; }
    setError(''); setLoading(true);
    try { await verifyOtp(email, code, personName); navigate('/'); }
    catch (err) {
      setError(err.response?.data?.error || 'Incorrect code');
      setOtp(['', '', '', '', '', '']);
      otpInputs.current[0]?.focus();
    }
    finally { setLoading(false); }
  };

  const handleResend = async () => {
    setResending(true); setError('');
    try {
      const res = await sendOtp(email.trim().toLowerCase());
      if (res.devOtp) setDevOtp(res.devOtp);
      setOtp(['', '', '', '', '', '']);
      setResent(true);
      setTimeout(() => setResent(false), 4000);
      otpInputs.current[0]?.focus();
    }
    catch (err) { setError(err.response?.data?.error || 'Failed to resend'); }
    finally { setResending(false); }
  };

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center px-4">
      <div className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: 'linear-gradient(#f0c040 1px,transparent 1px),linear-gradient(90deg,#f0c040 1px,transparent 1px)', backgroundSize: '40px 40px' }} />

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-accent mb-4">
            <span className="text-ink font-display font-extrabold text-lg">IT</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-white">InvestTrack</h1>
          <p className="text-muted text-sm mt-1">
            {mode === 'otp-verify'
              ? <>Code sent to <span className="text-text font-medium">{email}</span></>
              : mode === 'register' ? 'Create your account' : 'Sign in to continue'}
          </p>
        </div>

        {/* ── Password sign in ── */}
        {mode === 'signin' && (
          <form onSubmit={handlePasswordLogin} className="card space-y-4">
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)}
                autoComplete="email" placeholder="you@example.com" required autoFocus />
            </div>
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} className="input pr-10" value={password}
                  onChange={e => setPassword(e.target.value)} autoComplete="current-password" placeholder="••••••••" required />
                <button type="button" onClick={() => setShowPw(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            {error && <p className="text-rose text-sm">{error}</p>}
            <div className="space-y-2 mt-1">
              <button type="submit" disabled={loading} className="btn-primary w-full justify-center flex">
                {loading ? <><Loader2 size={16} className="animate-spin mr-2" />Signing in…</> : 'Sign In'}
              </button>
              <button type="button" onClick={() => reset('otp-send')}
                className="btn-secondary w-full justify-center flex gap-2 text-sm">
                <Mail size={14} />Sign in with code instead
              </button>
            </div>
            <p className="text-center text-xs text-muted pt-1">
              No account?{' '}
              <button type="button" onClick={() => reset('register')} className="text-accent hover:underline">Create one</button>
            </p>
          </form>
        )}

        {/* ── Send OTP step ── */}
        {mode === 'otp-send' && (
          <form onSubmit={handleSendOtp} className="card space-y-4">
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)}
                autoComplete="email" placeholder="you@example.com" required autoFocus />
            </div>
            {error && <p className="text-rose text-sm">{error}</p>}
            <div className="space-y-2">
              <button type="submit" disabled={loading || !email.trim()} className="btn-primary w-full justify-center flex gap-2">
                {loading ? <><Loader2 size={16} className="animate-spin" />Sending…</> : <><Mail size={15} />Send Code</>}
              </button>
              <button type="button" onClick={() => reset('signin')}
                className="btn-secondary w-full justify-center flex gap-2 text-sm">
                <Lock size={14} />Use password instead
              </button>
            </div>
            <p className="text-center text-xs text-muted pt-1">
              No account?{' '}
              <button type="button" onClick={() => reset('register')} className="text-accent hover:underline">Create one</button>
            </p>
          </form>
        )}

        {/* ── OTP verify step ── */}
        {mode === 'otp-verify' && (
          <form onSubmit={handleVerifyOtp} className="card space-y-5">
            {isNewUser && (
              <div>
                <label className="label">Your name</label>
                <input className="input" value={personName} onChange={e => setPersonName(e.target.value)}
                  placeholder="e.g. Alice" autoComplete="name" />
                <p className="text-muted text-xs mt-1">Labels your data — can change later in Settings</p>
              </div>
            )}
            <div>
              <p className="label text-center mb-3">6-digit code</p>
              <OtpBoxes otp={otp} setOtp={setOtp} inputsRef={otpInputs} />
            </div>
            {devOtp && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-xs text-amber-400">
                <span className="font-semibold">Dev mode —</span> SMTP not configured. Code: <span className="font-mono font-bold">{devOtp}</span>
              </div>
            )}
            {error && <p className="text-center text-rose text-sm">{error}</p>}
            {resent && <p className="text-center text-green-400 text-sm">New code sent!</p>}
            <button type="submit" disabled={loading || otp.join('').length !== 6} className="btn-primary w-full justify-center flex">
              {loading ? <><Loader2 size={16} className="animate-spin mr-2" />Verifying…</> : isNewUser ? 'Create Account & Sign In' : 'Sign In'}
            </button>
            <div className="flex items-center justify-between text-xs text-muted">
              <button type="button" onClick={() => reset('otp-send')} className="flex items-center gap-1 hover:text-text transition-colors">
                <ArrowLeft size={12} /> Change email
              </button>
              <button type="button" onClick={handleResend} disabled={resending}
                className="text-accent hover:text-accent/80 disabled:opacity-50 transition-colors">
                {resending ? 'Sending…' : 'Resend code'}
              </button>
            </div>
          </form>
        )}

        {/* ── Register ── */}
        {mode === 'register' && (
          <form onSubmit={handleRegister} className="card space-y-4">
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)}
                autoComplete="email" placeholder="you@example.com" required autoFocus />
            </div>
            <div>
              <label className="label">Your name</label>
              <input className="input" value={personName} onChange={e => setPersonName(e.target.value)}
                placeholder="e.g. Alice" autoComplete="name" />
              <p className="text-muted text-xs mt-1">Labels your data — can change later in Settings</p>
            </div>
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} className="input pr-10" value={password}
                  onChange={e => setPassword(e.target.value)} autoComplete="new-password" placeholder="Create a password" required />
                <button type="button" onClick={() => setShowPw(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            {error && <p className="text-rose text-sm">{error}</p>}
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center flex">
              {loading ? <><Loader2 size={16} className="animate-spin mr-2" />Creating…</> : 'Create Account'}
            </button>
            <p className="text-center text-xs text-muted pt-1">
              Already have an account?{' '}
              <button type="button" onClick={() => reset('signin')} className="text-accent hover:underline">Sign in</button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
