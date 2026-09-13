import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../services/api';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authApi.adminLogin(username.trim(), password);
      navigate('/admin/dashboard', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-center" style={{ background: 'var(--color-bg-subtle)' }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>
        <div className="text-center mb-8">
          <h1 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)' }}>
            Hindusthan Institute of Technology
          </h1>
          <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700 }}>Admin Portal</h2>
          <p className="text-muted text-sm mt-2">Debugging Contest Administration</p>
        </div>

        <div className="card">
          <form onSubmit={handleLogin} noValidate>
            <div className="form-group mb-4">
              <label className="form-label" htmlFor="admin-username">Username</label>
              <input
                id="admin-username"
                type="text"
                className="form-input"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="form-group mb-6">
              <label className="form-label" htmlFor="admin-password">Password</label>
              <input
                id="admin-password"
                type="password"
                className="form-input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <div className="alert alert-danger mb-4">{error}</div>}
            <button type="submit" className="btn btn-primary btn-lg btn-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
