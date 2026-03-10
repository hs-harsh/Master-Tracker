import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function Login() {
  const [form, setForm] = useState({ username: 'hskv', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.username, form.password);
      navigate('/');
    } catch {
      setError('Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    setError('');
    setLoading(true);
    try {
      await register(form.username, form.password);
      navigate('/');
    } catch (err) {
      const msg = err.response?.data?.error || 'Registration failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center px-4">
      {/* Background grid */}
      <div className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: 'linear-gradient(#f0c040 1px, transparent 1px), linear-gradient(90deg, #f0c040 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

      <div className="relative z-10 w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-accent mb-4">
            <span className="text-ink font-display font-extrabold text-lg">H·K</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-white">InvestTrack</h1>
          <p className="text-muted text-sm mt-1">Harsh & Kirti · Private</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="card space-y-4">
          <div>
            <label className="label">Username</label>
            <input
              className="input"
              value={form.username}
              onChange={e => setForm(p => ({...p, username: e.target.value}))}
              autoComplete="username"
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              type="password"
              className="input"
              value={form.password}
              onChange={e => setForm(p => ({...p, password: e.target.value}))}
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </div>
          {error && <p className="text-rose text-sm">{error}</p>}
          <div className="space-y-2 mt-2">
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center flex"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={handleRegister}
              className="btn-secondary w-full justify-center flex text-sm"
            >
              {loading ? 'Please wait…' : 'Create new account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
