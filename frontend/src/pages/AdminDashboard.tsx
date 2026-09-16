import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi, authApi } from '../services/api';

type AdminView = 'dashboard' | 'contestants' | 'attempts' | 'leaderboard' | 'violations' | 'results';

function StatusBadge({ status }: { status: string }) {
  const classMap: Record<string, string> = {
    IN_PROGRESS: 'badge-warning',
    SUBMITTED: 'badge-success',
    AUTO_SUBMITTED: 'badge-danger',
    NOT_STARTED: 'badge-neutral',
    LANGUAGE_SELECTED: 'badge-neutral',
  };
  return <span className={`badge ${classMap[status] || 'badge-neutral'}`}>{status.replace('_', ' ')}</span>;
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [view, setView] = useState<AdminView>('dashboard');
  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const NAV_ITEMS: { id: AdminView; label: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'contestants', label: 'Contestants' },
    { id: 'attempts', label: 'Attempts' },
    { id: 'leaderboard', label: 'Leaderboard' },
    { id: 'violations', label: 'Violations' },
    { id: 'results', label: 'Results' },
  ];

  useEffect(() => {
    loadView(view);
  }, [view]);

  const loadView = async (v: AdminView) => {
    setLoading(true);
    setError('');
    try {
      let resp;
      switch (v) {
        case 'dashboard':   resp = await adminApi.getDashboard(); break;
        case 'contestants': resp = await adminApi.getContestants(); break;
        case 'attempts':    resp = await adminApi.getAttempts(); break;
        case 'leaderboard': resp = await adminApi.getLeaderboard(); break;
        case 'violations':  resp = await adminApi.getViolations(); break;
        case 'results':     resp = await adminApi.getResults(); break;
      }
      setData((prev: any) => ({ ...prev, [v]: resp?.data }));
    } catch (err: any) {
      if (err.message.includes('401') || err.message.includes('Admin')) {
        navigate('/admin/login', { replace: true });
      } else {
        setError(err.message || 'Failed to load data');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await authApi.adminLogout().catch(() => {});
    navigate('/admin/login', { replace: true });
  };

  const handleToggleContestant = async (id: string, currentActive: boolean) => {
    try {
      await adminApi.toggleContestant(id, !currentActive);
      loadView('contestants');
    } catch {}
  };

  const renderContent = () => {
    const d = data[view];
    if (loading) return <div className="loading-text">Loading...</div>;
    if (error) return <div className="alert alert-danger">{error}</div>;
    if (!d) return null;

    switch (view) {
      case 'dashboard': return <DashboardView data={d} />;
      case 'contestants': return <ContestantsView data={d} onToggle={handleToggleContestant} onRefresh={() => loadView('contestants')} />;
      case 'attempts': return <AttemptsView data={d} onRefresh={() => loadView('attempts')} />;
      case 'leaderboard': return <LeaderboardView data={d} />;
      case 'violations': return <ViolationsView data={d} />;
      case 'results': return <ResultsView data={d} />;
      default: return null;
    }
  };

  return (
    <div className="admin-layout">
      {/* Sidebar */}
      <div className="admin-sidebar">
        <div className="admin-sidebar__logo">
          <h2>Contest Admin</h2>
          <p>Debugging Contest</p>
        </div>
        <div className="admin-sidebar__nav">
          {NAV_ITEMS.map(item => (
            <div
              key={item.id}
              className={`admin-nav-item ${view === item.id ? 'admin-nav-item--active' : ''}`}
              onClick={() => setView(item.id)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && setView(item.id)}
              id={`nav-${item.id}`}
            >
              {item.label}
            </div>
          ))}
        </div>
        <div className="admin-sidebar__footer">
          <button className="btn btn-secondary btn-sm btn-full" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="admin-main">
        <div className="admin-content">
          <div className="admin-header">
            <h1 className="admin-title">
              {NAV_ITEMS.find(n => n.id === view)?.label}
            </h1>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => loadView(view)}
              disabled={loading}
            >
              Refresh
            </button>
          </div>
          <div className="admin-body">
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Sub-views
// ============================================================

function DashboardView({ data }: { data: any }) {
  const stats = data.stats || {};
  const items = [
    { label: 'Total Contestants', value: stats.total_contestants || 0 },
    { label: 'Not Started', value: stats.not_started || 0 },
    { label: 'In Progress', value: stats.in_progress || 0 },
    { label: 'Submitted', value: stats.submitted || 0 },
    { label: 'Auto Submitted', value: stats.auto_submitted || 0 },
    { label: 'Never Started', value: stats.never_started || 0 },
  ];

  return (
    <div className="admin-scrollable-content">
      <div className="stats-grid">
        {items.map(item => (
          <div key={item.label} className="stat-card">
            <div className="stat-card__value">{item.value}</div>
            <div className="stat-card__label">{item.label}</div>
          </div>
        ))}
      </div>

      {data.contests?.length > 0 && (
        <div className="card">
          <h3 style={{ marginBottom: 'var(--space-4)' }}>Contests</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Title</th><th>Duration</th><th>Status</th></tr>
              </thead>
              <tbody>
                {data.contests.map((c: any) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.title}</td>
                    <td>{c.duration_minutes} min</td>
                    <td>{c.is_active ? <span className="badge badge-success">Active</span> : <span className="badge badge-neutral">Inactive</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ContestantsView({ data, onToggle, onRefresh }: { data: any; onToggle: any; onRefresh: any }) {
  const [newReg, setNewReg] = useState('');
  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');

  const [resetReg, setResetReg] = useState('');
  const [resetMsg, setResetMsg] = useState('');
  const [resetError, setResetError] = useState('');

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string>('');

  const handleAdd = async () => {
    if (!newReg.trim()) {
      setAddError('Registration number is required');
      setAddSuccess('');
      return;
    }
    try {
      setAddError('');
      const res = await adminApi.addContestant({
        registration_number: newReg.trim(),
        name: newName.trim() || undefined,
      });
      const generatedPass = res.data?.generatedPassword || `${newReg.trim()}@hitech`;
      setAddSuccess(`Contestant ${newReg.trim()} added successfully! Password: ${generatedPass}`);
      setNewReg('');
      setNewName('');
      onRefresh();
    } catch (e: any) {
      setAddSuccess('');
      setAddError(e.response?.data?.error || e.message);
    }
  };

  const handleQuickReset = async () => {
    if (!resetReg.trim()) {
      setResetError('Please enter a registration number');
      setResetMsg('');
      return;
    }
    try {
      setResetError('');
      const res = await adminApi.resetAttemptByRegNo(resetReg.trim());
      setResetMsg(res.data?.message || `Reattempt granted for ${resetReg.trim()}`);
      setResetReg('');
      onRefresh();
    } catch (e: any) {
      setResetMsg('');
      setResetError(e.response?.data?.error || e.message);
    }
  };

  const handleDelete = async (contestantId: string, regNo: string) => {
    setDeletingId(contestantId);
    setActionError('');
    try {
      await adminApi.deleteContestant(contestantId);
      setConfirmDeleteId(null);
      onRefresh();
    } catch (e: any) {
      setActionError(`Failed to remove contestant ${regNo}: ${e.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="contestants-view-container">
      {/* Static top control cards: Add Contestant & Grant Reattempt (UNSCROLLABLE) */}
      <div className="contestants-static-controls">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
          {/* Add contestant card */}
          <div className="card">
            <h3 style={{ marginBottom: 'var(--space-2)' }}>Add Contestant</h3>
            <p className="text-muted text-xs mb-3">
              Enter register number. Password is automatically generated in the background as <code>&lt;regno&gt;@hitech</code>.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                <input
                  className="form-input"
                  style={{ flex: '1', minWidth: '160px' }}
                  placeholder="Register Number (e.g. 720824108125)"
                  value={newReg}
                  onChange={e => setNewReg(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                />
                <input
                  className="form-input"
                  style={{ flex: '1', minWidth: '160px' }}
                  placeholder="Student Name"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                <button className="btn btn-primary btn-sm" onClick={handleAdd}>
                  + Add Contestant
                </button>
                {newReg.trim() && (
                  <span className="text-xs text-muted">
                    Auto password: <strong style={{ color: 'var(--color-text)' }}>{newReg.trim()}@hitech</strong>
                  </span>
                )}
              </div>
            </div>
            {addError && <p className="text-danger text-sm mt-2">{addError}</p>}
            {addSuccess && <p className="text-sm mt-2" style={{ color: '#22c55e', fontWeight: 500 }}>{addSuccess}</p>}
          </div>

          {/* Quick Grant Reattempt card */}
          <div className="card">
            <h3 style={{ marginBottom: 'var(--space-2)' }}>Grant Reattempt Access</h3>
            <p className="text-muted text-xs mb-3">
              If a contestant accidentally closed the test or got locked out, enter their register number to clear their session and let them reattempt.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <input
                className="form-input"
                style={{ flex: '1', minWidth: '180px' }}
                placeholder="Register Number to reset"
                value={resetReg}
                onChange={e => setResetReg(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleQuickReset()}
              />
              <button className="btn btn-secondary btn-sm" onClick={handleQuickReset}>
                Grant Reattempt
              </button>
            </div>
            {resetError && <p className="text-danger text-sm mt-2">{resetError}</p>}
            {resetMsg && <p className="text-sm mt-2" style={{ color: '#22c55e', fontWeight: 500 }}>{resetMsg}</p>}
          </div>
        </div>

        {actionError && (
          <div className="alert alert-danger mb-4">
            {actionError}
          </div>
        )}
      </div>

      {/* Scrollable table: ONLY the names and list scroll */}
      <div className="admin-table-wrap contestants-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Reg. Number</th>
              <th>Name</th>
              <th>Attempt Status</th>
              <th>Language</th>
              <th>Score</th>
              <th>Violations</th>
              <th>Active</th>
              <th style={{ minWidth: '220px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(data.contestants || []).map((c: any) => (
              <tr key={c.id}>
                <td style={{ fontWeight: 600 }}>{c.registration_number}</td>
                <td>{c.name}</td>
                <td>{c.attempt_status ? <StatusBadge status={c.attempt_status} /> : <span className="badge badge-neutral">No Attempt</span>}</td>
                <td>{c.language || '—'}</td>
                <td>{c.score !== null && c.score !== undefined ? c.score : '—'}</td>
                <td>{c.violation_count ?? '—'}</td>
                <td>{c.is_active ? '✓' : '✗'}</td>
                <td>
                  <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => onToggle(c.id, c.is_active)}
                    >
                      {c.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    {confirmDeleteId === c.id ? (
                      <div style={{ display: 'inline-flex', gap: 'var(--space-1)', alignItems: 'center' }}>
                        <button
                          className="btn btn-danger btn-sm"
                          disabled={deletingId === c.id}
                          onClick={() => handleDelete(c.id, c.registration_number)}
                          style={{ backgroundColor: '#dc2626', borderColor: '#dc2626' }}
                        >
                          {deletingId === c.id ? 'Removing...' : 'Confirm Remove?'}
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          disabled={deletingId === c.id}
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => {
                          setActionError('');
                          setConfirmDeleteId(c.id);
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {(data.contestants || []).length === 0 && (
              <tr><td colSpan={8} className="text-center text-muted" style={{ padding: 'var(--space-8)' }}>No contestants registered.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AttemptsView({ data, onRefresh }: { data: any; onRefresh?: () => void }) {
  const handleResetAttempt = async (contestantId: string, regNo: string) => {
    if (!window.confirm(`Grant reattempt for ${regNo}?\nThis will clear their attempt and let them take the test again.`)) {
      return;
    }
    try {
      await adminApi.resetContestantAttempt(contestantId);
      alert(`Reattempt granted for ${regNo}. Previous attempt cleared.`);
      if (onRefresh) onRefresh();
    } catch (e: any) {
      alert(e.response?.data?.error || e.message);
    }
  };

  return (
    <div className="admin-table-wrap admin-scrollable-table">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Reg. Number</th>
            <th>Name</th>
            <th>Language</th>
            <th>Status</th>
            <th>Score</th>
            <th>Violations</th>
            <th>Started</th>
            <th>Submitted</th>
            <th>Reason</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {(data.attempts || []).map((a: any) => (
            <tr key={a.id}>
              <td style={{ fontWeight: 600 }}>{a.registration_number}</td>
              <td>{a.name}</td>
              <td>{a.language || '—'}</td>
              <td><StatusBadge status={a.status} /></td>
              <td>{a.score !== null && a.score !== undefined ? a.score : '—'}</td>
              <td>{a.violation_count}</td>
              <td style={{ fontSize: 'var(--font-size-xs)' }}>{a.started_at ? new Date(a.started_at).toLocaleString() : '—'}</td>
              <td style={{ fontSize: 'var(--font-size-xs)' }}>{a.submitted_at ? new Date(a.submitted_at).toLocaleString() : '—'}</td>
              <td style={{ fontSize: 'var(--font-size-xs)' }}>{a.auto_submit_reason || '—'}</td>
              <td>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }}
                  onClick={() => handleResetAttempt(a.contestant_id, a.registration_number)}
                >
                  Allow Reattempt
                </button>
              </td>
            </tr>
          ))}
          {(data.attempts || []).length === 0 && (
            <tr><td colSpan={10} className="text-center text-muted" style={{ padding: 'var(--space-8)' }}>No attempts recorded.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function LeaderboardView({ data }: { data: any }) {
  return (
    <div className="admin-table-wrap admin-scrollable-table">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Reg. Number</th>
            <th>Name</th>
            <th>Language</th>
            <th>Score</th>
            <th>Duration (min)</th>
            <th>Status</th>
            <th>Violations</th>
          </tr>
        </thead>
        <tbody>
          {(data.leaderboard || []).map((e: any) => (
            <tr key={e.registration_number}>
              <td style={{ fontWeight: 700, fontSize: 'var(--font-size-lg)' }}>#{e.rank}</td>
              <td style={{ fontWeight: 600 }}>{e.registration_number}</td>
              <td>{e.name}</td>
              <td>{e.language || '—'}</td>
              <td style={{ fontWeight: 700 }}>{e.score} / 100</td>
              <td>{e.duration_minutes ? Math.round(e.duration_minutes) : '—'}</td>
              <td><StatusBadge status={e.status} /></td>
              <td>{e.violation_count}</td>
            </tr>
          ))}
          {(data.leaderboard || []).length === 0 && (
            <tr><td colSpan={8} className="text-center text-muted" style={{ padding: 'var(--space-8)' }}>No submissions yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ViolationsView({ data }: { data: any }) {
  return (
    <div className="admin-table-wrap admin-scrollable-table">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Reg. Number</th>
            <th>Name</th>
            <th>Type</th>
            <th>Attempt Status</th>
          </tr>
        </thead>
        <tbody>
          {(data.violations || []).map((v: any) => (
            <tr key={v.id}>
              <td style={{ fontSize: 'var(--font-size-xs)' }}>{new Date(v.timestamp).toLocaleString()}</td>
              <td style={{ fontWeight: 600 }}>{v.registration_number}</td>
              <td>{v.name}</td>
              <td><span className="badge badge-danger">{v.type}</span></td>
              <td><StatusBadge status={v.attempt_status} /></td>
            </tr>
          ))}
          {(data.violations || []).length === 0 && (
            <tr><td colSpan={5} className="text-center text-muted" style={{ padding: 'var(--space-8)' }}>No violations recorded.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ResultsView({ data }: { data: any }) {
  return (
    <div className="admin-table-wrap admin-scrollable-table">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Reg. Number</th>
            <th>Name</th>
            <th>Language</th>
            <th>Status</th>
            <th>Score</th>
            <th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>Q5</th><th>Q6</th><th>Q7</th><th>Q8</th><th>Q9</th><th>Q10</th>
            <th>Violations</th>
          </tr>
        </thead>
        <tbody>
          {(data.results || []).map((r: any, i: number) => {
            const answers = r.answers || [];
            return (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{r.registration_number}</td>
                <td>{r.name}</td>
                <td>{r.language || '—'}</td>
                <td><StatusBadge status={r.status} /></td>
                <td style={{ fontWeight: 700 }}>{r.score !== null ? `${r.score} / 100` : '—'}</td>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => {
                  const ans = answers.find((a: any) => a.question_number === n);
                  return (
                    <td key={n} style={{ textAlign: 'center' }}>
                      {ans ? (
                        <span style={{ fontWeight: 600, color: (ans.points_earned ?? 0) > 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                          {ans.points_earned ?? 0}
                        </span>
                      ) : '—'}
                    </td>
                  );
                })}
                <td>{r.violation_count}</td>
              </tr>
            );
          })}
          {(data.results || []).length === 0 && (
            <tr><td colSpan={18} className="text-center text-muted" style={{ padding: 'var(--space-8)' }}>No results yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
