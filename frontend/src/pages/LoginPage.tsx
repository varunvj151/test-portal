import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi, contestApi } from '../services/api';

export default function LoginPage() {
  const navigate = useNavigate();
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Check if already logged in
  useEffect(() => {
    authApi.me()
      .then(() => navigate('/home', { replace: true }))
      .catch(() => {/* not logged in, stay */});
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!registrationNumber.trim() || !password.trim()) {
      setError('Please enter both registration number and password.');
      return;
    }

    setLoading(true);
    try {
      await authApi.login(registrationNumber.trim(), password);
      navigate('/home', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-center" style={{ background: 'var(--color-bg-subtle)' }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>
        {/* Institution Header */}
        <div className="text-center mb-8">
          <h1 style={{
            fontSize: 'var(--font-size-sm)',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-text)',
            marginBottom: 'var(--space-1)',
          }}>
            Hindusthan Institute of Technology
          </h1>
          <p style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-muted)',
            letterSpacing: '0.01em',
          }}>
            Department of Artificial Intelligence and Data Science
          </p>
          <div style={{
            margin: 'var(--space-6) 0 var(--space-2)',
            borderTop: '1px solid var(--color-border)',
          }} />
          <h2 style={{
            fontSize: 'var(--font-size-2xl)',
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}>
            Debugging Contest
          </h2>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', marginTop: 'var(--space-2)' }}>
            Sign in to continue
          </p>
        </div>

        <div className="card">
          <form onSubmit={handleLogin} noValidate>
            <div className="form-group mb-4">
              <label className="form-label" htmlFor="reg-number">
                Registration Number
              </label>
              <input
                id="reg-number"
                type="text"
                className="form-input"
                placeholder="e.g. 720824108119"
                value={registrationNumber}
                onChange={e => setRegistrationNumber(e.target.value)}
                autoComplete="username"
                autoFocus
                required
              />
            </div>

            <div className="form-group mb-6">
              <label className="form-label" htmlFor="password">
                Password
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  style={{ paddingRight: '2.5rem' }}
                  placeholder="Enter your password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '0.625rem',
                    background: 'none',
                    border: 'none',
                    padding: '0.25rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-text-muted)',
                    borderRadius: '4px',
                    transition: 'color 0.15s ease',
                  }}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="alert alert-danger mb-4" role="alert">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-lg btn-full"
              disabled={loading}
              id="login-btn"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-muted mt-6">
          Contact your administrator if you cannot log in.
        </p>
      </div>
    </div>
  );
}
