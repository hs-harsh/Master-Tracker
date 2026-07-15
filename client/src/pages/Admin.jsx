import { useEffect, useState, useCallback } from 'react';
import {
  Shield, Users, Trash2, Crown, BarChart3, RefreshCw, AlertTriangle,
  UserCheck, UserX, KeyRound, Lock, LockOpen, Mail, Database
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../hooks/useAuth';

function StatCard({ label, value, icon: Icon, color, sub }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5 flex items-center gap-4">
      <div className={`p-3 rounded-lg ${color} shrink-0`}>
        <Icon size={20} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-text">{value ?? '—'}</p>
        {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function Badge({ label, color }) {
  const colors = {
    green:  'bg-green-500/15 text-green-400 border-green-500/20',
    red:    'bg-red-500/15 text-red-400 border-red-500/20',
    amber:  'bg-amber-500/15 text-amber-400 border-amber-500/20',
    blue:   'bg-blue-500/15 text-blue-400 border-blue-500/20',
    muted:  'bg-surface text-muted border-border',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${colors[color] ?? colors.muted}`}>
      {label}
    </span>
  );
}

const PASSWORD_NOTE = `Passwords are stored as one-way bcrypt hashes — they cannot be read or reversed by anyone, including admins. This is how all secure systems work (Google, banks, etc.). You can remove a user's password to force OTP-only login.`;

export default function Admin() {
  const { personName } = useAuth();
  const [users, setUsers]   = useState([]);
  const [stats, setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');
  const [confirm, setConfirm] = useState(null);
  const [msg, setMsg]       = useState('');
  const [showPwNote, setShowPwNote] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [uRes, sRes] = await Promise.all([api.get('/admin/users'), api.get('/admin/stats')]);
      setUsers(uRes.data); setStats(sRes.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = (m, isErr = false) => {
    setMsg({ text: m, err: isErr });
    setTimeout(() => setMsg(''), 4000);
  };

  // ── Actions ─────────────────────────────────────────────────────────────────
  const toggleAdmin = async (u) => {
    try {
      await api.put(`/admin/users/${u.id}`, { is_admin: !u.is_admin });
      flash(`${u.is_admin ? 'Removed admin from' : 'Made admin'}: ${u.username}`);
      load();
    } catch (e) { flash(e.response?.data?.error || 'Failed', true); }
    setConfirm(null);
  };

  const toggleActive = async (u) => {
    try {
      await api.put(`/admin/users/${u.id}`, { is_active: !u.is_active });
      flash(`Account ${u.is_active ? 'disabled' : 'enabled'}: ${u.username}`);
      load();
    } catch (e) { flash(e.response?.data?.error || 'Failed', true); }
    setConfirm(null);
  };

  const removePassword = async (u) => {
    try {
      const { data } = await api.post(`/admin/users/${u.id}/remove-password`);
      flash(data.message);
      load();
    } catch (e) { flash(e.response?.data?.error || 'Failed', true); }
    setConfirm(null);
  };

  const clearData = async (u) => {
    try {
      const { data } = await api.delete(`/admin/users/${u.id}/data`);
      flash(`Cleared data for ${u.username}: ${data.deleted.transactions} tx, ${data.deleted.investments} inv`);
      load();
    } catch (e) { flash(e.response?.data?.error || 'Failed', true); }
    setConfirm(null);
  };

  const deleteUser = async (u) => {
    try {
      await api.delete(`/admin/users/${u.id}`);
      flash(`Deleted user: ${u.username}`);
      load();
    } catch (e) { flash(e.response?.data?.error || 'Failed', true); }
    setConfirm(null);
  };

  const confirmAction = (type, user) => setConfirm({ type, user });

  // ── Confirm modal content ────────────────────────────────────────────────────
  const CONFIRM_COPY = {
    'delete':          { title: 'Delete user',        btn: 'Delete',           btnColor: 'bg-red-500 hover:bg-red-600',    fn: deleteUser },
    'admin':           { title: 'Toggle admin',        btn: (u) => u.is_admin ? 'Remove Admin' : 'Make Admin', btnColor: 'bg-amber-500 hover:bg-amber-600', fn: toggleAdmin },
    'disable':         { title: 'Disable account',     btn: (u) => u.is_active ? 'Disable' : 'Enable', btnColor: (u) => u.is_active ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600', fn: toggleActive },
    'remove-password': { title: 'Remove password',     btn: 'Remove Password',  btnColor: 'bg-orange-500 hover:bg-orange-600', fn: removePassword },
    'clear-data':      { title: 'Clear all user data', btn: 'Clear Data',       btnColor: 'bg-red-500 hover:bg-red-600',    fn: clearData },
  };

  const CONFIRM_DESC = {
    'delete':          (u) => `Permanently delete ${u.username} and ALL their data (${u.transaction_count} transactions, ${u.investment_count} investments). Cannot be undone.`,
    'admin':           (u) => u.is_admin ? `Remove admin access from ${u.username}?` : `Grant admin access to ${u.username}?`,
    'disable':         (u) => u.is_active ? `Disable ${u.username}'s account? They won't be able to sign in.` : `Re-enable ${u.username}'s account?`,
    'remove-password': (u) => `Remove password for ${u.username}. They will only be able to sign in via OTP code.`,
    'clear-data':      (u) => `Delete all transactions, investments and cashflow for ${u.username}. The account itself is kept. Cannot be undone.`,
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/20 rounded-lg">
            <Shield size={22} className="text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text">Admin Dashboard</h1>
            <p className="text-sm text-muted">Signed in as {personName}</p>
          </div>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface border border-border text-sm text-muted hover:text-text transition-colors">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {msg && (
        <div className={`text-sm px-4 py-2 rounded-lg border ${msg.err ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-accent/10 border-accent/30 text-accent'}`}>
          {msg.text}
        </div>
      )}
      {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-2 rounded-lg">{error}</div>}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Users" value={stats.totalUsers} icon={Users} color="bg-blue-500"
            sub={`${stats.activeUsers} active`} />
          <StatCard label="Transactions" value={stats.totalTransactions} icon={BarChart3} color="bg-green-500" />
          <StatCard label="Investments" value={stats.totalInvestments} icon={BarChart3} color="bg-purple-500" />
          <StatCard label="Auth Methods" icon={KeyRound} color="bg-amber-500"
            value={`${stats.passwordUsers}pw / ${stats.otpOnlyUsers}otp`} />
        </div>
      )}

      {/* Password info banner */}
      <div className="bg-surface border border-border rounded-xl p-4 flex gap-3">
        <div className="p-2 bg-blue-500/15 rounded-lg shrink-0 h-fit">
          <Lock size={16} className="text-blue-400" />
        </div>
        <div className="text-sm">
          <button onClick={() => setShowPwNote(p => !p)} className="font-semibold text-text hover:text-accent transition-colors text-left">
            Why can't you see user passwords? {showPwNote ? '▲' : '▼'}
          </button>
          {showPwNote && <p className="text-muted mt-2 leading-relaxed">{PASSWORD_NOTE}</p>}
          {!showPwNote && <p className="text-muted mt-0.5">Click to learn more about password security.</p>}
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Users size={16} className="text-muted" />
          <h2 className="font-semibold text-text">All Users</h2>
          <span className="ml-auto text-xs text-muted">{users.length} registered</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-muted text-sm">Loading...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background/50">
                  <th className="text-left px-4 py-3 text-muted font-medium whitespace-nowrap">ID</th>
                  <th className="text-left px-4 py-3 text-muted font-medium whitespace-nowrap">Email</th>
                  <th className="text-left px-4 py-3 text-muted font-medium whitespace-nowrap">Name</th>
                  <th className="text-left px-4 py-3 text-muted font-medium whitespace-nowrap">People</th>
                  <th className="text-right px-4 py-3 text-muted font-medium whitespace-nowrap">Tx</th>
                  <th className="text-right px-4 py-3 text-muted font-medium whitespace-nowrap">Inv</th>
                  <th className="text-left px-4 py-3 text-muted font-medium whitespace-nowrap">Auth</th>
                  <th className="text-left px-4 py-3 text-muted font-medium whitespace-nowrap">Last Login</th>
                  <th className="text-left px-4 py-3 text-muted font-medium whitespace-nowrap">Status</th>
                  <th className="text-left px-4 py-3 text-muted font-medium whitespace-nowrap">Role</th>
                  <th className="text-center px-4 py-3 text-muted font-medium whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className={`border-b border-border/50 transition-colors ${u.is_active === false ? 'opacity-50' : 'hover:bg-background/30'}`}>
                    <td className="px-4 py-3 text-muted">#{u.id}</td>
                    <td className="px-4 py-3 text-text font-medium max-w-[180px] truncate">{u.username}</td>
                    <td className="px-4 py-3 text-muted">{u.person_name || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(u.persons || []).map(p => (
                          <span key={p} className="px-1.5 py-0.5 rounded-full bg-accent/15 text-accent text-xs">{p}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-muted">{u.transaction_count}</td>
                    <td className="px-4 py-3 text-right text-muted">{u.investment_count}</td>
                    <td className="px-4 py-3">
                      {u.has_password
                        ? <Badge label="Password" color="blue" />
                        : <Badge label="OTP only" color="muted" />}
                    </td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap text-xs">
                      {u.last_login_at
                        ? new Date(u.last_login_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                        : 'Never'}
                    </td>
                    <td className="px-4 py-3">
                      {u.is_active !== false
                        ? <Badge label="Active" color="green" />
                        : <Badge label="Disabled" color="red" />}
                    </td>
                    <td className="px-4 py-3">
                      {u.is_admin
                        ? <Badge label="Admin" color="amber" />
                        : <Badge label="User" color="muted" />}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        {/* Toggle admin */}
                        <button onClick={() => confirmAction('admin', u)} title={u.is_admin ? 'Remove admin' : 'Make admin'}
                          className={`p-1.5 rounded-lg transition-colors ${u.is_admin ? 'text-amber-400 hover:bg-amber-400/10' : 'text-muted hover:text-amber-400 hover:bg-amber-400/10'}`}>
                          <Crown size={14} />
                        </button>
                        {/* Enable / disable */}
                        <button onClick={() => confirmAction('disable', u)} title={u.is_active !== false ? 'Disable account' : 'Enable account'}
                          className={`p-1.5 rounded-lg transition-colors ${u.is_active === false ? 'text-green-400 hover:bg-green-400/10' : 'text-muted hover:text-orange-400 hover:bg-orange-400/10'}`}>
                          {u.is_active !== false ? <UserX size={14} /> : <UserCheck size={14} />}
                        </button>
                        {/* Remove password */}
                        {u.has_password && (
                          <button onClick={() => confirmAction('remove-password', u)} title="Remove password (force OTP)"
                            className="p-1.5 rounded-lg text-muted hover:text-orange-400 hover:bg-orange-400/10 transition-colors">
                            <LockOpen size={14} />
                          </button>
                        )}
                        {/* Clear data */}
                        <button onClick={() => confirmAction('clear-data', u)} title="Clear all data"
                          className="p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors">
                          <Database size={14} />
                        </button>
                        {/* Delete user */}
                        <button onClick={() => confirmAction('delete', u)} title="Delete user"
                          className="p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Action legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted px-1">
        {[
          { icon: Crown, label: 'Toggle admin' },
          { icon: UserX, label: 'Disable/enable account' },
          { icon: LockOpen, label: 'Remove password → force OTP' },
          { icon: Database, label: 'Clear all data (keep account)' },
          { icon: Trash2, label: 'Delete account + all data' },
        ].map(({ icon: Icon, label }) => (
          <span key={label} className="flex items-center gap-1.5">
            <Icon size={12} /> {label}
          </span>
        ))}
      </div>

      {/* Confirm modal */}
      {confirm && (() => {
        const cfg = CONFIRM_COPY[confirm.type];
        const btnLabel = typeof cfg.btn === 'function' ? cfg.btn(confirm.user) : cfg.btn;
        const btnColor = typeof cfg.btnColor === 'function' ? cfg.btnColor(confirm.user) : cfg.btnColor;
        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-surface border border-border rounded-2xl p-6 max-w-sm w-full shadow-2xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-red-500/20 rounded-lg">
                  <AlertTriangle size={18} className="text-red-400" />
                </div>
                <h3 className="font-semibold text-text">{cfg.title}</h3>
              </div>
              <p className="text-sm text-muted mb-5">{CONFIRM_DESC[confirm.type](confirm.user)}</p>
              <div className="flex gap-3">
                <button onClick={() => setConfirm(null)}
                  className="flex-1 px-4 py-2 rounded-lg border border-border text-muted hover:text-text text-sm transition-colors">
                  Cancel
                </button>
                <button onClick={() => cfg.fn(confirm.user)}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors ${btnColor}`}>
                  {btnLabel}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
