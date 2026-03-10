import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom';
import { useState } from 'react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Cashflow from './pages/Cashflow';
import Transactions from './pages/Transactions';
import Portfolio from './pages/Portfolio';
import Investments from './pages/Investments';
import ExpenseAnalyser from './pages/ExpenseAnalyser';
import Trade from './pages/Trade';
import StockTrade from './pages/StockTrade';
import Settings from './pages/Settings';
import { Lock, Loader2 } from 'lucide-react';

function LoginPrompt() {
  const [form, setForm] = useState({ username: '', password: '', personName: '' });
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(form.username, form.password);
      } else {
        if (!form.personName.trim()) { setError('Person name is required'); setLoading(false); return; }
        await register(form.username, form.password, form.personName);
      }
    } catch (err) {
      setError(mode === 'login' ? 'Invalid credentials' : (err.response?.data?.error || 'Registration failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center min-h-full p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-accent/10 border border-accent/20 mb-4">
            <Lock size={22} className="text-accent" />
          </div>
          <h2 className="font-display text-xl font-bold text-white">
            {mode === 'login' ? 'Sign in required' : 'Create account'}
          </h2>
          <p className="text-muted text-sm mt-1">This section is private.</p>
        </div>
        <form onSubmit={handleSubmit} className="card space-y-4">
          <div>
            <label className="label">Username</label>
            <input
              className="input"
              value={form.username}
              onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
              autoComplete="username"
              placeholder="Enter username"
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              type="password"
              className="input"
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder="••••••••"
            />
          </div>
          {mode === 'register' && (
            <div>
              <label className="label">Your Name</label>
              <input
                className="input"
                value={form.personName}
                onChange={(e) => setForm((p) => ({ ...p, personName: e.target.value }))}
                placeholder="e.g. Alice"
                autoComplete="name"
              />
              <p className="text-muted text-xs mt-1">This name tags all your data (transactions, investments, etc.)</p>
            </div>
          )}
          {error && <p className="text-rose text-sm">{error}</p>}
          <div className="space-y-2">
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center flex">
              {loading
                ? <><Loader2 size={16} className="animate-spin mr-2" />{mode === 'login' ? 'Signing in…' : 'Creating…'}</>
                : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => { setMode(m => m === 'login' ? 'register' : 'login'); setError(''); }}
              className="btn-ghost w-full justify-center flex text-sm text-soft hover:text-accent border border-border hover:border-accent/30"
            >
              {mode === 'login' ? 'Create new account' : 'Back to sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProtectedOutlet() {
  const { isAuth } = useAuth();
  return isAuth ? <Outlet /> : <LoginPrompt />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            {/* Public — no login required */}
            <Route path="trade" element={<Trade />} />
            <Route path="stock-trade" element={<StockTrade />} />
            {/* Private — shows inline login prompt if not authenticated */}
            <Route element={<ProtectedOutlet />}>
              <Route index element={<Dashboard />} />
              <Route path="portfolio" element={<Portfolio />} />
              <Route path="investments" element={<Investments />} />
              <Route path="cashflow" element={<Cashflow />} />
              <Route path="transactions" element={<Transactions />} />
              <Route path="expense-analyser" element={<ExpenseAnalyser />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
