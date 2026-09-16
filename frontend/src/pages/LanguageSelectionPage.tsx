import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { loader } from '@monaco-editor/react';
import { contestApi } from '../services/api';

const LANGUAGES = [
  { id: 'C', label: 'C', description: 'GCC Compiler' },
  { id: 'JAVA', label: 'Java', description: 'OpenJDK' },
  { id: 'PYTHON', label: 'Python', description: 'Python 3' },
];

export default function LanguageSelectionPage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attemptId, setAttemptId] = useState<string | null>(null);

  useEffect(() => {
    const id = sessionStorage.getItem('attempt_id');
    if (!id) {
      navigate('/home', { replace: true });
      return;
    }
    setAttemptId(id);

    // Guard: If attempt is already in progress or language is already set, send straight to contest
    contestApi.getAttempt().then(res => {
      const att = res.data?.attempt;
      if (att && (att.status === 'IN_PROGRESS' || att.language)) {
        navigate('/contest', { replace: true });
      } else if (att && (att.status === 'SUBMITTED' || att.status === 'AUTO_SUBMITTED')) {
        navigate('/home', { replace: true });
      }
    }).catch(() => {});

    // Warm up and prefetch Monaco Editor in background so contest page opens instantly
    loader.init().catch(() => {});
  }, []);

  const handleConfirm = async () => {
    if (!selected || !attemptId) return;
    setLoading(true);
    setError('');

    try {
      // Request fullscreen before starting
      if (document.documentElement.requestFullscreen) {
        try {
          await document.documentElement.requestFullscreen();
        } catch {
          // Fullscreen rejected — we'll handle this in contest page
        }
      }

      await contestApi.setLanguage(attemptId, selected);
      navigate('/contest', { replace: true });
    } catch (err: any) {
      if (err.message.includes('Language cannot be changed')) {
        setError('Language has already been set. Redirecting to contest...');
        setTimeout(() => navigate('/contest', { replace: true }), 1500);
      } else if (err.message.includes('already submitted')) {
        navigate('/home', { replace: true });
      } else {
        setError(err.message || 'Failed to set language. Please try again.');
      }
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg-subtle)' }}>
      {/* Header */}
      <header style={{
        background: 'var(--color-bg)',
        borderBottom: '1px solid var(--color-border)',
        padding: 'var(--space-4) var(--space-8)',
      }}>
        <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
          Hindusthan Institute of Technology
        </div>
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)' }}>
          Debugging Contest
        </div>
      </header>

      <main style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 'calc(100vh - 65px)',
        padding: 'var(--space-8)',
      }}>
        <div style={{ maxWidth: '540px', width: '100%', textAlign: 'center' }}>
          <h1 style={{
            fontSize: 'var(--font-size-2xl)',
            fontWeight: 700,
            marginBottom: 'var(--space-2)',
          }}>
            Select Your Programming Language
          </h1>
          <p className="text-muted text-sm mb-2">
            Choose carefully. This cannot be changed after the contest starts.
          </p>

          <div className="alert alert-warning mb-6" style={{ textAlign: 'left' }}>
            <strong>Important:</strong> Your language selection is permanent.
            All questions will be provided in the selected language only.
          </div>

          <div className="lang-grid">
            {LANGUAGES.map(lang => (
              <div
                key={lang.id}
                id={`lang-${lang.id.toLowerCase()}`}
                className={`lang-card ${selected === lang.id ? 'lang-card--selected' : ''}`}
                onClick={() => !loading && setSelected(lang.id)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && !loading && setSelected(lang.id)}
                aria-pressed={selected === lang.id}
                aria-label={`Select ${lang.label}`}
              >
                <div className="lang-card__name">{lang.label}</div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                  {lang.description}
                </div>
                {selected === lang.id && (
                  <div style={{
                    marginTop: 'var(--space-2)',
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: 'var(--color-accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: '12px',
                  }}>
                    ✓
                  </div>
                )}
              </div>
            ))}
          </div>

          {error && (
            <div className="alert alert-danger mb-4">{error}</div>
          )}

          <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center' }}>
            <button
              className="btn btn-secondary"
              onClick={() => navigate('/rules')}
              disabled={loading}
            >
              Back
            </button>
            <button
              className="btn btn-primary btn-lg"
              onClick={handleConfirm}
              disabled={!selected || loading}
              id="confirm-language-btn"
            >
              {loading ? 'Starting Contest...' : `Start Contest in ${selected || '?'}`}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
