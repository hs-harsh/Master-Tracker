import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function Login() {
  const [form, setForm] = useState({ username: '', password: '', personName: '' });
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

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
      navigate('/');
    } catch (err) {
      setError(mode === 'login' ? 'Invalid credentials' : (err.response?.data?.error || 'Registration failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center px-4">
      <div className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: 'linear-gradient(#f0c040 1px, transparent 1px), linear-gradient(90deg, #f0c040 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

      <div className="relative z-10 w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-accent mb-4">
            <span className="text-ink font-display font-extrabold text-lg">IT</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-white">InvestTrack</h1>
          <p className="text-muted text-sm mt-1">
            {mode === 'login' ? 'Sign in to your account' : 'Create a new account'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4">
          <div>
            <label className="label">Username</label>
            <input
              className="input"
              value={form.username}
              onChange={e => setForm(p => ({...p, username: e.target.value}))}
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
              onChange={e => setForm(p => ({...p, password: e.target.value}))}
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
                onChange={e => setForm(p => ({...p, personName: e.target.value}))}
                placeholder="e.g. Alice"
                autoComplete="name"
              />
              <p className="text-muted text-xs mt-1">This name tags all your data (transactions, investments, etc.)</p>
            </div>
          )}
          {error && <p className="text-rose text-sm">{error}</p>}
          <div className="space-y-2 mt-2">
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center flex">
              {loading
                ? (mode === 'login' ? 'Signing in…' : 'Creating…')
                : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => { setMode(m => m === 'login' ? 'register' : 'login'); setError(''); }}
              className="btn-secondary w-full justify-center flex text-sm"
            >
              {mode === 'login' ? 'Create new account' : 'Back to sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
