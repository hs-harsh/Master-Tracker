import { BrowserRouter, Routes, Route, Outlet, Navigate } from 'react-router-dom';
import { useState, useRef, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import api from './lib/api';
import Layout from './components/Layout';
import FinanceLayout from './components/FinanceLayout';
import Dashboard from './pages/Dashboard';
import Cashflow from './pages/Cashflow';
import Transactions from './pages/Transactions';
import Portfolio from './pages/Portfolio';
import Investments from './pages/Investments';
import ExpenseAnalyser from './pages/ExpenseAnalyser';
import WellnessHabits from './pages/wellness/WellnessHabits';
import WellnessMeals from './pages/wellness/WellnessMeals';
import WellnessWorkouts from './pages/wellness/WellnessWorkouts';
import BacktestPage from './pages/trading/BacktestPage';
import PostTradePage from './pages/trading/PostTradePage';
import Trade from './pages/Trade';
import StockTrade from './pages/StockTrade';
import Settings from './pages/Settings';
import Admin from './pages/Admin';
import { Lock, Mail, Loader2, ArrowLeft, Eye, EyeOff } from 'lucide-react';

// ── OTP digit input row ────────────────────────────────────────────────────────
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
          className={`w-11 h-14 text-center text-xl font-bold rounded-xl border-2 transition-all outline-none bg-surface text-white
            ${digit ? 'border-accent' : 'border-border'} focus:border-accent`}
        />
      ))}
    </div>
  );
}

// ── Shared auth form (used inline when not logged in) ─────────────────────────
export function OtpLoginForm() {
  const { login, register, sendOtp, verifyOtp } = useAuth();

  // mode: 'signin' | 'otp-send' | 'otp-verify' | 'register'
  const [mode, setMode] = useState('signin');
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

  const reset = (nextMode) => {
    setError('');
    setOtp(['', '', '', '', '', '']);
    setDevOtp('');
    setMode(nextMode);
  };

  // ── Password sign in ────────────────────────────────────────────────────────
  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  // ── Register ────────────────────────────────────────────────────────────────
  const handleRegister = async (e) => {
    e.preventDefault();
    if (!personName.trim()) { setError('Your name is required'); return; }
    setError('');
    setLoading(true);
    try {
      await register(email, password, personName);
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  // ── Send OTP ─────────────────────────────────────────────────────────────────
  const handleSendOtp = async (e) => {
    e?.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await sendOtp(email.trim().toLowerCase());
      setIsNewUser(res.isNewUser);
      if (res.devOtp) setDevOtp(res.devOtp); // dev fallback
      setMode('otp-verify');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send code');
    } finally {
      setLoading(false);
    }
  };

  // ── Verify OTP ───────────────────────────────────────────────────────────────
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    const code = otp.join('');
    if (code.length !== 6) { setError('Enter all 6 digits'); return; }
    if (isNewUser && !personName.trim()) { setError('Your name is required'); return; }
    setError('');
    setLoading(true);
    try {
      await verifyOtp(email, code, personName);
    } catch (err) {
      setError(err.response?.data?.error || 'Incorrect code');
      setOtp(['', '', '', '', '', '']);
      otpInputs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setError('');
    try {
      const res = await sendOtp(email.trim().toLowerCase());
      if (res.devOtp) setDevOtp(res.devOtp);
      setOtp(['', '', '', '', '', '']);
      setResent(true);
      setTimeout(() => setResent(false), 4000);
      otpInputs.current[0]?.focus();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to resend');
    } finally {
      setResending(false);
    }
  };

  const heading = mode === 'register' ? 'Create account' : 'Sign in required';

  return (
    <div className="flex-1 flex items-center justify-center min-h-full p-6">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-accent/10 border border-accent/20 mb-4">
            {mode === 'otp-verify' ? <Mail size={22} className="text-accent" /> : <Lock size={22} className="text-accent" />}
          </div>
          <h2 className="font-display text-xl font-bold text-white">{heading}</h2>
          <p className="text-muted text-sm mt-1">
            {mode === 'otp-verify'
              ? <>Code sent to <span className="text-text font-medium">{email}</span></>
              : 'This section is private.'}
          </p>
        </div>

        {/* ── Password sign in ── */}
        {mode === 'signin' && (
          <form onSubmit={handlePasswordLogin} className="card space-y-4">
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)}
                autoComplete="email" placeholder="you@example.com" required />
            </div>
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} className="input pr-10" value={password}
                  onChange={e => setPassword(e.target.value)} autoComplete="current-password" placeholder="••••••••" required />
                <button type="button" onClick={() => setShowPw(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text transition-colors">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            {error && <p className="text-rose text-sm">{error}</p>}
            <div className="space-y-2">
              <button type="submit" disabled={loading} className="btn-primary w-full justify-center flex">
                {loading ? <><Loader2 size={16} className="animate-spin mr-2" />Signing in…</> : 'Sign In'}
              </button>
              <button type="button" onClick={() => { reset('otp-send'); }}
                className="btn-ghost w-full justify-center flex text-sm text-soft hover:text-accent border border-border hover:border-accent/30">
                <Mail size={14} className="mr-2" />Sign in with code instead
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
                className="btn-ghost w-full justify-center flex text-sm text-soft border border-border">
                <ArrowLeft size={14} className="mr-2" />Use password instead
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
              <label className="label text-center block mb-3">6-digit code</label>
              <OtpBoxes otp={otp} setOtp={setOtp} inputsRef={otpInputs} />
            </div>
            {devOtp && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-xs text-amber-400">
                <span className="font-semibold">Dev mode —</span> email not sent. Code: <span className="font-mono font-bold">{devOtp}</span>
              </div>
            )}
            {error && <p className="text-center text-rose text-sm">{error}</p>}
            {resent && <p className="text-center text-green-400 text-sm">New code sent!</p>}
            <button type="submit" disabled={loading || otp.join('').length !== 6} className="btn-primary w-full justify-center flex">
              {loading ? <><Loader2 size={16} className="animate-spin mr-2" />Verifying…</> : isNewUser ? 'Create Account' : 'Sign In'}
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
                autoComplete="email" placeholder="you@example.com" required />
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
                  onChange={e => setPassword(e.target.value)} autoComplete="new-password" placeholder="••••••••" required />
                <button type="button" onClick={() => setShowPw(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text transition-colors">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            {error && <p className="text-rose text-sm">{error}</p>}
            <div className="space-y-2">
              <button type="submit" disabled={loading} className="btn-primary w-full justify-center flex">
                {loading ? <><Loader2 size={16} className="animate-spin mr-2" />Creating…</> : 'Create Account'}
              </button>
            </div>
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

function ProtectedOutlet() {
  const { isAuth } = useAuth();
  return isAuth ? <Outlet /> : <OtpLoginForm />;
}

/** Finance section: redirects to Habits when sidebar finance is disabled; otherwise wraps sub-routes in FinanceLayout. */
function FinanceGuard() {
  const [financeEnabled, setFinanceEnabled] = useState(true);
  const [ready, setReady] = useState(false);

  const loadFinanceFlag = useCallback(() => {
    return api
      .get('/settings')
      .then((r) => {
        setFinanceEnabled(r.data?.sidebarFinanceEnabled !== false);
      })
      .catch(() => {
        setFinanceEnabled(true);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadFinanceFlag().finally(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [loadFinanceFlag]);

  useEffect(() => {
    const on = () => {
      loadFinanceFlag();
    };
    window.addEventListener('investtrack-settings', on);
    return () => window.removeEventListener('investtrack-settings', on);
  }, [loadFinanceFlag]);

  if (!ready) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[40vh]">
        <Loader2 className="animate-spin text-accent" size={32} />
      </div>
    );
  }

  if (!financeEnabled) {
    return <Navigate to="/wellness/habits" replace />;
  }

  return <FinanceLayout />;
}

/** Live trading routes: redirect to Habits when section is hidden in Settings. */
function LiveTradingGuard() {
  const [enabled, setEnabled] = useState(true);
  const [ready, setReady] = useState(false);

  const loadFlag = useCallback(() => {
    return api
      .get('/settings')
      .then((r) => {
        setEnabled(r.data?.sidebarLiveTradingEnabled !== false);
      })
      .catch(() => {
        setEnabled(true);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadFlag().finally(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [loadFlag]);

  useEffect(() => {
    const on = () => loadFlag();
    window.addEventListener('investtrack-settings', on);
    return () => window.removeEventListener('investtrack-settings', on);
  }, [loadFlag]);

  if (!ready) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[40vh]">
        <Loader2 className="animate-spin text-accent" size={32} />
      </div>
    );
  }

  if (!enabled) {
    return <Navigate to="/wellness/habits" replace />;
  }

  return <Outlet />;
}

function AdminOutlet() {
  const { isAuth, isAdmin } = useAuth();
  if (!isAuth) return <OtpLoginForm />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route path="trade" element={<Trade />} />
            <Route path="stock-trade" element={<StockTrade />} />
            <Route element={<ProtectedOutlet />}>
              <Route path="/" element={<FinanceGuard />}>
                <Route index element={<Navigate to="/wellness/habits" replace />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="portfolio" element={<Portfolio />} />
                <Route path="investments" element={<Investments />} />
                <Route path="cashflow" element={<Cashflow />} />
                <Route path="transactions" element={<Transactions />} />
                <Route path="expense-analyser" element={<ExpenseAnalyser />} />
              </Route>
              <Route path="wellness" element={<Navigate to="/wellness/habits" replace />} />
              <Route path="wellness/habits" element={<WellnessHabits />} />
              <Route path="wellness/meals" element={<WellnessMeals />} />
              <Route path="wellness/workouts" element={<WellnessWorkouts />} />
              <Route element={<LiveTradingGuard />}>
                <Route path="live-trading" element={<Navigate to="/live-trading/backtest" replace />} />
                <Route path="live-trading/backtest" element={<BacktestPage />} />
                <Route path="live-trading/post-trade" element={<PostTradePage />} />
              </Route>
              <Route path="settings" element={<Settings />} />
            </Route>
            <Route element={<AdminOutlet />}>
              <Route path="admin" element={<Admin />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
