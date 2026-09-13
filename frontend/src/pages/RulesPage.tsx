import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const RULES = [
  'Contest duration is 60 minutes.',
  'Each contestant is allowed only one attempt.',
  'Select exactly one programming language before starting.',
  'The selected language cannot be changed after the test starts.',
  'Fullscreen mode is mandatory during the contest.',
  'Do not switch browser tabs or windows.',
  'Maximum allowed security violations are 3.',
  'Further violations after the allowed limit will cause automatic submission.',
  'Do not use external websites during the contest.',
  'Do not use AI assistants or browser AI extensions.',
  'Do not copy or paste question content or code.',
  'Do not use browser developer tools.',
  'Do not print the contest page.',
  'Do not use screenshot shortcuts.',
  'Do not share answers with other contestants.',
  'Code is automatically saved as you type.',
  'Code evaluation uses hidden test cases.',
  'Final submission cannot be undone.',
  'Once submitted, the contest cannot be attempted again.',
];

export default function RulesPage() {
  const navigate = useNavigate();
  const [agreed, setAgreed] = useState(false);
  const [attemptId, setAttemptId] = useState<string | null>(null);

  useEffect(() => {
    const id = sessionStorage.getItem('attempt_id');
    if (!id) {
      navigate('/home', { replace: true });
      return;
    }
    setAttemptId(id);
  }, []);

  const handleContinue = () => {
    if (!agreed) return;
    navigate('/language');
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
          Dept. of Artificial Intelligence and Data Science
        </div>
      </header>

      <main style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: 'var(--space-8)',
        minHeight: 'calc(100vh - 65px)',
      }}>
        <div style={{ maxWidth: '680px', width: '100%' }}>
          <h1 style={{
            fontSize: 'var(--font-size-2xl)',
            fontWeight: 700,
            marginBottom: 'var(--space-2)',
          }}>
            Rules and Regulations
          </h1>
          <p className="text-muted text-sm mb-6">
            Please read all rules carefully before proceeding.
          </p>

          <div className="card">
            <ul className="rules-list" id="rules-list">
              {RULES.map((rule, i) => (
                <li key={i}>{rule}</li>
              ))}
            </ul>

            <div className="rules-checkbox-row mt-6">
              <input
                type="checkbox"
                id="agree-checkbox"
                className="rules-checkbox"
                checked={agreed}
                onChange={e => setAgreed(e.target.checked)}
              />
              <label htmlFor="agree-checkbox" className="rules-checkbox-label">
                I have read and agree to all the rules and regulations.
              </label>
            </div>

            <div style={{ marginTop: 'var(--space-6)', display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                onClick={() => navigate('/home')}
              >
                Back
              </button>
              <button
                className="btn btn-primary btn-lg"
                onClick={handleContinue}
                disabled={!agreed}
                id="continue-btn"
              >
                Continue to Language Selection
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
