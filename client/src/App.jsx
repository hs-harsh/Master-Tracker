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
  const [form, setForm] = useState({ username: 'hskv', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.username, form.password);
      // ProtectedOutlet re-renders automatically after login — no navigate needed
    } catch {
      setError('Invalid credentials');
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
          <h2 className="font-display text-xl font-bold text-white">Sign in required</h2>
          <p className="text-muted text-sm mt-1">This section is private. Sign in to continue.</p>
        </div>
        <form onSubmit={handleSubmit} className="card space-y-4">
          <div>
            <label className="label">Username</label>
            <input
              className="input"
              value={form.username}
              onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
              autoComplete="username"
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              type="password"
              className="input"
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </div>
          {error && <p className="text-rose text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full justify-center flex"
          >
            {loading ? <><Loader2 size={16} className="animate-spin mr-2" />Signing in…</> : 'Sign In'}
          </button>
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
