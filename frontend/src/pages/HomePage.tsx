import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi, contestApi } from '../services/api';

interface Contestant {
  id: string;
  registration_number: string;
  name: string;
  department: string;
}

interface AttemptInfo {
  id: string;
  status: string;
  language: string | null;
  score: number | null;
  submitted_at: string | null;
}

interface ContestInfo {
  id: string;
  title: string;
  duration_minutes: number;
  show_score_to_contestant: boolean;
}

export default function HomePage() {
  const navigate = useNavigate();
  const [contestant, setContestant] = useState<Contestant | null>(null);
  const [contest, setContest] = useState<ContestInfo | null>(null);
  const [attempt, setAttempt] = useState<AttemptInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [meResp, contestResp] = await Promise.all([
        authApi.me(),
        contestApi.getContest(),
      ]);
      setContestant(meResp.data.contestant);
      setContest(contestResp.data.contest);
      const att = contestResp.data.attempt;
      setAttempt(att);

      // If attempt is already in progress, automatically resume contest
      if (att && att.status === 'IN_PROGRESS') {
        sessionStorage.setItem('attempt_id', att.id);
        navigate('/contest', { replace: true });
        return;
      }
    } catch (err: any) {
      if (err.message.includes('401') || err.message.includes('Authentication')) {
        navigate('/login', { replace: true });
      } else {
        setError('Failed to load contest information. Please refresh.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStartContest = async () => {
    setStarting(true);
    setError('');
    try {
      const resp = await contestApi.startContest();
      const newAttempt = resp.data.attempt;

      // If in progress, go directly to contest
      if (newAttempt.status === 'IN_PROGRESS') {
        sessionStorage.setItem('attempt_id', newAttempt.id);
        navigate('/contest', { replace: true });
        return;
      }

      // Store attempt id for next steps
      sessionStorage.setItem('attempt_id', newAttempt.id);
      navigate('/rules', { replace: true });
    } catch (err: any) {
      if (err.message.includes('already completed')) {
        loadData();
      } else {
        setError(err.message || 'Failed to start contest');
      }
    } finally {
      setStarting(false);
    }
  };

  const handleLogout = async () => {
    await authApi.logout().catch(() => {});
    navigate('/login', { replace: true });
  };

  const isCompleted =
    attempt?.status === 'SUBMITTED' || attempt?.status === 'AUTO_SUBMITTED';
  const isInProgress = attempt?.status === 'IN_PROGRESS';

  if (loading) {
    return (
      <div className="page-center">
        <p className="loading-text">Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg-subtle)' }}>
      {/* Top bar */}
      <header style={{
        background: 'var(--color-bg)',
        borderBottom: '1px solid var(--color-border)',
        padding: 'var(--space-4) var(--space-8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{
            fontSize: 'var(--font-size-xs)',
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--color-text-muted)',
          }}>
            Hindusthan Institute of Technology
          </div>
          <div style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-light)',
          }}>
            Dept. of Artificial Intelligence and Data Science
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          {contestant && (
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
              {contestant.registration_number} — {contestant.name}
            </span>
          )}
          <button className="btn btn-secondary btn-sm" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </header>

      {/* Main content */}
      <main style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 'calc(100vh - 65px)',
        padding: 'var(--space-8)',
      }}>
        <div style={{ maxWidth: '480px', width: '100%' }}>
          {/* Page title */}
          <h1 style={{
            fontSize: 'var(--font-size-xl)',
            fontWeight: 700,
            textAlign: 'center',
            marginBottom: 'var(--space-8)',
            color: 'var(--color-text)',
          }}>
            Available Contest
          </h1>

          {error && (
            <div className="alert alert-danger mb-6">{error}</div>
          )}

          {/* Contest card */}
          <div className="contest-card">
            <div className="contest-card__title">
              {contest?.title || 'Debugging Contest'}
            </div>

            <div className="contest-card__meta">
              <div className="contest-card__row">
                <span className="contest-card__label">Duration</span>
                <span className="contest-card__value">
                  {contest?.duration_minutes || 60} Minutes
                </span>
              </div>
              <div className="contest-card__row">
                <span className="contest-card__label">Difficulty</span>
                <span className="contest-card__value">Medium</span>
              </div>
              <div className="contest-card__row">
                <span className="contest-card__label">Languages</span>
                <span className="contest-card__value">C • Java • Python</span>
              </div>
              <div className="contest-card__row">
                <span className="contest-card__label">Status</span>
                <span>
                  {isCompleted ? (
                    <span className="badge badge-success">Completed</span>
                  ) : isInProgress ? (
                    <span className="badge badge-warning">In Progress</span>
                  ) : (
                    <span className="badge badge-neutral">Not Attempted</span>
                  )}
                </span>
              </div>



              {isCompleted && attempt?.submitted_at && (
                <div className="contest-card__row">
                  <span className="contest-card__label">Submission</span>
                  <span className="contest-card__value" style={{ fontSize: 'var(--font-size-xs)' }}>
                    {new Date(attempt.submitted_at).toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            {/* Action button */}
            {isCompleted ? (
              <button className="btn btn-secondary btn-lg btn-full" disabled>
                Contest Completed
              </button>
            ) : isInProgress ? (
              <button
                className="btn btn-primary btn-lg btn-full"
                onClick={() => {
                  sessionStorage.setItem('attempt_id', attempt!.id);
                  navigate('/contest', { replace: true });
                }}
              >
                Continue Contest
              </button>
            ) : (
              <button
                className="btn btn-primary btn-lg btn-full"
                onClick={handleStartContest}
                disabled={starting}
                id="start-contest-btn"
              >
                {starting ? 'Starting...' : 'Start Contest'}
              </button>
            )}
          </div>

          {isCompleted && (
            <p className="text-center text-sm text-muted mt-6">
              You have completed the contest. No second attempt is allowed.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
